package httpapi

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"practica-microservicios/api-inventario/internal/config"
	"practica-microservicios/api-inventario/internal/store"
)

const (
	testJWTSecret    = "clave_secreta_super_segura_tienda_2026"
	testServiceToken = "token_interno_servicios_tienda_2026"
)

func setupTestServer(t *testing.T) (*httptest.Server, *store.SQLiteStore) {
	t.Helper()
	st, err := store.NewSQLiteStore(filepath.Join(t.TempDir(), "inv.db"))
	if err != nil {
		t.Fatalf("NewSQLiteStore: %v", err)
	}
	t.Cleanup(func() {
		_ = st.Close()
	})

	cfg := config.Config{
		Host:         "127.0.0.1",
		Port:         "0",
		JWTSecret:    testJWTSecret,
		ServiceToken: testServiceToken,
		CORSOrigins:  []string{"http://localhost:4200"},
		RateLimitMax: 600,
	}

	// Listen strictly on 127.0.0.1 during tests.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen 127.0.0.1: %v", err)
	}
	srv := &httptest.Server{
		Listener: ln,
		Config:   &http.Server{Handler: NewRouter(cfg, st)},
	}
	srv.Start()
	t.Cleanup(srv.Close)
	return srv, st
}

func makeJWT(t *testing.T, secret, sub, rol string, exp time.Time) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": sub,
		"rol": rol,
		"iat": time.Now().Unix(),
		"exp": exp.Unix(),
	})
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return s
}

func doReq(t *testing.T, method, url string, body any, headers map[string]string) (*http.Response, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if raw, ok := body.(string); ok {
			buf.WriteString(raw)
		} else if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req, err := http.NewRequest(method, url, &buf)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var decoded map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&decoded)
	return resp, decoded
}

