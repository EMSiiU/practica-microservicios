package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"practica-microservicios/api-inventario/internal/config"
	"practica-microservicios/api-inventario/internal/store"
)

const maxBodyBytes = 64 << 10 // 64 KiB

type apiError struct {
	Codigo  string `json:"codigo"`
	Mensaje string `json:"mensaje"`
}

type reabastecerRequest struct {
	ProductoID *int64 `json:"producto_id"`
	Cantidad   *int64 `json:"cantidad"`
}

type reservarItemRequest struct {
	ProductoID *int64 `json:"producto_id"`
	Cantidad   *int64 `json:"cantidad"`
}

type reservarRequest struct {
	PedidoID *int64                `json:"pedido_id"`
	Items    []reservarItemRequest `json:"items"`
}

// NewRouter builds the Gin engine with security middleware, validation, and contract routes.
func NewRouter(cfg config.Config, st *store.SQLiteStore) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.HandleMethodNotAllowed = true
	_ = r.SetTrustedProxies(nil)

	r.Use(
		JSONRecovery(),
		SecurityHeaders(),
		CORS(cfg.CORSOrigins),
		AllowMethods(),
		RateLimiter(cfg.RateLimitMax),
	)

	r.NoRoute(func(c *gin.Context) {
		abortError(c, http.StatusNotFound, "RUTA_NO_ENCONTRADA", "La ruta solicitada no existe.")
	})
	r.NoMethod(func(c *gin.Context) {
		abortError(c, http.StatusMethodNotAllowed, "METODO_NO_PERMITIDO", "El método no está permitido en esta ruta.")
	})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	inv := r.Group("/api/inventario")
	{
		inv.GET("/:producto_id", func(c *gin.Context) {
			productoID, ok := parsePositiveID(c.Param("producto_id"))
			if !ok {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "El producto_id debe ser un entero positivo.")
				return
			}

			disponible, err := st.GetDisponible(c.Request.Context(), productoID)
			if errors.Is(err, store.ErrNotFound) {
				abortError(c, http.StatusNotFound, "NO_ENCONTRADO", "No existe registro de inventario para el producto.")
				return
			}
			if err != nil {
				log.Printf("ERROR: GetDisponible failed for producto_id=%d: %v", productoID, err)
				abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "No se pudo consultar el inventario.")
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"producto_id": productoID,
				"disponible":  disponible,
			})
		})

		inv.POST("/reabastecer", RequireAdmin(cfg), func(c *gin.Context) {
			var req reabastecerRequest
			if err := decodeStrictJSON(c, &req); err != nil {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "El cuerpo debe ser un JSON válido.")
				return
			}
			if req.ProductoID == nil || !isValidPositiveInt(*req.ProductoID) ||
				req.Cantidad == nil || !isValidPositiveInt(*req.Cantidad) {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "producto_id y cantidad deben ser enteros positivos.")
				return
			}

			disponible, created, err := st.Reabastecer(c.Request.Context(), *req.ProductoID, *req.Cantidad)
			if errors.Is(err, store.ErrOverflow) {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "La cantidad excede el rango admitido.")
				return
			}
			if err != nil {
				log.Printf("ERROR: Reabastecer failed for producto_id=%d: %v", *req.ProductoID, err)
				abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "No se pudo actualizar el inventario.")
				return
			}

			status := http.StatusOK
			if created {
				status = http.StatusCreated
			}
			c.JSON(status, gin.H{
				"producto_id": *req.ProductoID,
				"disponible":  disponible,
			})
		})

		inv.POST("/reservar", RequireServiceToken(cfg), func(c *gin.Context) {
			var req reservarRequest
			if err := decodeStrictJSON(c, &req); err != nil {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "El cuerpo debe ser un JSON válido.")
				return
			}
			if req.PedidoID == nil || !isValidPositiveInt(*req.PedidoID) || len(req.Items) == 0 {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "pedido_id e items son obligatorios y válidos.")
				return
			}

			items := make([]store.ReservaItem, 0, len(req.Items))
			seenProducts := make(map[int64]struct{}, len(req.Items))
			for _, item := range req.Items {
				if item.ProductoID == nil || !isValidPositiveInt(*item.ProductoID) ||
					item.Cantidad == nil || !isValidPositiveInt(*item.Cantidad) {
					abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "Cada item requiere producto_id y cantidad enteros positivos.")
					return
				}
				if _, dup := seenProducts[*item.ProductoID]; dup {
					abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "Cada producto debe aparecer una sola vez en la reserva.")
					return
				}
				seenProducts[*item.ProductoID] = struct{}{}
				items = append(items, store.ReservaItem{
					ProductoID: *item.ProductoID,
					Cantidad:   *item.Cantidad,
				})
			}

			reserva, created, err := st.Reservar(c.Request.Context(), *req.PedidoID, items)
			if errors.Is(err, store.ErrStockInsuficiente) {
				abortError(c, http.StatusConflict, "STOCK_INSUFICIENTE", "No hay unidades suficientes para completar el pedido.")
				return
			}
			if errors.Is(err, store.ErrSolicitudDistinta) {
				abortError(c, http.StatusConflict, "SOLICITUD_DISTINTA", "El pedido ya tiene una reserva registrada con otros productos o cantidades.")
				return
			}
			if err != nil {
				log.Printf("ERROR: Reservar failed for pedido_id=%d: %v", *req.PedidoID, err)
				abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "No se pudo procesar la reserva.")
				return
			}

			status := http.StatusOK
			if created {
				status = http.StatusCreated
			}
			c.JSON(status, reserva)
		})

		inv.POST("/reservas/:pedido_id/confirmar", RequireServiceToken(cfg), func(c *gin.Context) {
			pedidoID, ok := parsePositiveID(c.Param("pedido_id"))
			if !ok {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "El pedido_id debe ser un entero positivo.")
				return
			}

			reserva, err := st.ConfirmarReserva(c.Request.Context(), pedidoID)
			if errors.Is(err, store.ErrNotFound) {
				abortError(c, http.StatusNotFound, "NO_ENCONTRADO", "No existe una reserva para el pedido especificado.")
				return
			}
			if errors.Is(err, store.ErrEstadoInvalido) {
				abortError(c, http.StatusConflict, "ESTADO_INVALIDO", "No se puede confirmar una reserva ya liberada.")
				return
			}
			if err != nil {
				log.Printf("ERROR: ConfirmarReserva failed for pedido_id=%d: %v", pedidoID, err)
				abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "No se pudo confirmar la reserva.")
				return
			}

			c.JSON(http.StatusOK, reserva)
		})

		inv.POST("/reservas/:pedido_id/liberar", RequireServiceToken(cfg), func(c *gin.Context) {
			pedidoID, ok := parsePositiveID(c.Param("pedido_id"))
			if !ok {
				abortError(c, http.StatusBadRequest, "DATOS_INVALIDOS", "El pedido_id debe ser un entero positivo.")
				return
			}

			reserva, err := st.LiberarReserva(c.Request.Context(), pedidoID)
			if errors.Is(err, store.ErrNotFound) {
				abortError(c, http.StatusNotFound, "NO_ENCONTRADO", "No existe una reserva para el pedido especificado.")
				return
			}
			if errors.Is(err, store.ErrEstadoInvalido) {
				abortError(c, http.StatusConflict, "ESTADO_INVALIDO", "No se puede liberar una reserva ya confirmada.")
				return
			}
			if err != nil {
				log.Printf("ERROR: LiberarReserva failed for pedido_id=%d: %v", pedidoID, err)
				abortError(c, http.StatusInternalServerError, "ERROR_INTERNO", "No se pudo liberar la reserva.")
				return
			}

			c.JSON(http.StatusOK, reserva)
		})
	}

	return r
}

func abortError(c *gin.Context, status int, codigo, mensaje string) {
	c.AbortWithStatusJSON(status, apiError{
		Codigo:  codigo,
		Mensaje: mensaje,
	})
}

func parsePositiveID(raw string) (int64, bool) {
	if !positiveIntRegex.MatchString(raw) {
		return 0, false
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || !isValidPositiveInt(id) {
		return 0, false
	}
	return id, true
}

func isValidPositiveInt(v int64) bool {
	return v >= 1 && v <= store.MaxSafeInt
}

func decodeStrictJSON(c *gin.Context, dst any) error {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return err
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return errors.New("expected JSON object")
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	if err := dec.Decode(dst); err != nil {
		return err
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return errors.New("unexpected trailing JSON data")
	}
	return nil
}
