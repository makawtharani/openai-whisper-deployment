import os
import boto3
import json
from botocore.exceptions import ClientError


dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.getenv('TABLE_NAME'))

def add_or_update_item(jobId, result, eventTime):
    try:
        # Try to get the item from the DynamoDB table
        response = table.get_item(
            Key={
                'job_id': jobId
            }
        )

        # Check if item exists
        if 'Item' in response:
            # If item exists, update it
            table.update_item(
                Key={
                    'job_id': jobId
                },
                UpdateExpression="SET snsresult = :r, eventTime = :e",
                ExpressionAttributeValues={
                    ':r': result,
                    ':e': eventTime
                },
                ReturnValues="UPDATED_NEW"
            )
        else:
            # If item doesn't exist, put a new item
            table.put_item(
                Item={
                    'job_id': jobId,
                    'snsresult': result,
                    'eventTime': eventTime
                }
            )
    except ClientError as e:
        print(e.response['Error']['Message'])

def main(event, context):
    print(f"event {event}")
    for record in event['Records']:
        message = json.loads(record['Sns']['Message'])
        print(f"message {message}")
        
        jobId = message['inferenceId']
        result = message['invocationStatus']
        eventTime = message['eventTime']
        
    add_or_update_item(jobId, result, eventTime)

    return {
        'statusCode': 200,
        'body': json.dumps('Done!')
    }
