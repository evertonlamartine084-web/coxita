FROM python:3.12-slim
# av<15: o PyAV 15 tirou o metadata_errors que o faster-whisper 1.1.1 usa ("open() got an unexpected keyword argument")
RUN pip install --no-cache-dir faster-whisper==1.1.1 "av<15" requests
WORKDIR /app
COPY robo.py /app/robo.py
CMD ["python", "-u", "/app/robo.py"]
