FROM node:20-slim AS base

# Install Python, yt-dlp and system deps
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && pip3 install SpeechRecognition pydub --break-system-packages \
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
