FROM composer:2 AS dependencias

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress

FROM php:8.4-cli

WORKDIR /app
COPY --from=dependencias /app/vendor/ ./vendor/
COPY public/ ./public/
COPY src/ ./src/

EXPOSE 8001

CMD ["sh", "-c", "exec php -S \"0.0.0.0:${PORT:-8001}\" -t public public/index.php"]