func TestInventoryFullFlowAndErrors(t *testing.T) {
	srv, _ := setupTestServer(t)
	adminTok := makeJWT(t, testJWTSecret, "1", "admin", time.Now().Add(time.Hour))
	clientTok := makeJWT(t, testJWTSecret, "2", "cliente", time.Now().Add(time.Hour))
	expiredTok := makeJWT(t, testJWTSecret, "1", "admin", time.Now().Add(-time.Minute))

	// Health & security headers
	resp, body := doReq(t, http.MethodGet, srv.URL+"/health", nil, map[string]string{"Origin": "http://localhost:4200"})
	if resp.StatusCode != 200 || body["status"] != "ok" {
		t.Fatalf("health unexpected: %d %v", resp.StatusCode, body)
	}
	if resp.Header.Get("X-Content-Type-Options") != "nosniff" || resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:4200" {
		t.Fatalf("missing security/CORS headers: %v", resp.Header)
	}

	// Disallowed origin must not receive ACAO header
	resp, _ = doReq(t, http.MethodOptions, srv.URL+"/api/inventario/12", nil, map[string]string{"Origin": "http://evil.test"})
	if resp.StatusCode != 204 || resp.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("unexpected CORS preflight for evil origin: %d %v", resp.StatusCode, resp.Header)
	}

	// 404 & 400 on GET
	resp, body = doReq(t, http.MethodGet, srv.URL+"/api/inventario/12", nil, nil)
	if resp.StatusCode != 404 || body["codigo"] != "NO_ENCONTRADO" {
		t.Fatalf("expected 404 NO_ENCONTRADO, got %d %v", resp.StatusCode, body)
	}
	resp, _ = doReq(t, http.MethodGet, srv.URL+"/api/inventario/abc", nil, nil)
	if resp.StatusCode != 400 {
		t.Fatalf("expected 400 for non-numeric id, got %d", resp.StatusCode)
	}

	// Auth checks on reabastecer (401, 403, alg:none)
	resp, _ = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reabastecer", map[string]any{"producto_id": 12, "cantidad": 10}, nil)
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 without token, got %d", resp.StatusCode)
	}
	resp, _ = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reabastecer", map[string]any{"producto_id": 12, "cantidad": 10}, map[string]string{"Authorization": "Bearer " + expiredTok})
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 with expired token, got %d", resp.StatusCode)
	}
	algNoneTok, _ := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"sub": "1", "rol": "admin", "exp": time.Now().Add(time.Hour).Unix()}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	resp, _ = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reabastecer", map[string]any{"producto_id": 12, "cantidad": 10}, map[string]string{"Authorization": "Bearer " + algNoneTok})
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 for alg=none, got %d", resp.StatusCode)
	}
	resp, _ = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reabastecer", map[string]any{"producto_id": 12, "cantidad": 10}, map[string]string{"Authorization": "Bearer " + clientTok})
	if resp.StatusCode != 403 {
		t.Fatalf("expected 403 for cliente role, got %d", resp.StatusCode)
	}

	// Create (201) then update (200)
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reabastecer", map[string]any{"producto_id": 12, "cantidad": 10}, map[string]string{"Authorization": "Bearer " + adminTok})
	if resp.StatusCode != 201 || body["disponible"] != float64(10) {
		t.Fatalf("expected 201 disponible=10, got %d %v", resp.StatusCode, body)
	}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reabastecer", map[string]any{"producto_id": 12, "cantidad": 5}, map[string]string{"Authorization": "Bearer " + adminTok})
	if resp.StatusCode != 200 || body["disponible"] != float64(15) {
		t.Fatalf("expected 200 disponible=15, got %d %v", resp.StatusCode, body)
	}

	// Internal token required on reservar
	resp, _ = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservar", map[string]any{"pedido_id": 25, "items": []any{map[string]any{"producto_id": 12, "cantidad": 2}}}, nil)
	if resp.StatusCode != 401 {
		t.Fatalf("expected 401 without X-Service-Token, got %d", resp.StatusCode)
	}

	svcHeaders := map[string]string{"X-Service-Token": testServiceToken}

	// Insufficient stock (missing product or too many units)
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservar", map[string]any{"pedido_id": 24, "items": []any{map[string]any{"producto_id": 12, "cantidad": 2}, map[string]any{"producto_id": 999, "cantidad": 1}}}, svcHeaders)
	if resp.StatusCode != 409 || body["codigo"] != "STOCK_INSUFICIENTE" {
		t.Fatalf("expected 409 STOCK_INSUFICIENTE, got %d %v", resp.StatusCode, body)
	}

	// Valid reservation -> 201
	req25 := map[string]any{"pedido_id": 25, "items": []any{map[string]any{"producto_id": 12, "cantidad": 2}}}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservar", req25, svcHeaders)
	if resp.StatusCode != 201 || body["estado"] != "reservada" {
		t.Fatalf("expected 201 reservada, got %d %v", resp.StatusCode, body)
	}

	// Idempotent repeat -> 200 without deducting again
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservar", req25, svcHeaders)
	if resp.StatusCode != 200 || body["estado"] != "reservada" {
		t.Fatalf("expected 200 idempotent reservada, got %d %v", resp.StatusCode, body)
	}
	_, body = doReq(t, http.MethodGet, srv.URL+"/api/inventario/12", nil, nil)
	if body["disponible"] != float64(13) {
		t.Fatalf("expected disponible=13, got %v", body)
	}

	// Different payload for same pedido_id -> 409 SOLICITUD_DISTINTA
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservar", map[string]any{"pedido_id": 25, "items": []any{map[string]any{"producto_id": 12, "cantidad": 3}}}, svcHeaders)
	if resp.StatusCode != 409 || body["codigo"] != "SOLICITUD_DISTINTA" {
		t.Fatalf("expected 409 SOLICITUD_DISTINTA, got %d %v", resp.StatusCode, body)
	}

	// Confirmar -> 200, repeat -> 200, then liberar -> 409 ESTADO_INVALIDO
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservas/25/confirmar", nil, svcHeaders)
	if resp.StatusCode != 200 || body["estado"] != "confirmada" {
		t.Fatalf("expected 200 confirmada, got %d %v", resp.StatusCode, body)
	}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservas/25/confirmar", nil, svcHeaders)
	if resp.StatusCode != 200 || body["estado"] != "confirmada" {
		t.Fatalf("expected 200 idempotent confirmada, got %d %v", resp.StatusCode, body)
	}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservas/25/liberar", nil, svcHeaders)
	if resp.StatusCode != 409 || body["codigo"] != "ESTADO_INVALIDO" {
		t.Fatalf("expected 409 ESTADO_INVALIDO, got %d %v", resp.StatusCode, body)
	}

	// New reservation 26 -> liberar -> 200, repeat -> 200, confirmar -> 409 ESTADO_INVALIDO
	resp, _ = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservar", map[string]any{"pedido_id": 26, "items": []any{map[string]any{"producto_id": 12, "cantidad": 3}}}, svcHeaders)
	if resp.StatusCode != 201 {
		t.Fatalf("expected 201 for pedido 26, got %d", resp.StatusCode)
	}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservas/26/liberar", nil, svcHeaders)
	if resp.StatusCode != 200 || body["estado"] != "liberada" {
		t.Fatalf("expected 200 liberada, got %d %v", resp.StatusCode, body)
	}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservas/26/liberar", nil, svcHeaders)
	if resp.StatusCode != 200 || body["estado"] != "liberada" {
		t.Fatalf("expected 200 idempotent liberada, got %d %v", resp.StatusCode, body)
	}
	resp, body = doReq(t, http.MethodPost, srv.URL+"/api/inventario/reservas/26/confirmar", nil, svcHeaders)
	if resp.StatusCode != 409 || body["codigo"] != "ESTADO_INVALIDO" {
		t.Fatalf("expected 409 ESTADO_INVALIDO, got %d %v", resp.StatusCode, body)
	}

	// Final disponible must be 13 (15 - 2 confirmed, 3 released)
	_, body = doReq(t, http.MethodGet, srv.URL+"/api/inventario/12", nil, nil)
	if body["disponible"] != float64(13) {
		t.Fatalf("expected final disponible=13, got %v", body)
	}

	// Disallowed HTTP method -> 405
	resp, _ = doReq(t, http.MethodDelete, srv.URL+"/api/inventario/12", nil, nil)
	if resp.StatusCode != 405 {
		t.Fatalf("expected 405 for DELETE, got %d", resp.StatusCode)
	}
}
