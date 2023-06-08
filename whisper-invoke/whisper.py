import boto3
from botocore.exceptions import BotoCoreError, ClientError
import json

# Initialize the Boto3 clients
sagemaker_runtime = boto3.client('sagemaker-runtime')
s3 = boto3.client('s3')

# Endpoint and SNS Topic names
endpoint_name = '' # enter the name

s3_bucket = '' # enter s3 bucket for the file you want to transcribe
s3_key = '' # enter s3_key for the file you want to transcribe
job_id= '' # enter job id
language= '' # enter language
ddbtable='' # enter dynamodb table name

payload = {
    "s3_bucket":s3_bucket,
    "s3_key": s3_key,
    "job_id": job_id,
    "language": language,
    "ddbtable": ddbtable
}

s3_key_for_input = s3_key.rsplit('/', 1)[0] + '/asynch_input_file.json'

# Save payload to S3
try:
    s3.put_object(
        Body=json.dumps(payload),
        Bucket=s3_bucket,
        Key=s3_key_for_input
    )
    print("File Saved.")
except BotoCoreError as e:
    print(f"Error saving JSON to S3: {e}")

# The S3 location of the input data for the inference request
input_location = f"s3://{s3_bucket}/{s3_key_for_input}"
print(input_location)

# Asynchronous Inference
try:
    response = sagemaker_runtime.invoke_endpoint_async(
        EndpointName=endpoint_name,
        InputLocation=input_location,
        ContentType='application/json',
        InferenceId='inference-test-id',
    )
    print(f"response: {response}")
except BotoCoreError as e:
    print(f"Error invoking endpoint: {e}")