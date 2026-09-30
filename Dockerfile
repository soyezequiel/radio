FROM brainicism/bgutil-ytdlp-pot-provider:2.0.0-node AS tokens
FROM python:3.12-slim-bookworm
COPY --from=tokens /usr/local/bin/node /usr/local/bin/node
COPY --from=tokens /app /opt/bgutil
ENV PYTHONUNBUFFERED=1 RADIO_HOST=0.0.0.0 RADIO_API_ONLY=1 RADIO_CACHE_DIR=/tmp/radio-cache RADIO_POT_HOME=/opt/bgutil XDG_CACHE_HOME=/tmp/radio-extractor-cache
WORKDIR /app
COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libatomic1 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --pre -r requirements.txt bgutil-ytdlp-pot-provider==2.0.0 && useradd --create-home --uid 10001 radio
COPY tools/retro_server.py ./tools/retro_server.py
USER radio
RUN node /opt/bgutil/build/generate_once.js --version
EXPOSE 10000
CMD ["python", "tools/retro_server.py"]
