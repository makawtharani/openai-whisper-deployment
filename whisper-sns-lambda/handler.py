import os
import boto3
import json

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.getenv('TABLE_NAME'))

def main(event, context):
    for record in event['Records']:
        message = json.loads(record['Sns']['Message'])
        jobId = message['jobId']
        result = message['result']
        table.put_item(
            Item={
                'jobId': jobId,
                'result': result
            }
        )
    return {
        'statusCode': 200,
        'body': json.dumps('Done!')
    }
