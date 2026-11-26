'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const { CarritoStore } = require('../src/db');
const { createApp } = require('../src/app');

const TEST_JWT_SECRET = 'clave_secreta_super_segura_tienda_2026';
const TEST_SERVICE_TOKEN = 'token_interno_servicios_tienda_2026';

function signToken(payload, secret = TEST_JWT_SECRET, options = {}) {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '1h', ...options });
}

async function createTestServer(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-carrito-test-'));
  const store = new CarritoStore(path.join(tmpDir, 'carrito.db'));
  const config = {
    host: '127.0.0.1',
    port: 0,
    jwtSecret: TEST_JWT_SECRET,
    serviceToken: TEST_SERVICE_TOKEN,
    corsOrigins: ['http://localhost:4200'],
    dbPath: path.join(tmpDir, 'carrito.db'),
    rateLimitMax: 600,
  };

  const app = createApp(config, store);
  const server = http.createServer(app);
  // Listen strictly on 127.0.0.1 during tests.
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  t.after(() => {
    server.close();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('health, CORS, security headers, and cart lifecycle with idempotency', async (t) => {
  const baseUrl = await createTestServer(t);
  const tokenUser1 = signToken({ sub: '1', rol: 'cliente' });
  const tokenUser2 = signToken({ sub: '2', rol: 'cliente' });
  const expiredToken = jwt.sign(
    { sub: '1', rol: 'cliente', exp: Math.floor(Date.now() / 1000) - 60 },
    TEST_JWT_SECRET,
    { algorithm: 'HS256' }
  );

  // Health + security headers + CORS
  let res = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'http://localhost:4200' },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:4200');

  // Preflight allowed vs disallowed
  res = await fetch(`${baseUrl}/api/carrito/1/vaciar`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:4200',
      'Access-Control-Request-Method': 'DELETE',
      'Access-Control-Request-Headers': 'Authorization, Content-Type, X-Service-Token, Idempotency-Key',
    },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:4200');
  assert.match(res.headers.get('access-control-allow-headers') || '', /Idempotency-Key/i);

  res = await fetch(`${baseUrl}/api/carrito/1`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://evil.test' },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), null);

  // Auth checks on GET
  res = await fetch(`${baseUrl}/api/carrito/1`);
  assert.equal(res.status, 401);

  res = await fetch(`${baseUrl}/api/carrito/1`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(res.status, 401);

  // alg=none must be rejected
  const unsignedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const unsignedPayload = Buffer.from(JSON.stringify({
    sub: '1',
    rol: 'cliente',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  res = await fetch(`${baseUrl}/api/carrito/1`, {
    headers: { Authorization: `Bearer ${unsignedHeader}.${unsignedPayload}.` },
  });
  assert.equal(res.status, 401);

  // Wrong owner -> 403
  res = await fetch(`${baseUrl}/api/carrito/1`, {
    headers: { Authorization: `Bearer ${tokenUser2}` },
  });
  assert.equal(res.status, 403);

  // Invalid usuario_id -> 400
  res = await fetch(`${baseUrl}/api/carrito/abc`, {
    headers: { 'X-Service-Token': TEST_SERVICE_TOKEN },
  });
  assert.equal(res.status, 400);

  // Empty cart -> 200 items: []
  res = await fetch(`${baseUrl}/api/carrito/1`, {
    headers: { Authorization: `Bearer ${tokenUser1}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [] });

  // Internal token CANNOT call /agregar -> 401
  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Token': TEST_SERVICE_TOKEN,
    },
    body: JSON.stringify({ producto_id: 12, cantidad: 2 }),
  });
  assert.equal(res.status, 401);

  // Wrong owner on /agregar -> 403
  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenUser2}`,
    },
    body: JSON.stringify({ producto_id: 12, cantidad: 2 }),
  });
  assert.equal(res.status, 403);

  // Invalid JSON / invalid quantity -> 400
  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenUser1}`,
    },
    body: '{bad-json',
  });
  assert.equal(res.status, 400);

  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenUser1}`,
    },
    body: JSON.stringify({ producto_id: 12, cantidad: 0 }),
  });
  assert.equal(res.status, 400);

  // Add item twice -> sums quantity
  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenUser1}`,
    },
    body: JSON.stringify({ producto_id: 12, cantidad: 2 }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [{ producto_id: 12, cantidad: 2 }] });

  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenUser1}`,
    },
    body: JSON.stringify({ producto_id: 12, cantidad: 3 }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [{ producto_id: 12, cantidad: 5 }] });

  // Internal GET sees items
  res = await fetch(`${baseUrl}/api/carrito/1`, {
    headers: { 'X-Service-Token': TEST_SERVICE_TOKEN },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [{ producto_id: 12, cantidad: 5 }] });

  // Empty with Idempotency-Key: pedido-25
  res = await fetch(`${baseUrl}/api/carrito/1/vaciar`, {
    method: 'DELETE',
    headers: {
      'X-Service-Token': TEST_SERVICE_TOKEN,
      'Idempotency-Key': 'pedido-25',
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [] });

  // User adds new item for a subsequent order
  res = await fetch(`${baseUrl}/api/carrito/1/agregar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenUser1}`,
    },
    body: JSON.stringify({ producto_id: 99, cantidad: 1 }),
  });
  assert.equal(res.status, 200);

  // Retry DELETE with same Idempotency-Key: pedido-25 must NOT wipe product 99
  res = await fetch(`${baseUrl}/api/carrito/1/vaciar`, {
    method: 'DELETE',
    headers: {
      'X-Service-Token': TEST_SERVICE_TOKEN,
      'Idempotency-Key': 'pedido-25',
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [] });

  res = await fetch(`${baseUrl}/api/carrito/1`, {
    headers: { Authorization: `Bearer ${tokenUser1}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [{ producto_id: 99, cantidad: 1 }] });

  // Owner DELETE without Idempotency-Key empties cart
  res = await fetch(`${baseUrl}/api/carrito/1/vaciar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenUser1}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usuario_id: 1, items: [] });

  // 404 & 405
  res = await fetch(`${baseUrl}/api/no-existe`);
  assert.equal(res.status, 404);

  res = await fetch(`${baseUrl}/api/carrito/1`, { method: 'PUT' });
  assert.equal(res.status, 405);
});
