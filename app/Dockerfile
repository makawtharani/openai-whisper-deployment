FROM python:3.8

# Install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p /opt/conda && \
    rm miniconda.sh

# Add conda to PATH
ENV PATH="/opt/conda/bin:${PATH}"

# Install packages
RUN pip install -U openai-whisper flask boto3
RUN conda install -y ffmpeg

# Copy server script
COPY asr_server.py /opt/program/

# Set working directory
WORKDIR /opt/program

# Set the entrypoint
ENTRYPOINT ["python", "asr_server.py"]
