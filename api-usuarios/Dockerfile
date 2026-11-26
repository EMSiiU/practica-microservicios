FROM php:8.4-cli

WORKDIR /app
COPY public/ ./public/
COPY src/ ./src/

EXPOSE 8001

CMD ["php", "-S", "0.0.0.0:8001", "-t", "public", "public/index.php"]