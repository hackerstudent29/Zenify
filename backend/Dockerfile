FROM node:20-slim AS base

# Bust cache to ensure latest yt-dlp is always installed on fresh deployments
ARG CACHEBUST=1

# Install Python, yt-dlp (via pip) and system deps
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && pip3 install -U yt-dlp SpeechRecognition pydub --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Builder stage: install ALL deps (including devDeps) and compile ──
FROM base AS builder

WORKDIR /app

COPY package.json ./
# Install everything (dev + prod) so tsc is available
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Production stage: only prod deps + compiled output ──
FROM base AS production

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# Copy generated prisma client and compiled dist from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
