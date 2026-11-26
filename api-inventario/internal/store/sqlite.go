package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite"
)

// MaxSafeInt matches JavaScript Number.MAX_SAFE_INTEGER (2^53 - 1) for cross-stack JSON safety.
const MaxSafeInt int64 = 9007199254740991

var (
	ErrNotFound          = errors.New("not found")
	ErrStockInsuficiente = errors.New("stock insuficiente")
	ErrSolicitudDistinta = errors.New("solicitud distinta")
	ErrEstadoInvalido    = errors.New("estado invalido")
	ErrOverflow          = errors.New("integer overflow")
)

const (
	EstadoReservada  = "reservada"
	EstadoConfirmada = "confirmada"
	EstadoLiberada   = "liberada"
)

// ReservaItem represents a single product quantity inside an inventory reservation.
type ReservaItem struct {
	ProductoID int64 `json:"producto_id"`
	Cantidad   int64 `json:"cantidad"`
}

// Reserva represents an inventory reservation tied to a pedido_id.
type Reserva struct {
	PedidoID int64         `json:"pedido_id"`
	Estado   string        `json:"estado"`
	Items    []ReservaItem `json:"items"`
}

// SQLiteStore provides transactional inventory and reservation persistence backed by SQLite.
type SQLiteStore struct {
	db *sql.DB
	mu sync.Mutex
}

// NewSQLiteStore opens or creates the SQLite database at dbPath and initializes tables.
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	if dbPath != ":memory:" {
		dir := filepath.Dir(dbPath)
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("creating db directory: %w", err)
		}
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("opening sqlite: %w", err)
	}

	// Single open connection combined with an application mutex avoids SQLITE_BUSY and guarantees
	// strict serialization across concurrent reservation requests.
	db.SetMaxOpenConns(1)

	ctx := context.Background()
	pragmas := []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA busy_timeout=5000;",
		"PRAGMA foreign_keys=ON;",
	}
	for _, stmt := range pragmas {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("configuring sqlite pragma: %w", err)
		}
	}

	schema := `
	CREATE TABLE IF NOT EXISTS inventario (
		producto_id INTEGER PRIMARY KEY CHECK (producto_id > 0),
		stock_fisico INTEGER NOT NULL CHECK (stock_fisico >= 0),
		unidades_reservadas INTEGER NOT NULL DEFAULT 0 CHECK (unidades_reservadas >= 0 AND unidades_reservadas <= stock_fisico)
	);
	CREATE TABLE IF NOT EXISTS reservas (
		pedido_id INTEGER PRIMARY KEY CHECK (pedido_id > 0),
		estado TEXT NOT NULL CHECK (estado IN ('reservada', 'confirmada', 'liberada')),
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS reserva_items (
		pedido_id INTEGER NOT NULL,
		producto_id INTEGER NOT NULL CHECK (producto_id > 0),
		cantidad INTEGER NOT NULL CHECK (cantidad > 0),
		orden INTEGER NOT NULL,
		PRIMARY KEY (pedido_id, producto_id),
		FOREIGN KEY (pedido_id) REFERENCES reservas(pedido_id) ON DELETE CASCADE
	);`
	if _, err := db.ExecContext(ctx, schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("creating sqlite schema: %w", err)
	}

	return &SQLiteStore{db: db}, nil
}

// Close closes the underlying SQLite connection.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

func (s *SQLiteStore) withImmediateTx(ctx context.Context, fn func(conn *sql.Conn) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer func() {
		_ = conn.Close()
	}()

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return err
	}

	if err := fn(conn); err != nil {
		_, _ = conn.ExecContext(context.Background(), "ROLLBACK")
		return err
	}

	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		_, _ = conn.ExecContext(context.Background(), "ROLLBACK")
		return err
	}
	return nil
}

// GetDisponible returns available units (stock_fisico - unidades_reservadas) for a product.
func (s *SQLiteStore) GetDisponible(ctx context.Context, productoID int64) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var stockFisico, unidadesReservadas int64
	err := s.db.QueryRowContext(
		ctx,
		"SELECT stock_fisico, unidades_reservadas FROM inventario WHERE producto_id = ?",
		productoID,
	).Scan(&stockFisico, &unidadesReservadas)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	return stockFisico - unidadesReservadas, nil
}

