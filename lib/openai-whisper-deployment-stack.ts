import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
// import * as lambdaPy from '@aws-cdk/aws-lambda-python'

import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export class OpenaiWhisperDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const s3bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: "whisper-openai-model-bucket"+"fb364g2f"
    });

    const modeldeploy = new s3deploy.BucketDeployment(this, 'modelDeployment', {
      sources: [s3deploy.Source.asset('./model')],
      destinationBucket: s3bucket,
      destinationKeyPrefix: 'whisper/model' 
    });
    modeldeploy.node.addDependency(s3bucket);

    const lambdaPackageDeploy = new s3deploy.BucketDeployment(this, 'lambdaPackageDeploy', {
      sources: [s3deploy.Source.asset('./lambda/package')],
      destinationBucket: s3bucket,
      destinationKeyPrefix: 'lambda/package' 
    });
    modeldeploy.node.addDependency(s3bucket);

    const sgCustomPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "ecr:ListTagsForResource",
          "ecr:*",
          "sagemaker:*"
        ],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        resources: [
          s3bucket.bucketArn,
          s3bucket.bucketArn+'/*'
        ],
      })
    ],
    });

    const sgRole = new iam.Role(this, 'sgRole', {
      assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
      description: 'model deployment role',
      inlinePolicies: {
        'rolePolicyDocument': sgCustomPolicy
      }
    });

    const lambdaCustomPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "iam:PassRole",
          "logs:CreateLogStream",
          "s3:ListBucket",
          "sagemaker:*",
          "logs:CreateLogGroup",
          "logs:PutLogEvents",
          "ecr:*"
        ],
        resources: ['*'],
      })
    ],
    });

    const lambdaRole = new iam.Role(this, 'lambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'model deployment role',
      inlinePolicies: {
        'rolePolicyDocument': lambdaCustomPolicy
      }
    });

    // Create a Lambda layer from the S3 package
    const lambdaLayer = new lambda.LayerVersion(this, 'lambdaLayer', {
      code: lambda.Code.fromBucket(s3bucket, 'lambda/package/python.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
      description: 'sagemaker library',
    });
    lambdaLayer.node.addDependency(lambdaPackageDeploy)

    const modelDeploymentLambda = new lambda.Function(this, 'NewFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.lambda_handler', // index
      code: lambda.Code.fromAsset('./lambda/source'),
      role: lambdaRole, // user-provided role,
      environment: {
        'MODEL_S3_LOCATION': 's3://'+s3bucket.bucketName+'/whisper/model/model.tar.gz',
        'ENDPOINT_NAME': 'openai-whisper-large-v2',
        'SAGEMAKER_ROLE': sgRole.roleArn
      },
      layers: [
        lambdaLayer
      ],
      timeout: cdk.Duration.seconds(900)
    });
    modelDeploymentLambda.node.addDependency(lambdaRole)
    modelDeploymentLambda.node.addDependency(lambdaLayer)

    const stateMachine = new sfn.StateMachine(this, 'MyStateMachine', {
      definition: new tasks.LambdaInvoke(this, "MyLambdaTask", {
        lambdaFunction: modelDeploymentLambda
      }).next(new sfn.Succeed(this, "Model Deployed"))
    });
    stateMachine.node.addDependency(sgRole)
    
  }
}
