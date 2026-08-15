# --- build stage --------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Não baixa o Chromium bundled do Puppeteer aqui: essa stage só compila TS,
# não roda o browser. A imagem final usa o Chromium do apt (ver stage abaixo).
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build


# --- production stage ----------------------------------------------------
FROM node:22-bookworm-slim AS production
WORKDIR /app

# Chromium via apt em vez do binário que o Puppeteer baixaria sozinho: o apt já
# resolve as bibliotecas de sistema corretas pra essa versão do Debian, evitando
# ter que adivinhar/manter uma lista de libs (libnss3, libatk etc.) manualmente.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_NO_SANDBOX=true

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
