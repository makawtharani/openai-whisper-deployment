import os
import json
import boto3
import whisper
from flask import Flask, request, jsonify
import threading
from botocore.exceptions import ClientError
import logging
import traceback

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

app = Flask(__name__)
model = whisper.load_model('large')
s3_client = boto3.client("s3")
dynamodb_resource = boto3.resource('dynamodb')

model_lock = threading.Lock()

@app.route('/invocations', methods=['POST'])
def transcribe_async():
    data = request.json
    s3_bucket = data.get('s3_bucket')
    s3_key = data.get('s3_key')
    job_id = data.get('job_id')
    language = data.get('language')
    ddbtable_name = data.get('ddbtable')
    
    if not s3_bucket or not s3_key or not job_id or not language or not ddbtable_name:
        return jsonify(error='Missing required parameter'), 400

    ddbtable = dynamodb_resource.Table(ddbtable_name)  # Get the actual table object
    
    # Insert a new record to DynamoDB table when the transcription starts
    add_or_update_item(job_id, ddbtable)

    # Start the transcription process in a new thread
    thread = threading.Thread(target=transcribe, args=(s3_bucket, s3_key, job_id, language, ddbtable))
    thread.daemon = True  # This ensures that thread will exit when the main program exits
    thread.start()

    return jsonify(message='Transcription started'), 202

def add_or_update_item(job_id, ddbtable):
    try:
        # Try to get the item from the DynamoDB table
        response = ddbtable.get_item(
            Key={
                'job_id': job_id
            }
        )

        # Check if item exists
        if 'Item' in response:
            # If item exists, update it
            ddbtable.update_item(
                Key={
                    'job_id': job_id
                },
                UpdateExpression="SET result = :r",
                ExpressionAttributeValues={
                    ':r': 'started',
                },
                ReturnValues="UPDATED_NEW"
            )
        else:
            # If item doesn't exist, put a new item
            ddbtable.put_item(
                Item={
                    'job_id': job_id,
                    'result': 'started',
                }
            )
    except ClientError as e:
        logging.error(f'Error in updating DynamoDB: {str(e)}\n{traceback.format_exc()}')

def transcribe(s3_bucket, s3_key, job_id, language, ddbtable):
    with model_lock:
        try:
            # Download the audio file from S3
            s3_client.download_file(s3_bucket, s3_key, 'temp_audio.mp3')

            # Transcribe the audio file
            result = model.transcribe('temp_audio.mp3', language=language)
            os.remove('temp_audio.mp3')

            # Convert result to json string with proper encoding
            result_json = json.dumps(result, ensure_ascii=False).encode('utf-8')
            result_txt = json.dumps(result['text'], ensure_ascii=False).encode('utf-8')

            # Save transcription to S3
            output_jsonkey = s3_key.rsplit('/', 1)[0] + f'/{job_id}.json'
            s3_client.put_object(Body=result_json, Bucket=s3_bucket, Key=output_jsonkey)

            output_txtkey = s3_key.rsplit('/', 1)[0] + '/transcript.txt'
            s3_client.put_object(Body=result_txt, Bucket=s3_bucket, Key=output_txtkey)

            # Update record in DynamoDB table to 'complete' and add output location
            ddbtable.update_item(
                Key={'job_id': job_id},
                UpdateExpression='SET #result = :result_val, output_txtkey = :output_txt_val, output_jsonkey = :output_json_val',
                ExpressionAttributeValues={':result_val': 'complete', ':output_txt_val': output_txtkey, ':output_json_val': output_jsonkey},
                ExpressionAttributeNames={"#result": "result"}
            )
            logging.info(f'Transcription for job_id {job_id} saved successfully')

        except Exception as e:
            # Update record in DynamoDB table to 'error' in case of exception
            ddbtable.update_item(
                Key={'job_id': job_id},
                UpdateExpression='SET #result = :result_val',
                ExpressionAttributeValues={':result_val': 'error'},
                ExpressionAttributeNames={"#result": "result"}
            )
            logging.error(f'Error in transcribing for job_id {job_id}: {str(e)}\n{traceback.format_exc()}')

@app.route('/ping', methods=['GET'])
def ping():
    return "pinged", 200

@app.route('/', methods=['GET'])
def health_check():
    return "pinged", 200

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080)