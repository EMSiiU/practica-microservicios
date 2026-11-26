FROM golang:1.24-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY internal/ ./internal/

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api-inventario ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates \
    && addgroup -g 10001 -S inventario \
    && adduser -u 10001 -S inventario -G inventario \
    && install -d -o 10001 -g 10001 /app/data

WORKDIR /app
COPY --from=builder /out/api-inventario /app/api-inventario

USER 10001:10001

EXPOSE 8004

ENTRYPOINT ["/app/api-inventario"]