// Reabastecer adds physical stock to an existing product or creates the initial inventory row.
func (s *SQLiteStore) Reabastecer(ctx context.Context, productoID, cantidad int64) (int64, bool, error) {
	var disponible int64
	var created bool

	err := s.withImmediateTx(ctx, func(conn *sql.Conn) error {
		var stockFisico, unidadesReservadas int64
		err := conn.QueryRowContext(
			ctx,
			"SELECT stock_fisico, unidades_reservadas FROM inventario WHERE producto_id = ?",
			productoID,
		).Scan(&stockFisico, &unidadesReservadas)

		if errors.Is(err, sql.ErrNoRows) {
			if _, err := conn.ExecContext(
				ctx,
				"INSERT INTO inventario (producto_id, stock_fisico, unidades_reservadas) VALUES (?, ?, 0)",
				productoID, cantidad,
			); err != nil {
				return err
			}
			disponible = cantidad
			created = true
			return nil
		}
		if err != nil {
			return err
		}

		if stockFisico > MaxSafeInt-cantidad {
			return ErrOverflow
		}
		newStock := stockFisico + cantidad
		if _, err := conn.ExecContext(
			ctx,
			"UPDATE inventario SET stock_fisico = ? WHERE producto_id = ?",
			newStock, productoID,
		); err != nil {
			return err
		}
		disponible = newStock - unidadesReservadas
		created = false
		return nil
	})

	return disponible, created, err
}

// Reservar atomically reserves all requested items for pedidoID, with idempotency by pedidoID.
func (s *SQLiteStore) Reservar(ctx context.Context, pedidoID int64, items []ReservaItem) (Reserva, bool, error) {
	var result Reserva
	var created bool

	err := s.withImmediateTx(ctx, func(conn *sql.Conn) error {
		existing, found, err := loadReserva(ctx, conn, pedidoID)
		if err != nil {
			return err
		}
		if found {
			if !sameItems(existing.Items, items) {
				return ErrSolicitudDistinta
			}
			result = existing
			created = false
			return nil
		}

		for _, item := range items {
			var stockFisico, unidadesReservadas int64
			err := conn.QueryRowContext(
				ctx,
				"SELECT stock_fisico, unidades_reservadas FROM inventario WHERE producto_id = ?",
				item.ProductoID,
			).Scan(&stockFisico, &unidadesReservadas)
			if errors.Is(err, sql.ErrNoRows) {
				return ErrStockInsuficiente
			}
			if err != nil {
				return err
			}
			if stockFisico-unidadesReservadas < item.Cantidad {
				return ErrStockInsuficiente
			}
		}

		for _, item := range items {
			if _, err := conn.ExecContext(
				ctx,
				"UPDATE inventario SET unidades_reservadas = unidades_reservadas + ? WHERE producto_id = ?",
				item.Cantidad, item.ProductoID,
			); err != nil {
				return err
			}
		}

		if _, err := conn.ExecContext(
			ctx,
			"INSERT INTO reservas (pedido_id, estado) VALUES (?, ?)",
			pedidoID, EstadoReservada,
		); err != nil {
			return err
		}

		copied := make([]ReservaItem, len(items))
		for i, item := range items {
			if _, err := conn.ExecContext(
				ctx,
				"INSERT INTO reserva_items (pedido_id, producto_id, cantidad, orden) VALUES (?, ?, ?, ?)",
				pedidoID, item.ProductoID, item.Cantidad, i,
			); err != nil {
				return err
			}
			copied[i] = item
		}

		result = Reserva{
			PedidoID: pedidoID,
			Estado:   EstadoReservada,
			Items:    copied,
		}
		created = true
		return nil
	})

	return result, created, err
}

