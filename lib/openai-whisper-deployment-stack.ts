import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam'
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker'
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';


export class OpenaiWhisperDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imageUri = "014661450282.dkr.ecr.eu-west-1.amazonaws.com/whisper-asr:latest";
    const model_name = "whisper-asr";
    const config_name = "whisper-asr-config";
    const endpoint_name = "whisper-asr-endpoint";
    const instance_type = "ml.g4dn.xlarge";
    let bucketName = `whisper-asr-model-bucket-${Math.floor(Math.random() * 1000000)}`;


    // Create an S3 bucket
    const modelBucket = new s3.Bucket(this, 'WhisperASRModelBucket', {
      bucketName: bucketName, // Random bucket name
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete bucket when stack is deleted
    });

    const sgRole = new iam.Role(this, 'sgRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'Model deployment role',
    });

    sgRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "s3:ListBucket",
        "s3:PutObject",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "ecr:ListTagsForResource",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:GetAuthorizationToken", // Add this permission
        "ecr:BatchCheckLayerAvailability",
        "sagemaker:*"
      ],
      resources: ['*'],
    }));

    const containerDefinitionProperty: sagemaker.CfnModel.ContainerDefinitionProperty = {
      image: imageUri,
      mode: 'SingleModel',
    };

    // Create SNS Topics
    const successTopic = new sns.Topic(this, 'SuccessTopic', {
      displayName: 'Success Topic',
    });

    const errorTopic = new sns.Topic(this, 'ErrorTopic', {
      displayName: 'Error Topic',
    });    

    const sagemakerModel = new sagemaker.CfnModel(this, 'MyCfnModel', {
      executionRoleArn: sgRole.roleArn,
      modelName: model_name,
      primaryContainer: containerDefinitionProperty
    });
    sagemakerModel.node.addDependency(sgRole)
    
    const asyncInferenceConfigProperty: sagemaker.CfnEndpointConfig.AsyncInferenceConfigProperty = {
      outputConfig: {
        // kmsKeyId: 'kmsKeyId',
        notificationConfig: {
          errorTopic: errorTopic.topicArn,
          // includeInferenceResponseIn: ['includeInferenceResponseIn'],
          successTopic: successTopic.topicArn,
        },
        s3OutputPath: `s3://${modelBucket.bucketName}/output`, // Required
        // s3FailurePath: `s3://${modelBucket.bucketName}/failure`, // Optional
      },
    
      // the properties below are optional
      clientConfig: {
        maxConcurrentInvocationsPerInstance: 5,
      },
    };
    
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
    
    const cfnEndpoint = new sagemaker.CfnEndpoint(this, 'MyCfnEndpoint', {
      endpointConfigName: config_name,
      endpointName: endpoint_name,
    });
    cfnEndpoint.node.addDependency(cfnEndpointConfig)

    // Add CloudFormation outputs for the model and endpoint names
    new cdk.CfnOutput(this, 'ModelNameOutput', {
      value: model_name,
      description: 'The name of the deployed SageMaker model',
    });

    new cdk.CfnOutput(this, 'EndpointNameOutput', {
      value: endpoint_name,
      description: 'The name of the deployed SageMaker endpoint',
    });

  }
}



