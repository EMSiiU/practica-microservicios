package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"practica-microservicios/api-inventario/internal/config"
	"practica-microservicios/api-inventario/internal/httpapi"
	"practica-microservicios/api-inventario/internal/store"
)

func main() {
	cfg := config.Load()

	st, err := store.NewSQLiteStore(cfg.DBPath)
	if err != nil {
		log.Fatalf("FATAL: failed to initialize SQLite store: %v", err)
	}
	defer func() {
		if closeErr := st.Close(); closeErr != nil {
			log.Printf("WARN: error closing SQLite store: %v", closeErr)
		}
	}()

	router := httpapi.NewRouter(cfg, st)
	addr := net.JoinHostPort(cfg.Host, cfg.Port)

	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("api-inventario listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("FATAL: HTTP server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Printf("api-inventario shutting down gracefully")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("WARN: graceful shutdown error: %v", err)
	}
}
