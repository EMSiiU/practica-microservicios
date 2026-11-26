CREATE TABLE IF NOT EXISTS pagos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id bigint NOT NULL UNIQUE CHECK (pedido_id > 0),
    usuario_id bigint NOT NULL CHECK (usuario_id > 0),
    monto numeric(14, 2) NOT NULL CHECK (monto >= 0),
    metodo_pago text NOT NULL CHECK (metodo_pago = 'simulado'),
    estado text NOT NULL CHECK (estado IN ('aprobado', 'rechazado'))
);
