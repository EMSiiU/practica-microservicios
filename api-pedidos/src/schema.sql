CREATE TABLE IF NOT EXISTS pedidos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id bigint NOT NULL CHECK (usuario_id > 0),
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'enviado', 'cancelado')),
    estado_pago text NOT NULL DEFAULT 'sin_pago' CHECK (estado_pago IN ('sin_pago', 'en_proceso', 'aprobado', 'rechazado')),
    direccion jsonb NOT NULL,
    items jsonb NOT NULL,
    subtotal_centavos bigint NOT NULL CHECK (subtotal_centavos >= 0),
    envio_centavos bigint NOT NULL CHECK (envio_centavos >= 0),
    guia text,
    resultado_simulado text CHECK (resultado_simulado IN ('aprobado', 'rechazado')),
    carrito_vaciado boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS pedidos_usuario_id ON pedidos (usuario_id, id DESC);
