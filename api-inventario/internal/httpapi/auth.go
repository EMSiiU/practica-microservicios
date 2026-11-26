package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"practica-microservicios/api-inventario/internal/config"
	"practica-microservicios/api-inventario/internal/store"
)

var (
	bearerHeaderRegex = regexp.MustCompile(`^(?i)Bearer[ \t]+(\S+)$`)
	positiveIntRegex  = regexp.MustCompile(`^[1-9][0-9]*$`)
)

type tokenClaims struct {
	Sub string `json:"sub"`
	Rol string `json:"rol"`
	jwt.RegisteredClaims
}

// RequireAdmin verifies a Bearer HS256 JWT with valid expiration and rol == "admin".
func RequireAdmin(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.JWTSecret == "" {
			log.Printf("ERROR: JWT_SECRET is not configured")
			abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "Configuración de autenticación incompleta.")
			return
		}

		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		matches := bearerHeaderRegex.FindStringSubmatch(authHeader)
		if len(matches) != 2 {
			abortError(c, http.StatusUnauthorized, "TOKEN_INVALIDO", "Se requiere un token Bearer válido y vigente.")
			return
		}

		var claims tokenClaims
		token, err := jwt.ParseWithClaims(
			matches[1],
			&claims,
			func(_ *jwt.Token) (any, error) {
				return []byte(cfg.JWTSecret), nil
			},
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			jwt.WithExpirationRequired(),
		)
		if err != nil || !token.Valid || !isValidTokenClaims(&claims) {
			abortError(c, http.StatusUnauthorized, "TOKEN_INVALIDO", "Se requiere un token Bearer válido y vigente.")
			return
		}

		if claims.Rol != "admin" {
			abortError(c, http.StatusForbidden, "ACCESO_DENEGADO", "Se requiere rol de administrador para esta operación.")
			return
		}

		c.Next()
	}
}

// RequireServiceToken validates the shared internal X-Service-Token header in constant time.
func RequireServiceToken(cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.ServiceToken == "" {
			log.Printf("ERROR: X_SERVICE_TOKEN is not configured")
			abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "Configuración de token interno incompleta.")
			return
		}

		provided := c.GetHeader("X-Service-Token")
		if provided == "" || !constantTimeEqual(provided, cfg.ServiceToken) {
			abortError(c, http.StatusUnauthorized, "TOKEN_INTERNO_INVALIDO", "Se requiere un token interno válido.")
			return
		}

		c.Next()
	}
}

func isValidTokenClaims(claims *tokenClaims) bool {
	if claims == nil || claims.ExpiresAt == nil {
		return false
	}
	if !positiveIntRegex.MatchString(claims.Sub) {
		return false
	}
	id, err := strconv.ParseInt(claims.Sub, 10, 64)
	if err != nil || id < 1 || id > store.MaxSafeInt {
		return false
	}
	return claims.Rol == "cliente" || claims.Rol == "admin"
}

func constantTimeEqual(a, b string) bool {
	sumA := sha256.Sum256([]byte(a))
	sumB := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(sumA[:], sumB[:]) == 1
}
