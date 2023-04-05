import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as sfn from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export class OpenaiWhisperDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const s3bucket = new s3.Bucket(scope, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: "whisper-openai-model-bucket"
    });

    const modeldeploy = new s3deploy.BucketDeployment(scope, 'modelDeployment', {
      sources: [s3deploy.Source.asset('./model/model.tar.gz')],
      destinationBucket: s3bucket,
      destinationKeyPrefix: 'whisper/model' 
    });
    modeldeploy.node.addDependency(s3bucket);

    const myCustomPolicy = new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: [
          'sagemaker:CreateEndpoint',
          'sagemaker:CreateEndpointConfig',
          'sagemaker:DescribeEndpoint',
          'sagemaker:CreateModel',
          'sagemaker:DescribeModel'
        ],
        principals: [new iam.AccountRootPrincipal()],
        resources: ['*'],
      })],
    });

    const lambdaRole = new iam.Role(this, 'lambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'model deployment role',
    });

    const modelDeploymentLambda = new lambda.Function(this, 'NewFunction', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('./lambda/source/lambda_handler.py'),
      role: lambdaRole, // user-provided role,
      environment: {
        'MODEL_S3_LOCATION': 's3://'+s3bucket.bucketName+'/whisper/model/model.tar.gz',
        'ENDPOINT_NAME': 'openai-whisper-large-v2',
        'SAGEMAKER_ROLE': lambdaRole.roleArn
      },
      timeout: cdk.Duration.seconds(900)
    });

    const stateMachine = new sfn.StateMachine(this, 'MyStateMachine', {
      definition: new tasks.LambdaInvoke(this, "MyLambdaTask", {
        lambdaFunction: modelDeploymentLambda
      }).next(new sfn.Succeed(this, "Model Deployed"))
    });
    
  }
}
