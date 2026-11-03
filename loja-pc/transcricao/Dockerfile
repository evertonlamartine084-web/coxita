FROM python:3.12-slim
RUN pip install --no-cache-dir faster-whisper==1.1.1 requests
WORKDIR /app
COPY robo.py /app/robo.py
CMD ["python", "-u", "/app/robo.py"]
