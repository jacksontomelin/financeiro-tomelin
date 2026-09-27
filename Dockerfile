FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=America/Sao_Paulo

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tzdata libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app ./app
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8000 8788

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["./start.sh"]
