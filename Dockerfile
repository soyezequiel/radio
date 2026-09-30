FROM node:22-bookworm-slim AS javascript
FROM python:3.12-slim-bookworm
COPY --from=javascript /usr/local/bin/node /usr/local/bin/node
ENV PYTHONUNBUFFERED=1 RADIO_HOST=0.0.0.0 RADIO_API_ONLY=1 RADIO_CACHE_DIR=/tmp/radio-cache
WORKDIR /app
COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libatomic1 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --pre -r requirements.txt && useradd --create-home --uid 10001 radio
COPY tools/retro_server.py ./tools/retro_server.py
USER radio
EXPOSE 10000
CMD ["python", "tools/retro_server.py"]
