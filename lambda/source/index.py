import os
import boto3
from sagemaker.huggingface.model import HuggingFaceModel
from sagemaker.serializers import DataSerializer

s3_location = os.environ['MODEL_S3_LOCATION']
endpoint_name = os.environ['ENDPOINT_NAME']
role = os.environ['SAGEMAKER_ROLE'] # role Arn

def lambda_handler(event, context):
    sm_client = boto3.client("sagemaker")
    audio_serializer = DataSerializer(content_type='audio/x-audio')
    huggingface_model = HuggingFaceModel(
        model_data=s3_location,
        role=role,
        transformers_version="4.17",
        pytorch_version="1.10",
        py_version='py38'
    )
    predictor = huggingface_model.deploy(
        initial_instance_count=1,
        instance_type="ml.g4dn.xlarge",
        endpoint_name=endpoint_name,
        serializer=audio_serializer,
    )
    
    return {
        "statusCode": 200, 
        "body": "Model deployed successfully."
        }

