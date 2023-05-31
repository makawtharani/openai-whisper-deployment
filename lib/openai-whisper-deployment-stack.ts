import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam'
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker'
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

export class OpenaiWhisperDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Set up constants for resources names
    const imageUri = "014661450282.dkr.ecr.eu-west-1.amazonaws.com/whisper-asr-v1";
    const model_name = `whisper-asr-${Math.floor(Math.random() * 1000000)}`;
    const config_name = `whisper-asr-config-${Math.floor(Math.random() * 1000000)}`;
    const endpoint_name = `whisper-asr-endpoint-${Math.floor(Math.random() * 1000000)}`;
    const instance_type = "ml.g4dn.xlarge";
    let bucketName = `whisper-asr-model-bucket-${Math.floor(Math.random() * 1000000)}`;


    // Create an S3 bucket
    // The bucket will be automatically deleted when the stack is deleted
    const modelBucket = new s3.Bucket(this, 'WhisperASRModelBucket', {
      bucketName: bucketName, // Random bucket name
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete bucket when stack is deleted
    });

    // Create a role for SageMaker to assume
    const sgRole = new iam.Role(this, 'sgRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'Model deployment role',
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              // Allow the role to read, put, delete, and list objects in your S3 bucket
              actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
              resources: [modelBucket.bucketArn, `${modelBucket.bucketArn}/*`]
            }),
          ],
        }),
        // Allow the role to create and write to CloudWatch Logs for logging
        CloudWatchAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
              resources: ["arn:aws:logs:*:*:*"]
            }),
          ],
        }),
        // Allow the role to pull images from your ECR repository
        ECRAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetAuthorizationToken"
              ],
              resources: [
                "*"
              ]
            }),
          ],
        }),
        // Allow the role to create SageMaker resources
        SageMakerAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "sagemaker:CreateModel",
                "sagemaker:CreateEndpoint",
                "sagemaker:CreateEndpointConfig"
              ],
              resources: ['*']
            }),
          ],
        }),
      }
    })

    // Add a bucket policy that allows the SageMaker role to perform the specified actions
    const bucketPolicy = new iam.PolicyStatement({
      actions: [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ],
      principals: [new iam.ArnPrincipal(sgRole.roleArn)],
      resources: [modelBucket.bucketArn, `${modelBucket.bucketArn}/*`]
    });    
    modelBucket.addToResourcePolicy(bucketPolicy);

    // Define the properties of the SageMaker container
    const containerDefinitionProperty: sagemaker.CfnModel.ContainerDefinitionProperty = {
      image: imageUri,
      mode: 'SingleModel',
    };

    // Create SNS Topics for success and error notifications
    const successTopic = new sns.Topic(this, 'SuccessTopic', {
      displayName: 'Success Topic',
    });
    const errorTopic = new sns.Topic(this, 'ErrorTopic', {
      displayName: 'Error Topic',
    });    

    // Allow the role to publish to the SNS topics
    sgRole.addToPolicy(new iam.PolicyStatement({
      actions: ["sns:Publish"],
      resources: [successTopic.topicArn, errorTopic.topicArn]
    }));

    // Create a SageMaker model
    const sagemakerModel = new sagemaker.CfnModel(this, 'MyCfnModel', {
      executionRoleArn: sgRole.roleArn,
      modelName: model_name,
      primaryContainer: containerDefinitionProperty
    });
    sagemakerModel.node.addDependency(sgRole)

    // Set up asynchronous inference configuration
    const asyncInferenceConfigProperty: sagemaker.CfnEndpointConfig.AsyncInferenceConfigProperty = {
      outputConfig: {
        notificationConfig: {
          errorTopic: errorTopic.topicArn,
          successTopic: successTopic.topicArn,
        },
        s3OutputPath: `s3://${modelBucket.bucketName}/output`, // Required
      },
      clientConfig: {
        maxConcurrentInvocationsPerInstance: 5,
      },
    };

    // Create a SageMaker endpoint configuration
    const cfnEndpointConfig = new sagemaker.CfnEndpointConfig(this, 'MyCfnEndpointConfig', {
      productionVariants: [{
        initialVariantWeight: 1.0,
        modelName: model_name,
        variantName: 'default',
        initialInstanceCount: 1,
        instanceType: instance_type
      }],
      endpointConfigName: config_name,
      asyncInferenceConfig: asyncInferenceConfigProperty, // added this line
    });
    cfnEndpointConfig.node.addDependency(sagemakerModel)

    // Create a SageMaker endpoint
    const cfnEndpoint = new sagemaker.CfnEndpoint(this, 'MyCfnEndpoint', {
      endpointConfigName: config_name,
      endpointName: endpoint_name,
    });
    cfnEndpoint.node.addDependency(cfnEndpointConfig)

    // Create a DynamoDB table to store job results
    const table = new dynamodb.Table(this, 'JobResultsTable', {
      partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'result', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,  // Use on-demand billing mode
    });

    // Create a Lambda function to process job results and store them in the DynamoDB table
    const jobResultsLambda = new lambda.Function(this, 'JobResultsFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,  // Execution environment
      code: lambda.Code.fromAsset('whisper-sns-lambda'),  // Code loaded from the "whisper-sns-lambda" directory
      handler: 'handler.main',  // File is "handler", function is "main"
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    // Use SNS topics as event sources for the Lambda function
    jobResultsLambda.addEventSource(new lambdaEventSources.SnsEventSource(successTopic));
    jobResultsLambda.addEventSource(new lambdaEventSources.SnsEventSource(errorTopic));

    // Grant the Lambda function write access to the DynamoDB table
    table.grantWriteData(jobResultsLambda);

    // Output the names of the created resources for reference
    new cdk.CfnOutput(this, 'BucketNameOutput', {
      value: bucketName,
      description: 'The name of the created S3 bucket',
    });
    new cdk.CfnOutput(this, 'EndpointNameOutput', {
      value: endpoint_name,
      description: 'The name of the deployed SageMaker endpoint',
    });

  }
}



