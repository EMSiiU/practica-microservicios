'use strict';

const path = require('node:path');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8005;
const DEFAULT_CORS_ORIGIN = 'http://localhost:4200';
const DEFAULT_RATE_LIMIT_MAX = 600;

function parsePositiveInt(raw, fallback, max) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const str = String(raw).trim();
  if (!/^[1-9][0-9]*$/.test(str)) {
    return fallback;
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 1 || (max !== undefined && num > max)) {
    return fallback;
  }
  return num;
}

function parseCorsOrigins(env) {
  const rawOrigin = typeof env.CORS_ORIGIN === 'string' && env.CORS_ORIGIN.trim() !== ''
    ? env.CORS_ORIGIN
    : env.CORS_ORIGINS;

  if (typeof rawOrigin !== 'string' || rawOrigin.trim() === '') {
    return [DEFAULT_CORS_ORIGIN];
  }

  const origins = [];
  const seen = new Set();
  for (const part of rawOrigin.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === '*') {
      console.warn('WARN: wildcard "*" in CORS_ORIGIN is rejected for security');
      continue;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      origins.push(trimmed);
    }
  }
  return origins;
}

function loadConfig(env = process.env) {
  const host = typeof env.HOST === 'string' && env.HOST.trim() !== ''
    ? env.HOST.trim()
    : DEFAULT_HOST;
  const port = parsePositiveInt(env.PORT, DEFAULT_PORT, 65535);
  const jwtSecret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET : '';
  const serviceToken = typeof env.X_SERVICE_TOKEN === 'string' ? env.X_SERVICE_TOKEN : '';
  const dbPath = typeof env.CARRITO_DB_PATH === 'string' && env.CARRITO_DB_PATH.trim() !== ''
    ? env.CARRITO_DB_PATH.trim()
    : path.resolve(process.cwd(), 'data', 'carrito.db');
  const rateLimitMax = parsePositiveInt(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX);

  if (!jwtSecret) {
    console.warn('WARN: JWT_SECRET is not configured; authenticated endpoints will fail closed');
  }
  if (!serviceToken) {
    console.warn('WARN: X_SERVICE_TOKEN is not configured; internal endpoints will fail closed');
  }

  return {
    host,
    port,
    jwtSecret,
    serviceToken,
    corsOrigins: parseCorsOrigins(env),
    dbPath,
    rateLimitMax,
  };
}

module.exports = { loadConfig };
