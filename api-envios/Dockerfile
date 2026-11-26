FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/

RUN groupadd --gid 10001 envios \
    && useradd --uid 10001 --gid 10001 --no-create-home envios \
    && install -d -o 10001 -g 10001 /app/data
USER 10001:10001

EXPOSE 8003
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8003}"]
