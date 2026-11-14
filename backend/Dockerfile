FROM python:3.13-slim

WORKDIR /app

# Build deps for cryptography/Pillow/reportlab wheels that need to compile,
# plus curl/wget for Coolify's in-container healthcheck probe
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persisted outside the image by a Coolify volume mounted here
RUN mkdir -p /app/media

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
