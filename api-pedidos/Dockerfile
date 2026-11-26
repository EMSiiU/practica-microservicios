FROM composer:2 AS dependencias
WORKDIR /app
COPY composer.* ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress

FROM php:8.4-cli
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libcurl4-openssl-dev \
    && docker-php-ext-install pdo_pgsql curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencias /app/vendor/ ./vendor/
COPY public/ ./public/
COPY src/ ./src/
EXPOSE 8006
ENV PHP_CLI_SERVER_WORKERS=4
CMD ["sh", "-c", "php src/migrar.php && exec php -S \"0.0.0.0:${PORT:-8006}\" -t public public/index.php"]
