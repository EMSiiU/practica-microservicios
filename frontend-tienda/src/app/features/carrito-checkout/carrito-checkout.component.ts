import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CotizarEnvioResponse,
  Direccion,
  Pedido,
  Producto,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { CarritoService } from '../../core/services/carrito.service';
import { EnviosService } from '../../core/services/envios.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ProductosService } from '../../core/services/productos.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

interface LineaCarritoVM {
  producto_id: number;
  nombre: string;
  categoria: string;
  imagen_url: string;
  precio: number;
  cantidad: number;
  subtotal: number;
}

@Component({
  selector: 'app-carrito-checkout',
  standalone: true,
  imports: [RouterLink, FormsModule, MxnPipe],
  templateUrl: './carrito-checkout.component.html',
  styleUrl: './carrito-checkout.component.css',
})
export class CarritoCheckoutComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly carritoService = inject(CarritoService);
  private readonly productosService = inject(ProductosService);
  private readonly enviosService = inject(EnviosService);
  private readonly pedidosService = inject(PedidosService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly productosMap = signal<Map<number, Producto>>(new Map());
  readonly pedidoPendiente = signal<Pedido | null>(null);

  readonly direccion: Direccion = {
    calle: 'República de Brasil',
    numero: '12',
    colonia: 'Centro',
    ciudad: 'Ciudad de México',
    estado: 'Ciudad de México',
    codigo_postal: '06000',
  };

  readonly cotizacion = signal<CotizarEnvioResponse | null>(null);
  readonly quoting = signal(false);
  readonly creatingOrder = signal(false);

  readonly lineasCarrito = computed<LineaCarritoVM[]>(() => {
    const prodMap = this.productosMap();
    return this.carritoService.items().map((item) => {
      const prod = prodMap.get(item.producto_id);
      const precio = prod?.precio ?? 0;
      return {
        producto_id: item.producto_id,
        nombre: prod?.nombre ?? `Producto #${item.producto_id}`,
        categoria: prod?.categoria ?? 'Catálogo',
        imagen_url: prod?.imagen_url ?? '',
        precio,
        cantidad: item.cantidad,
        subtotal: Math.round(precio * item.cantidad * 100) / 100,
      };
    });
  });

  readonly totalUnidades = computed(() =>
    this.carritoService.items().reduce((acc, item) => acc + item.cantidad, 0)
  );

  readonly subtotalEstimado = computed(() =>
    Math.round(this.lineasCarrito().reduce((acc, l) => acc + l.subtotal, 0) * 100) / 100
  );

  readonly totalEstimado = computed(() => {
    const envio = this.cotizacion()?.costo_envio ?? 0;
    return Math.round((this.subtotalEstimado() + envio) * 100) / 100;
  });

  ngOnInit(): void {
    this.productosService.getProductos().subscribe({
      next: (list) => {
        const map = new Map<number, Producto>();
        for (const prod of list) {
          map.set(prod.id, prod);
        }
        this.productosMap.set(map);
      },
    });

    if (this.auth.isAuthenticated()) {
      const uid = this.auth.user()!.id;
      this.carritoService.loadCarrito(uid).subscribe({
        next: () => {
          if (this.totalUnidades() > 0 && /^\d{5}$/.test(this.direccion.codigo_postal)) {
            this.cotizarEnvio();
          }
        },
        error: () => {},
      });

      this.pedidosService.getPedidosUsuario(uid).subscribe({
        next: (pedidos) => {
          const pendiente = pedidos.find((p) => p.estado === 'pendiente') ?? null;
          this.pedidoPendiente.set(pendiente);
        },
        error: () => {},
      });
    }
  }

  vaciar(): void {
    this.carritoService.vaciarCarrito().subscribe({
      next: () => {
        this.cotizacion.set(null);
        this.toast.info('Carrito vacío', 'Se han eliminado todos los artículos del carrito.');
      },
      error: (err) => this.toast.showApiError(err),
    });
  }

  cotizarEnvio(): void {
    const cp = this.direccion.codigo_postal.trim();
    if (!/^\d{5}$/.test(cp)) {
      this.toast.warning('Código postal inválido', 'Ingresa un código postal mexicano de 5 dígitos.');
      return;
    }

    const cantidad = Math.max(1, this.totalUnidades());
    this.quoting.set(true);
    this.enviosService.cotizar({ codigo_postal: cp, cantidad }).subscribe({
      next: (res) => {
        this.cotizacion.set(res);
        this.quoting.set(false);
      },
      error: (err) => {
        this.quoting.set(false);
        this.toast.showApiError(err);
      },
    });
  }

  private validarDireccion(): boolean {
    const fields: Array<[string, string]> = [
      ['calle', this.direccion.calle],
      ['número', this.direccion.numero],
      ['colonia', this.direccion.colonia],
      ['ciudad', this.direccion.ciudad],
      ['estado', this.direccion.estado],
    ];
    for (const [label, val] of fields) {
      if (!val.trim()) {
        this.toast.warning('Dirección incompleta', `El campo ${label} es obligatorio.`);
        return false;
      }
    }
    if (!/^\d{5}$/.test(this.direccion.codigo_postal.trim())) {
      this.toast.warning('Código postal inválido', 'Debe ser una cadena de 5 dígitos (ej. 06000).');
      return false;
    }
    return true;
  }

  crearPedido(): void {
    if (!this.auth.isAuthenticated()) {
      this.auth.openModal('login');
      return;
    }
    if (!this.validarDireccion()) return;

    this.creatingOrder.set(true);

    this.pedidosService
      .crearPedido({
        direccion: {
          calle: this.direccion.calle.trim(),
          numero: this.direccion.numero.trim(),
          colonia: this.direccion.colonia.trim(),
          ciudad: this.direccion.ciudad.trim(),
          estado: this.direccion.estado.trim(),
          codigo_postal: this.direccion.codigo_postal.trim(),
        },
      })
      .subscribe({
        next: (pedido) => {
          this.creatingOrder.set(false);
          this.pedidosService.setPedidoActivo(pedido);
          this.toast.success('Pedido creado', `Orden #${pedido.id} lista. Pasando a la pantalla de pago.`);
          this.router.navigate(['/checkout', pedido.id]);
        },
        error: (err) => {
          this.creatingOrder.set(false);
          this.toast.showApiError(err);
        },
      });
  }
}
