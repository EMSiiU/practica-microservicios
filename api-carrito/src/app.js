'use strict';

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { requireOwner, requireOwnerOrInternal } = require('./auth');
const { CarritoOverflowError } = require('./db');

const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE', 'OPTIONS']);
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;

function createApp(config, store) {
  const app = express();
  app.disable('x-powered-by');

  // Defensive security headers.
  // TODO(security): Stateless REST API authenticating exclusively via Bearer JWT and X-Service-Token headers (no cookies, so cookie-based CSRF tokens do not apply). TLS/HTTPS termination is handled by the Kubernetes ingress/gateway in production.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const allowedOrigins = new Set(config.corsOrigins);
  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, false);
      }
      return callback(null, allowedOrigins.has(origin));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Service-Token', 'Idempotency-Key'],
    optionsSuccessStatus: 204,
  }));

  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  app.use((req, res, next) => {
    if (!ALLOWED_METHODS.has(req.method)) {
      return res.status(405).json({
        codigo: 'METODO_NO_PERMITIDO',
        mensaje: 'El método no está permitido en esta ruta.',
      });
    }
    return next();
  });

  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    handler(_req, res) {
      res.status(429).json({
        codigo: 'DEMASIADAS_SOLICITUDES',
        mensaje: 'Demasiadas solicitudes. Intenta más tarde.',
      });
    },
  }));

  app.use(express.json({ limit: '64kb', strict: true }));
  app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'El cuerpo debe ser un JSON válido.',
      });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(400).json({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'El cuerpo excede el tamaño máximo permitido.',
      });
    }
    return next(err);
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/carrito/:usuario_id', requireOwnerOrInternal(config), (req, res, next) => {
    try {
      const carrito = store.getCarrito(req.usuarioId);
      return res.status(200).json(carrito);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/carrito/:usuario_id/agregar', requireOwner(config), (req, res, next) => {
    const body = req.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !Number.isSafeInteger(body.producto_id) ||
      body.producto_id < 1 ||
      !Number.isSafeInteger(body.cantidad) ||
      body.cantidad < 1
    ) {
      return res.status(400).json({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'producto_id y cantidad deben ser enteros positivos.',
      });
    }

    try {
      const carrito = store.agregarItem(req.usuarioId, body.producto_id, body.cantidad);
      return res.status(200).json(carrito);
    } catch (err) {
      if (err instanceof CarritoOverflowError) {
        return res.status(400).json({
          codigo: 'DATOS_INVALIDOS',
          mensaje: 'La cantidad excede el rango admitido.',
        });
      }
      return next(err);
    }
  });

  app.delete('/api/carrito/:usuario_id/vaciar', requireOwnerOrInternal(config), (req, res, next) => {
    const rawKey = req.get('Idempotency-Key');
    let idempotencyKey = null;

    if (rawKey !== undefined) {
      const trimmed = rawKey.trim();
      if (trimmed === '' || trimmed.length > 128 || CONTROL_CHARS_REGEX.test(trimmed)) {
        return res.status(400).json({
          codigo: 'DATOS_INVALIDOS',
          mensaje: 'El encabezado Idempotency-Key es inválido.',
        });
      }
      idempotencyKey = trimmed;
    }

    try {
      const carrito = store.vaciarCarrito(req.usuarioId, idempotencyKey);
      return res.status(200).json(carrito);
    } catch (err) {
      return next(err);
    }
  });

  const knownPaths = [
    '/health',
    '/api/carrito/:usuario_id',
    '/api/carrito/:usuario_id/agregar',
    '/api/carrito/:usuario_id/vaciar',
  ];
  for (const routePath of knownPaths) {
    app.all(routePath, (_req, res) => {
      res.status(405).json({
        codigo: 'METODO_NO_PERMITIDO',
        mensaje: 'El método no está permitido en esta ruta.',
      });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({
      codigo: 'RUTA_NO_ENCONTRADA',
      mensaje: 'La ruta solicitada no existe.',
    });
  });

  app.use((err, _req, res, _next) => {
    console.error('ERROR: unhandled error in api-carrito:', err);
    res.status(500).json({
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error interno inesperado.',
    });
  });

  return app;
}

module.exports = { createApp };
