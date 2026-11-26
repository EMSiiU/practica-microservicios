'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const BEARER_REGEX = /^Bearer[ \t]+(\S+)$/i;
const POSITIVE_INT_REGEX = /^[1-9][0-9]*$/;

function timingSafeEqualStr(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function parsePositiveSafeInt(raw) {
  if (typeof raw !== 'string' || !POSITIVE_INT_REGEX.test(raw)) {
    return null;
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < 1) {
    return null;
  }
  return num;
}

function verifyBearerJwt(req, config) {
  if (!config.jwtSecret) {
    console.error('ERROR: JWT_SECRET is not configured');
    return { status: 500, codigo: 'ERROR_INTERNO', mensaje: 'Configuración de autenticación incompleta.' };
  }

  const authHeader = (req.get('Authorization') || '').trim();
  const match = BEARER_REGEX.exec(authHeader);
  if (!match) {
    return { status: 401, codigo: 'TOKEN_INVALIDO', mensaje: 'Se requiere un token Bearer válido y vigente.' };
  }

  let payload;
  try {
    payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
  } catch (_err) {
    return { status: 401, codigo: 'TOKEN_INVALIDO', mensaje: 'Se requiere un token Bearer válido y vigente.' };
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    parsePositiveSafeInt(payload.sub) === null ||
    (payload.rol !== 'cliente' && payload.rol !== 'admin')
  ) {
    return { status: 401, codigo: 'TOKEN_INVALIDO', mensaje: 'Se requiere un token Bearer válido y vigente.' };
  }

  return { payload };
}

function requireOwner(config) {
  return (req, res, next) => {
    const result = verifyBearerJwt(req, config);
    if (!result.payload) {
      return res.status(result.status).json({ codigo: result.codigo, mensaje: result.mensaje });
    }

    const usuarioId = parsePositiveSafeInt(req.params.usuario_id);
    if (usuarioId === null) {
      return res.status(400).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'El usuario_id debe ser un entero positivo.' });
    }

    if (result.payload.sub !== String(usuarioId)) {
      return res.status(403).json({ codigo: 'ACCESO_DENEGADO', mensaje: 'No tienes permiso para operar sobre este carrito.' });
    }

    req.usuarioId = usuarioId;
    return next();
  };
}

function requireOwnerOrInternal(config) {
  return (req, res, next) => {
    const providedServiceToken = req.get('X-Service-Token');
    if (providedServiceToken !== undefined) {
      if (!config.serviceToken) {
        console.error('ERROR: X_SERVICE_TOKEN is not configured');
        return res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Configuración de token interno incompleta.' });
      }
      if (!providedServiceToken || !timingSafeEqualStr(providedServiceToken, config.serviceToken)) {
        return res.status(401).json({ codigo: 'TOKEN_INTERNO_INVALIDO', mensaje: 'Se requiere un token interno válido.' });
      }

      const usuarioId = parsePositiveSafeInt(req.params.usuario_id);
      if (usuarioId === null) {
        return res.status(400).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'El usuario_id debe ser un entero positivo.' });
      }
      req.usuarioId = usuarioId;
      return next();
    }

    return requireOwner(config)(req, res, next);
  };
}

module.exports = {
  parsePositiveSafeInt,
  requireOwner,
  requireOwnerOrInternal,
};
