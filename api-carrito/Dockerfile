FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

RUN addgroup -g 10001 -S carrito \
    && adduser -u 10001 -S carrito -G carrito \
    && mkdir -p /app/data \
    && chown -R 10001:10001 /app

USER 10001:10001

ENV NODE_ENV=production \
    PORT=8005

EXPOSE 8005

CMD ["node", "src/server.js"]
