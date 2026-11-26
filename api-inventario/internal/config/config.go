package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

const (
	defaultHost         = "0.0.0.0"
	defaultPort         = "8004"
	defaultCORSOrigin   = "http://localhost:4200"
	defaultDBPath       = "./data/inventario.db"
	defaultRateLimitMax = 600
)

// Config holds runtime configuration loaded from environment variables.
type Config struct {
	Host         string
	Port         string
	JWTSecret    string
	ServiceToken string
	CORSOrigins  []string
	DBPath       string
	RateLimitMax int
}

// Load reads service configuration from environment variables without hardcoding secrets.
func Load() Config {
	host := strings.TrimSpace(os.Getenv("HOST"))
	if host == "" {
		host = defaultHost
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = defaultPort
	} else if p, err := strconv.Atoi(port); err != nil || p < 1 || p > 65535 {
		log.Printf("WARN: invalid PORT value %q, falling back to %s", port, defaultPort)
		port = defaultPort
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Printf("WARN: JWT_SECRET is not configured; authenticated admin endpoints will fail closed")
	}

	serviceToken := os.Getenv("X_SERVICE_TOKEN")
	if serviceToken == "" {
		log.Printf("WARN: X_SERVICE_TOKEN is not configured; internal endpoints will fail closed")
	}

	dbPath := strings.TrimSpace(os.Getenv("INVENTARIO_DB_PATH"))
	if dbPath == "" {
		dbPath = defaultDBPath
	}

	rateLimitMax := defaultRateLimitMax
	if raw := strings.TrimSpace(os.Getenv("RATE_LIMIT_MAX")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			rateLimitMax = n
		} else {
			log.Printf("WARN: invalid RATE_LIMIT_MAX value %q, using default %d", raw, defaultRateLimitMax)
		}
	}

	return Config{
		Host:         host,
		Port:         port,
		JWTSecret:    jwtSecret,
		ServiceToken: serviceToken,
		CORSOrigins:  parseCORSOrigins(),
		DBPath:       dbPath,
		RateLimitMax: rateLimitMax,
	}
}

func parseCORSOrigins() []string {
	raw, hasOrigin := os.LookupEnv("CORS_ORIGIN")
	if !hasOrigin || strings.TrimSpace(raw) == "" {
		raw, hasOrigin = os.LookupEnv("CORS_ORIGINS")
	}
	if !hasOrigin || strings.TrimSpace(raw) == "" {
		return []string{defaultCORSOrigin}
	}

	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		if origin == "*" {
			log.Printf("WARN: wildcard '*' in CORS_ORIGIN is rejected for security")
			continue
		}
		if _, ok := seen[origin]; !ok {
			seen[origin] = struct{}{}
			origins = append(origins, origin)
		}
	}
	return origins
}
