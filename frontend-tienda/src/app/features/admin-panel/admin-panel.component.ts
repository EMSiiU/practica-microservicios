import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import {
  EnvioDetalle,
  EstadoPedido,
  EstadoRastreo,
  Pedido,
  Producto,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { EnviosService } from '../../core/services/envios.service';
import { InventarioService } from '../../core/services/inventario.service';
import { PedidosService } from '../../core/services/pedidos.service';
import { ProductosService } from '../../core/services/productos.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

interface InventarioRow {
  producto: Producto;
  disponible: number | null;
  cantidadAgregar: number;
  loading: boolean;
}

interface PedidoAdminVM {
  pedido: Pedido;
  envioEstado: EstadoRastreo | null;
  resumenProductos: string;
}

export type FiltroEstadoAdmin = 'todos' | EstadoPedido;

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [FormsModule, MxnPipe],
  templateUrl: './admin-panel.component.html',
  styleUrl: './admin-panel.component.css',
})
export class AdminPanelComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productosService = inject(ProductosService);
  private readonly inventarioService = inject(InventarioService);
  private readonly pedidosService = inject(PedidosService);
  private readonly enviosService = inject(EnviosService);
  private readonly toast = inject(ToastService);

  readonly isAdmin = computed(() => this.auth.user()?.rol === 'admin');
  readonly activeTab = signal<'productos' | 'inventario' | 'pedidos'>('productos');

  // Formulario de alta de producto
  nuevoNombre = '';
  nuevaCategoria = 'Hogar';
  nuevoPrecio: number | null = null;
  nuevaImagenUrl = '';
  nuevaDescripcion = '';
  stockInicial = 10;
  readonly creatingProduct = signal(false);

  // Tabla de inventario
  readonly inventarioRows = signal<InventarioRow[]>([]);
  readonly loadingInventario = signal(false);

  // Gestión ágil de pedidos y envíos
  readonly pedidos = signal<Pedido[]>([]);
  readonly enviosMap = signal<Map<string, EnvioDetalle>>(new Map());
  readonly productosMap = signal<Map<number, Producto>>(new Map());
  readonly loadingPedidos = signal(false);
  readonly filtroEstado = signal<FiltroEstadoAdmin>('todos');
  busquedaPedido = '';
  readonly updatingOrderId = signal<number | null>(null);
  readonly updatingGuia = signal<string | null>(null);
  readonly copiedGuia = signal<string | null>(null);

  readonly pedidosAdmin = computed<PedidoAdminVM[]>(() => {
    const envMap = this.enviosMap();
    const prodMap = this.productosMap();
    const filtro = this.filtroEstado();
    const q = this.busquedaPedido.trim().toLowerCase();

    return this.pedidos()
      .filter((p) => (filtro === 'todos' ? true : p.estado === filtro))
      .filter((p) => {
        if (!q) return true;
        return (
          String(p.id).includes(q) ||
          (p.guia ?? '').toLowerCase().includes(q) ||
          p.direccion.ciudad.toLowerCase().includes(q)
        );
      })
      .map((pedido) => {
        const envio = pedido.guia ? envMap.get(pedido.guia) : undefined;
        const resumenProductos = pedido.items
          .map((it) => {
            const nombre = prodMap.get(it.producto_id)?.nombre ?? `Producto #${it.producto_id}`;
            return `${it.cantidad}× ${nombre}`;
          })
          .join(', ');

        return {
          pedido,
          envioEstado: envio?.estado ?? (pedido.guia ? 'preparando' : null),
          resumenProductos,
        };
      });
  });

  readonly conteosEstado = computed(() => {
    const all = this.pedidos();
    return {
      todos: all.length,
      pagado: all.filter((p) => p.estado === 'pagado').length,
      enviado: all.filter((p) => p.estado === 'enviado').length,
      pendiente: all.filter((p) => p.estado === 'pendiente').length,
      cancelado: all.filter((p) => p.estado === 'cancelado').length,
    };
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'productos' || tab === 'inventario' || tab === 'pedidos') {
        this.activeTab.set(tab);
      } else {
        this.activeTab.set('productos');
      }
    });

    this.cargarInventario();
    this.cargarPedidosYEnvios();
  }

  cambiarTab(tab: 'productos' | 'inventario' | 'pedidos'): void {
    this.activeTab.set(tab);
    this.router.navigate(['/vendedor', tab]);
    if (tab === 'pedidos') {
      this.cargarPedidosYEnvios();
    } else if (tab === 'inventario') {
      this.cargarInventario();
    }
  }

  cargarInventario(): void {
    this.loadingInventario.set(true);
    this.productosService.getProductos().subscribe({
      next: (productos) => {
        const map = new Map<number, Producto>();
        for (const p of productos) {
          map.set(p.id, p);
        }
        this.productosMap.set(map);

        if (productos.length === 0) {
          this.inventarioRows.set([]);
          this.loadingInventario.set(false);
          return;
        }
        forkJoin(
          productos.map((p) =>
            this.inventarioService.getInventario(p.id).pipe(catchError(() => of(null)))
          )
        ).subscribe({
          next: (stocks) => {
            this.inventarioRows.set(
              productos.map((producto, i) => ({
                producto,
                disponible: stocks[i]?.disponible ?? null,
                cantidadAgregar: 5,
                loading: false,
              }))
            );
            this.loadingInventario.set(false);
          },
          error: () => this.loadingInventario.set(false),
        });
      },
      error: () => this.loadingInventario.set(false),
    });
  }

  cargarPedidosYEnvios(): void {
    if (!this.isAdmin()) return;

    this.loadingPedidos.set(true);
    forkJoin({
      pedidos: this.pedidosService.getTodosPedidos().pipe(catchError(() => of([] as Pedido[]))),
      envios: this.enviosService.listarEnvios().pipe(catchError(() => of([] as EnvioDetalle[]))),
    }).subscribe({
      next: ({ pedidos, envios }) => {
        this.pedidos.set(pedidos);
        const map = new Map<string, EnvioDetalle>();
        for (const e of envios) {
          map.set(e.guia, e);
        }
        this.enviosMap.set(map);
        this.loadingPedidos.set(false);
      },
      error: () => this.loadingPedidos.set(false),
    });
  }

  crearProducto(): void {
    if (
      !this.nuevoNombre.trim() ||
      !this.nuevaCategoria.trim() ||
      !this.nuevaDescripcion.trim() ||
      !this.nuevaImagenUrl.trim() ||
      this.nuevoPrecio === null ||
      this.nuevoPrecio < 0
    ) {
      this.toast.warning('Campos incompletos', 'Completa todos los datos del producto con un precio válido.');
      return;
    }

    this.creatingProduct.set(true);
    const payload = {
      nombre: this.nuevoNombre.trim(),
      descripcion: this.nuevaDescripcion.trim(),
      precio: Math.round(Number(this.nuevoPrecio) * 100) / 100,
      categoria: this.nuevaCategoria.trim(),
      imagen_url: this.nuevaImagenUrl.trim(),
    };

    const stockQty = Math.floor(Number(this.stockInicial) || 0);

    this.productosService
      .crearProducto(payload)
      .pipe(
        switchMap((creado) => {
          if (stockQty > 0) {
            return this.inventarioService
              .reabastecer({ producto_id: creado.id, cantidad: stockQty })
              .pipe(catchError(() => of(null)));
          }
          return of(null);
        })
      )
      .subscribe({
        next: () => {
          this.creatingProduct.set(false);
          this.toast.success(
            'Producto publicado',
            `${payload.nombre} agregado al catálogo${stockQty > 0 ? ` con ${stockQty} unidades en inventario` : ''}.`
          );
          this.nuevoNombre = '';
          this.nuevoPrecio = null;
          this.nuevaImagenUrl = '';
          this.nuevaDescripcion = '';
          this.stockInicial = 10;
          this.cargarInventario();
        },
        error: (err) => {
          this.creatingProduct.set(false);
          this.toast.showApiError(err, 'No se pudo crear el producto.');
        },
      });
  }

  reabastecerProducto(row: InventarioRow): void {
    const qty = Math.floor(Number(row.cantidadAgregar));
    if (!Number.isInteger(qty) || qty <= 0) {
      this.toast.warning('Cantidad inválida', 'Ingresa un número entero positivo para reabastecer.');
      return;
    }

    row.loading = true;
    this.inventarioService
      .reabastecer({ producto_id: row.producto.id, cantidad: qty })
      .subscribe({
        next: (inv) => {
          row.loading = false;
          row.disponible = inv.disponible;
          this.toast.success(
            'Inventario actualizado',
            `${row.producto.nombre}: ahora tiene ${inv.disponible} unidades disponibles.`
          );
        },
        error: (err) => {
          row.loading = false;
          this.toast.showApiError(err, 'No se pudo reabastecer el inventario.');
        },
      });
  }

  despacharPedido(pedido: Pedido): void {
    this.updatingOrderId.set(pedido.id);
    this.pedidosService.actualizarEstado(pedido.id, 'enviado').subscribe({
      next: (actualizado) => {
        this.updatingOrderId.set(null);
        this.pedidos.update((list) =>
          list.map((p) => (p.id === actualizado.id ? actualizado : p))
        );
        if (actualizado.guia) {
          this.enviosMap.update((map) => {
            const copy = new Map(map);
            copy.set(actualizado.guia!, {
              pedido_id: actualizado.id,
              guia: actualizado.guia!,
              estado: 'en_transito',
            });
            return copy;
          });
        }
        this.toast.success('Pedido despachado', `Pedido #${actualizado.id} marcado como enviado y guía en tránsito.`);
      },
      error: (err) => {
        this.updatingOrderId.set(null);
        this.toast.showApiError(err, 'No se pudo marcar el pedido como enviado.');
      },
    });
  }

  cambiarEstadoEnvio(guia: string, estado: EstadoRastreo): void {
    this.updatingGuia.set(guia);
    this.enviosService.actualizarEstadoGuia(guia, estado).subscribe({
      next: (env) => {
        this.updatingGuia.set(null);
        this.enviosMap.update((map) => {
          const copy = new Map(map);
          copy.set(env.guia, env);
          return copy;
        });
        this.toast.success('Rastreo actualizado', `La guía cambió a "${estado}".`);
      },
      error: (err) => {
        this.updatingGuia.set(null);
        this.toast.showApiError(err, 'No se pudo actualizar el estado del envío.');
      },
    });
  }

  copiarGuia(guia: string): void {
    navigator.clipboard?.writeText(guia).then(() => {
      this.copiedGuia.set(guia);
      setTimeout(() => {
        if (this.copiedGuia() === guia) this.copiedGuia.set(null);
      }, 1800);
    });
  }
}
