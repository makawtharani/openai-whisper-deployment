import os
import boto3
import json

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.getenv('TABLE_NAME'))

def main(event, context):
    print(f"event {event}")
    for record in event['Records']:
        message = json.loads(record['Sns']['Message'])
        print(f"message {message}")
        
        jobId = message['inferenceId']
        result = message['invocationStatus']
        eventTime = message['eventTime']
        
        table.put_item(
            Item={
                'jobId': jobId,
                'result': result,
                'eventTime': 
            }
        )
    return {
        'statusCode': 200,
        'body': json.dumps('Done!')
    }
