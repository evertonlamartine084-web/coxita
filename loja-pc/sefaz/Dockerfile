FROM python:3.12-slim
RUN pip install --no-cache-dir cryptography lxml
WORKDIR /app
COPY robo.py /app/robo.py
CMD ["python", "-u", "/app/robo.py"]
