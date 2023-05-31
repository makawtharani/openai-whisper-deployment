# Welcome to OpenAI Whisper ASR Deployment project

This AWS CDK stack facilitates the deployment of the OpenAI Whisper ASR model on SageMaker, and handling of inference results using S3, SNS, DynamoDB, and Lambda.
The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands
* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Requirements
* Node.js version 10.x or later
* AWS CLI version 2.x or later
* AWS account with necessary permissions
* Familiarity with AWS services and CDK

## Description
The script sets up an infrastructure in AWS to automatically deploy a Whisper ASR model using Amazon SageMaker. It also sets up resources to store, manage and process model inference results.

## Resources
1. S3 Bucket: An S3 bucket is created to store the model and inference results. The bucket is automatically deleted when the stack is deleted.
2. IAM Role: An IAM Role is set up with appropriate permissions for SageMaker to access the S3 bucket, CloudWatch Logs, and to pull images from the ECR repository.
3. SageMaker Model: The script defines a SageMaker model, including a container definition property and sets up an endpoint configuration for asynchronous inference.
4. SNS Topics: Two SNS topics are created for success and error notifications.
5. DynamoDB Table: A DynamoDB table is created to store job results.
6. Lambda Function: A Lambda function is created to process job results and store them in the DynamoDB table. The function uses the SNS topics as event sources.

## Output
At the end, the script provides output which includes the names of the created S3 bucket and the deployed SageMaker endpoint.

## Functionality
When a job result is produced by the SageMaker model, it is sent to the appropriate SNS topic depending on whether the job was successful or not. 
The SNS topic triggers the Lambda function, which processes the result and stores it in the DynamoDB table.
The following diagram shows the architecture and workflow of the solution.
![alt text](https://github.com/makawtharani/openai-whisper-deployment/documentation/arch.png?raw=true)


## Asynchronous inference
Amazon SageMaker Asynchronous Inference is a new capability in SageMaker that queues incoming requests and processes them asynchronously. 
This option is ideal for requests with large payload sizes (up to 1GB), long processing times (up to one hour), and near real-time latency requirements. 
Asynchronous Inference enables you to save on costs by autoscaling the instance count to zero when there are no requests to process, so you only pay when your endpoint is processing requests.
### How it works
Creating an asynchronous inference endpoint is similar to creating real-time inference endpoints. You can use your existing SageMaker models and only need to specify the AsyncInferenceConfig object while creating your endpoint configuration with the EndpointConfig field in the CreateEndpointConfig API. The following diagram shows the architecture and workflow of Asynchronous Inference.
![alt text](https://github.com/makawtharani/openai-whisper-deployment/documentation/async-architecture.png?raw=true)
To invoke the endpoint, you need to place the request payload in Amazon S3 and provide a pointer to this payload as a part of the InvokeEndpointAsync request. 
Upon invocation, SageMaker queues the request for processing and returns an identifier and output location as a response. 
Upon processing, SageMaker places the result in the Amazon S3 location. We receive success or error notifications with Amazon SNS.

## Additional Material 
### The ECR Image for the Whisper Model
It is Flask-based Python server that uses the OpenAI Whisper ASR system to transcribe audio files. This server listens for HTTP POST requests containing information about an audio file, downloads the file from an Amazon S3 bucket, transcribes it, and then uploads the transcription back to the S3 bucket.
For more info please check app>asr_server.py and app>Dockerfile

### Script to invoke the endpoint
The script invokes an Amazon SageMaker endpoint for asynchronous inference. The asynchronous inference is performed on the input audio file that resides in an Amazon S3 bucket, and the transcription is returned.
Before running the script, you need to have AWS CLI set up on your local machine or server and your AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and optionally AWS_SESSION_TOKEN) properly configured.
for more info please check whisper-invoke>whisper.py
