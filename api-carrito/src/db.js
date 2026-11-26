'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class CarritoOverflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CarritoOverflowError';
  }
}

class CarritoStore {
  constructor(dbPath) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS carrito_items (
        usuario_id INTEGER NOT NULL CHECK (usuario_id > 0),
        producto_id INTEGER NOT NULL CHECK (producto_id > 0),
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usuario_id, producto_id)
      );
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        usuario_id INTEGER NOT NULL CHECK (usuario_id > 0),
        idempotency_key TEXT NOT NULL,
        processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usuario_id, idempotency_key)
      );
    `);

    this.stmts = {
      selectItems: this.db.prepare(
        'SELECT producto_id, cantidad FROM carrito_items WHERE usuario_id = ? ORDER BY rowid ASC'
      ),
      selectItemQty: this.db.prepare(
        'SELECT cantidad FROM carrito_items WHERE usuario_id = ? AND producto_id = ?'
      ),
      upsertItem: this.db.prepare(`
        INSERT INTO carrito_items (usuario_id, producto_id, cantidad)
        VALUES (?, ?, ?)
        ON CONFLICT (usuario_id, producto_id) DO UPDATE SET
          cantidad = cantidad + excluded.cantidad,
          updated_at = CURRENT_TIMESTAMP
      `),
      deleteItems: this.db.prepare(
        'DELETE FROM carrito_items WHERE usuario_id = ?'
      ),
      selectIdempotency: this.db.prepare(
        'SELECT 1 AS ok FROM idempotency_keys WHERE usuario_id = ? AND idempotency_key = ?'
      ),
      insertIdempotency: this.db.prepare(
        'INSERT INTO idempotency_keys (usuario_id, idempotency_key) VALUES (?, ?)'
      ),
    };
  }

  withImmediateTx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch (_rollbackErr) {
        // Ignore rollback failure when transaction is already aborted.
      }
      throw err;
    }
  }

  formatItems(rows) {
    return rows.map((row) => ({
      producto_id: Number(row.producto_id),
      cantidad: Number(row.cantidad),
    }));
  }

  getCarrito(usuarioId) {
    const rows = this.stmts.selectItems.all(usuarioId);
    return {
      usuario_id: usuarioId,
      items: this.formatItems(rows),
    };
  }

  agregarItem(usuarioId, productoId, cantidad) {
    return this.withImmediateTx(() => {
      const existing = this.stmts.selectItemQty.get(usuarioId, productoId);
      const currentQty = existing ? Number(existing.cantidad) : 0;
      if (currentQty > Number.MAX_SAFE_INTEGER - cantidad) {
        throw new CarritoOverflowError('La cantidad excede el rango admitido.');
      }

      this.stmts.upsertItem.run(usuarioId, productoId, cantidad);
      const rows = this.stmts.selectItems.all(usuarioId);
      return {
        usuario_id: usuarioId,
        items: this.formatItems(rows),
      };
    });
  }

  vaciarCarrito(usuarioId, idempotencyKey) {
    return this.withImmediateTx(() => {
      if (idempotencyKey !== null) {
        const processed = this.stmts.selectIdempotency.get(usuarioId, idempotencyKey);
        if (processed) {
          return {
            usuario_id: usuarioId,
            items: [],
          };
        }
        this.stmts.insertIdempotency.run(usuarioId, idempotencyKey);
      }

      this.stmts.deleteItems.run(usuarioId);
      return {
        usuario_id: usuarioId,
        items: [],
      };
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = { CarritoStore, CarritoOverflowError };
