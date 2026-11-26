'use strict';

const http = require('node:http');
const { loadConfig } = require('./config');
const { CarritoStore } = require('./db');
const { createApp } = require('./app');

const config = loadConfig();
const store = new CarritoStore(config.dbPath);
const app = createApp(config, store);
const server = http.createServer(app);

server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.keepAliveTimeout = 60000;

server.listen(config.port, config.host, () => {
  console.log(`api-carrito listening on ${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`api-carrito received ${signal}, shutting down gracefully`);
  server.close(() => {
    try {
      store.close();
    } catch (err) {
      console.warn('WARN: error closing SQLite store:', err);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
