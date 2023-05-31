import os
import json
import boto3
import whisper
from flask import Flask, request, jsonify
from threading import Thread

app = Flask(__name__)
model = whisper.load_model("base")
s3_client = boto3.client("s3")

@app.route('/invocations', methods=['POST'])
def transcribe_async():
    data = request.json
    s3_bucket = data.get('s3_bucket')
    s3_key = data.get('s3_key')
    job_id = data.get('job_id')
    language = data.get('language')

    if not s3_bucket or not s3_key or not job_id or not language:
        return jsonify(error='Missing required parameter'), 400

    # Start the transcription process in a new thread
    thread = Thread(target=transcribe, args=(s3_bucket, s3_key, job_id, language))
    thread.start()

    return jsonify(message='Transcription started'), 202

def transcribe(s3_bucket, s3_key, job_id, language):
    # Download the audio file from S3
    s3_client.download_file(s3_bucket, s3_key, 'temp_audio.mp3')
    
    # Transcribe the audio file
    result = model.transcribe('temp_audio.mp3', language=language)
    os.remove('temp_audio.mp3')

    # Convert result to json string with proper encoding
    result_json = json.dumps(result, ensure_ascii=False).encode('utf-8')

    # Save transcription to s3 s3_key.rsplit('/', 1)[0] + '/asynch_input_file.json'
    output_key = s3_key.rsplit('/', 1)[0] + f'/{job_id}.json'
    s3_client.put_object(Body=result_json, Bucket=s3_bucket, Key=output_key)

    print('Transcripts saved')


@app.route('/ping', methods=['GET'])
def ping():
    return "pinged", 200

@app.route('/', methods=['GET'])
def health_check():
    return "pinged", 200

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8080)
