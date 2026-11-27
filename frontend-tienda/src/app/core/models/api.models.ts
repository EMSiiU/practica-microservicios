export type RolUsuario = 'cliente' | 'admin';

export type EstadoPedido = 'pendiente' | 'pagado' | 'enviado' | 'cancelado';
export type EstadoPago = 'sin_pago' | 'en_proceso' | 'aprobado' | 'rechazado';
export type ResultadoSimulado = 'aprobado' | 'rechazado';
export type EstadoRastreo = 'preparando' | 'en_transito' | 'entregado';

export type CodigoErrorContrato =
  | 'CORREO_DUPLICADO'
  | 'STOCK_INSUFICIENTE'
  | 'RESENA_DUPLICADA'
  | 'CARRITO_VACIO'
  | 'ESTADO_INVALIDO'
  | 'SOLICITUD_DISTINTA';

export interface ApiError {
  codigo: string;
  mensaje: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

export interface LoginRequest {
  correo: string;
  contrasena: string;
}

export interface LoginResponse {
  token: string;
  tipo_token: string;
  usuario: Usuario;
}

export interface RegistroRequest {
  nombre: string;
  correo: string;
  contrasena: string;
}

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  imagen_url: string;
}

export interface CrearProductoRequest {
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  imagen_url: string;
}

export interface Inventario {
  producto_id: number;
  disponible: number;
}

export interface ReabastecerRequest {
  producto_id: number;
  cantidad: number;
}

export interface Resena {
  id: string;
  producto_id: number;
  usuario_id: number;
  calificacion: number;
  comentario: string;
}

export interface ProductoResenas {
  producto_id: number;
  promedio: number | null;
  resenas: Resena[];
}

export interface CrearResenaRequest {
  producto_id: number;
  usuario_id: number;
  calificacion: number;
  comentario: string;
}

export interface CarritoItem {
  producto_id: number;
  cantidad: number;
}

export interface Carrito {
  usuario_id: number;
  items: CarritoItem[];
}

export interface AgregarCarritoRequest {
  producto_id: number;
  cantidad: number;
}

export interface Direccion {
  calle: string;
  numero: string;
  colonia: string;
  ciudad: string;
  estado: string;
  codigo_postal: string;
}

export interface CotizarEnvioRequest {
  codigo_postal: string;
  cantidad: number;
}

export interface CotizarEnvioResponse {
  costo_envio: number;
  dias_estimados: number;
}

export interface RastreoEnvio {
  guia: string;
  estado: EstadoRastreo;
}

export interface EnvioDetalle {
  pedido_id: number;
  guia: string;
  estado: EstadoRastreo;
}

export interface PedidoItem {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
}

export interface CrearPedidoRequest {
  direccion: Direccion;
}

export interface PagarPedidoRequest {
  resultado_simulado: ResultadoSimulado;
}

export interface Pedido {
  id: number;
  usuario_id: number;
  estado: EstadoPedido;
  estado_pago: EstadoPago;
  items: PedidoItem[];
  direccion: Direccion;
  subtotal: number;
  costo_envio: number;
  total: number;
  guia: string | null;
}

export interface Pago {
  id: number;
  pedido_id: number;
  usuario_id: number;
  monto: number;
  metodo_pago: 'simulado';
  estado: 'aprobado' | 'rechazado';
}
