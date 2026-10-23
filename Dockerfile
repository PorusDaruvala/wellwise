# Wellwise on Railway (or any Docker host). Persistent data lives on a volume mounted at /data.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN python3 scripts/build.py
ENV NODE_ENV=production WELLWISE_DB=/data/wellwise.db
EXPOSE 8787
CMD ["node", "server/index.js"]
