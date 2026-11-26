export const environment = {
  production: false,
  useMocks: true,
  apiUrls: {
    usuarios: 'http://localhost:8001',
    productos: 'http://localhost:8002',
    envios: 'http://localhost:8003',
    inventario: 'http://localhost:8004',
    carrito: 'http://localhost:8005',
    pedidos: 'http://localhost:8006',
    pagos: 'http://localhost:8007',
    resenas: 'http://localhost:8008',
  },
} as const;
