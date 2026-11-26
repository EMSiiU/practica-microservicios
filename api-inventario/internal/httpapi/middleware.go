package httpapi

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// SecurityHeaders applies defensive HTTP security headers on every response.
// TODO(security): Stateless REST API authenticating exclusively via Bearer JWT and X-Service-Token headers (no cookies, so cookie-based CSRF tokens do not apply). TLS/HTTPS termination is handled by the Kubernetes ingress/gateway in production.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("Cache-Control", "no-store")
		c.Next()
	}
}

// CORS restricts cross-origin requests to the configured allow-list of origins (no wildcards).
func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[origin] = struct{}{}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		c.Header("Vary", "Origin")

		if origin != "" {
			if _, ok := allowed[origin]; ok {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Service-Token")
			}
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// AllowMethods enforces an explicit HTTP method allow-list.
func AllowMethods() gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case http.MethodGet, http.MethodPost, http.MethodOptions:
			c.Next()
		default:
			abortError(c, http.StatusMethodNotAllowed, "METODO_NO_PERMITIDO", "El método no está permitido en esta ruta.")
		}
	}
}

type rateBucket struct {
	count   int
	resetAt time.Time
}

// RateLimiter limits requests per client IP per minute, excluding /health probes.
func RateLimiter(maxPerMinute int) gin.HandlerFunc {
	var mu sync.Mutex
	buckets := make(map[string]rateBucket)
	window := time.Minute
	lastSweep := time.Now()

	return func(c *gin.Context) {
		if c.Request.URL.Path == "/health" {
			c.Next()
			return
		}

		now := time.Now()
		ip := c.ClientIP()

		mu.Lock()
		if now.Sub(lastSweep) >= window {
			for k, b := range buckets {
				if !now.Before(b.resetAt) {
					delete(buckets, k)
				}
			}
			lastSweep = now
		}

		b, ok := buckets[ip]
		if !ok || !now.Before(b.resetAt) {
			b = rateBucket{count: 1, resetAt: now.Add(window)}
			buckets[ip] = b
			mu.Unlock()
			c.Next()
			return
		}

		if b.count >= maxPerMinute {
			mu.Unlock()
			abortError(c, http.StatusTooManyRequests, "DEMASIADAS_SOLICITUDES", "Demasiadas solicitudes. Intenta más tarde.")
			return
		}

		b.count++
		buckets[ip] = b
		mu.Unlock()
		c.Next()
	}
}

// JSONRecovery catches unexpected panics without leaking internal details to clients.
func JSONRecovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		log.Printf("ERROR: unhandled panic in api-inventario: %v", recovered)
		abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "Ocurrió un error interno inesperado.")
	})
}