// ConfirmarReserva transitions a reservation from reservada to confirmada idempotently.
func (s *SQLiteStore) ConfirmarReserva(ctx context.Context, pedidoID int64) (Reserva, error) {
	var result Reserva

	err := s.withImmediateTx(ctx, func(conn *sql.Conn) error {
		reserva, found, err := loadReserva(ctx, conn, pedidoID)
		if err != nil {
			return err
		}
		if !found {
			return ErrNotFound
		}

		switch reserva.Estado {
		case EstadoConfirmada:
			result = reserva
			return nil
		case EstadoLiberada:
			return ErrEstadoInvalido
		case EstadoReservada:
			for _, item := range reserva.Items {
				if _, err := conn.ExecContext(
					ctx,
					"UPDATE inventario SET stock_fisico = stock_fisico - ?, unidades_reservadas = unidades_reservadas - ? WHERE producto_id = ?",
					item.Cantidad, item.Cantidad, item.ProductoID,
				); err != nil {
					return err
				}
			}
			if _, err := conn.ExecContext(
				ctx,
				"UPDATE reservas SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE pedido_id = ?",
				EstadoConfirmada, pedidoID,
			); err != nil {
				return err
			}
			reserva.Estado = EstadoConfirmada
			result = reserva
			return nil
		default:
			return ErrEstadoInvalido
		}
	})

	return result, err
}

// LiberarReserva transitions a reservation from reservada to liberada idempotently.
func (s *SQLiteStore) LiberarReserva(ctx context.Context, pedidoID int64) (Reserva, error) {
	var result Reserva

	err := s.withImmediateTx(ctx, func(conn *sql.Conn) error {
		reserva, found, err := loadReserva(ctx, conn, pedidoID)
		if err != nil {
			return err
		}
		if !found {
			return ErrNotFound
		}

		switch reserva.Estado {
		case EstadoLiberada:
			result = reserva
			return nil
		case EstadoConfirmada:
			return ErrEstadoInvalido
		case EstadoReservada:
			for _, item := range reserva.Items {
				if _, err := conn.ExecContext(
					ctx,
					"UPDATE inventario SET unidades_reservadas = unidades_reservadas - ? WHERE producto_id = ?",
					item.Cantidad, item.ProductoID,
				); err != nil {
					return err
				}
			}
			if _, err := conn.ExecContext(
				ctx,
				"UPDATE reservas SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE pedido_id = ?",
				EstadoLiberada, pedidoID,
			); err != nil {
				return err
			}
			reserva.Estado = EstadoLiberada
			result = reserva
			return nil
		default:
			return ErrEstadoInvalido
		}
	})

	return result, err
}

func loadReserva(ctx context.Context, conn *sql.Conn, pedidoID int64) (Reserva, bool, error) {
	var estado string
	err := conn.QueryRowContext(
		ctx,
		"SELECT estado FROM reservas WHERE pedido_id = ?",
		pedidoID,
	).Scan(&estado)
	if errors.Is(err, sql.ErrNoRows) {
		return Reserva{}, false, nil
	}
	if err != nil {
		return Reserva{}, false, err
	}

	rows, err := conn.QueryContext(
		ctx,
		"SELECT producto_id, cantidad FROM reserva_items WHERE pedido_id = ? ORDER BY orden ASC",
		pedidoID,
	)
	if err != nil {
		return Reserva{}, false, err
	}
	defer func() {
		_ = rows.Close()
	}()

	items := make([]ReservaItem, 0)
	for rows.Next() {
		var item ReservaItem
		if err := rows.Scan(&item.ProductoID, &item.Cantidad); err != nil {
			return Reserva{}, false, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return Reserva{}, false, err
	}

	return Reserva{
		PedidoID: pedidoID,
		Estado:   estado,
		Items:    items,
	}, true, nil
}

func sameItems(a, b []ReservaItem) bool {
	if len(a) != len(b) {
		return false
	}
	counts := make(map[int64]int64, len(a))
	for _, item := range a {
		counts[item.ProductoID] = item.Cantidad
	}
	for _, item := range b {
		qty, ok := counts[item.ProductoID]
		if !ok || qty != item.Cantidad {
			return false
		}
	}
	return true
}
