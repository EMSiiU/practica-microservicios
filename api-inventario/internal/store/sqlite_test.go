package store

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func newTestStore(t *testing.T) *SQLiteStore {
	t.Helper()
	st, err := NewSQLiteStore(filepath.Join(t.TempDir(), "inventario.db"))
	if err != nil {
		t.Fatalf("NewSQLiteStore failed: %v", err)
	}
	t.Cleanup(func() {
		_ = st.Close()
	})
	return st
}

func TestReabastecerAndGetDisponible(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)

	if _, err := st.GetDisponible(ctx, 12); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	disp, created, err := st.Reabastecer(ctx, 12, 10)
	if err != nil || !created || disp != 10 {
		t.Fatalf("unexpected create result: disp=%d created=%v err=%v", disp, created, err)
	}

	disp, created, err = st.Reabastecer(ctx, 12, 5)
	if err != nil || created || disp != 15 {
		t.Fatalf("unexpected update result: disp=%d created=%v err=%v", disp, created, err)
	}

	got, err := st.GetDisponible(ctx, 12)
	if err != nil || got != 15 {
		t.Fatalf("expected 15 disponible, got %d (err=%v)", got, err)
	}
}

func TestReservarAtomicRollbackOnInsufficientStock(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)

	if _, _, err := st.Reabastecer(ctx, 1, 10); err != nil {
		t.Fatal(err)
	}
	if _, _, err := st.Reabastecer(ctx, 2, 1); err != nil {
		t.Fatal(err)
	}

	_, _, err := st.Reservar(ctx, 100, []ReservaItem{
		{ProductoID: 1, Cantidad: 4},
		{ProductoID: 2, Cantidad: 5},
	})
	if !errors.Is(err, ErrStockInsuficiente) {
		t.Fatalf("expected ErrStockInsuficiente, got %v", err)
	}

	// Product 1 stock must remain untouched (all-or-nothing).
	got, err := st.GetDisponible(ctx, 1)
	if err != nil || got != 10 {
		t.Fatalf("expected product 1 stock to remain 10, got %d (err=%v)", got, err)
	}
}

func TestConcurrentReservationsPreventOversell(t *testing.T) {
	ctx := context.Background()
	st := newTestStore(t)

	if _, _, err := st.Reabastecer(ctx, 42, 5); err != nil {
		t.Fatal(err)
	}

	const workers = 10
	results := make(chan error, workers)
	var wg sync.WaitGroup
	start := make(chan struct{})

	for i := 1; i <= workers; i++ {
		wg.Add(1)
		go func(pedidoID int64) {
			defer wg.Done()
			<-start
			_, _, err := st.Reservar(ctx, pedidoID, []ReservaItem{{ProductoID: 42, Cantidad: 2}})
			results <- err
		}(int64(i))
	}

	close(start)
	wg.Wait()
	close(results)

	var successes, insufficient int
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrStockInsuficiente):
			insufficient++
		default:
			t.Fatalf("unexpected error in concurrent reservation: %v", err)
		}
	}

	if successes != 2 || insufficient != 8 {
		t.Fatalf("expected 2 successes and 8 ErrStockInsuficiente, got %d successes and %d insufficient", successes, insufficient)
	}

	got, err := st.GetDisponible(ctx, 42)
	if err != nil || got != 1 {
		t.Fatalf("expected remaining disponible=1, got %d (err=%v)", got, err)
	}
}
