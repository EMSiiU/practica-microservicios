import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Producto } from '../../core/models/api.models';
import { CarritoService } from '../../core/services/carrito.service';
import { InventarioService } from '../../core/services/inventario.service';
import { ProductosService } from '../../core/services/productos.service';
import { ResenasService } from '../../core/services/resenas.service';
import { SearchService } from '../../core/services/search.service';
import { ToastService } from '../../core/services/toast.service';
import { MxnPipe } from '../../shared/pipes/mxn.pipe';

export interface ProductoCardVM {
  producto: Producto;
  disponible: number | null;
  promedio: number | null;
  totalResenas: number;
}

export type PriceRangeKey = 'all' | 'under500' | '500to1200' | 'over1200';
export type SortOption = 'featured' | 'price_asc' | 'price_desc' | 'rating_desc';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [RouterLink, FormsModule, MxnPipe],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.css',
})
export class CatalogoComponent implements OnInit {
  private readonly productosService = inject(ProductosService);
  private readonly inventarioService = inject(InventarioService);
  private readonly resenasService = inject(ResenasService);
  private readonly carritoService = inject(CarritoService);
  private readonly searchService = inject(SearchService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly items = signal<ProductoCardVM[]>([]);
  readonly selectedCategory = signal<string>('Todos');
  readonly priceRange = signal<PriceRangeKey>('all');
  readonly onlyInStock = signal<boolean>(false);
  readonly sortBy = signal<SortOption>('featured');
  readonly addingId = signal<number | null>(null);

  readonly categoryOptions = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.items()) {
      const cat = item.producto.categoria;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [
      { name: 'Todos', count: this.items().length },
      ...Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    ];
  });

  readonly priceRanges = computed(() => {
    const all = this.items();
    const total = Math.max(1, all.length);
    const under500 = all.filter((i) => i.producto.precio < 500).length;
    const mid = all.filter((i) => i.producto.precio >= 500 && i.producto.precio <= 1200).length;
    const over1200 = all.filter((i) => i.producto.precio > 1200).length;

    return [
      { key: 'under500' as const, label: 'Menos de $500', count: under500, pct: Math.round((under500 / total) * 100) },
      { key: '500to1200' as const, label: '$500 a $1,200', count: mid, pct: Math.round((mid / total) * 100) },
      { key: 'over1200' as const, label: 'Más de $1,200', count: over1200, pct: Math.round((over1200 / total) * 100) },
    ];
  });

  readonly inStockCount = computed(() =>
    this.items().filter((i) => i.disponible === null || i.disponible > 0).length
  );

  readonly hasActiveFilters = computed(
    () =>
      this.selectedCategory() !== 'Todos' ||
      this.priceRange() !== 'all' ||
      this.onlyInStock() ||
      this.searchService.query().trim().length > 0
  );

  readonly sortedItems = computed(() => {
    const category = this.selectedCategory();
    const range = this.priceRange();
    const stockOnly = this.onlyInStock();
    const query = this.searchService.query().trim().toLowerCase();

    const filtered = this.items().filter(({ producto, disponible }) => {
      if (category !== 'Todos' && producto.categoria !== category) return false;

      if (range === 'under500' && producto.precio >= 500) return false;
      if (range === '500to1200' && (producto.precio < 500 || producto.precio > 1200)) return false;
      if (range === 'over1200' && producto.precio <= 1200) return false;

      if (stockOnly && disponible !== null && disponible <= 0) return false;

      if (
        query &&
        !producto.nombre.toLowerCase().includes(query) &&
        !producto.categoria.toLowerCase().includes(query) &&
        !producto.descripcion.toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });

    const sort = this.sortBy();
    if (sort === 'price_asc') {
      return [...filtered].sort((a, b) => a.producto.precio - b.producto.precio);
    }
    if (sort === 'price_desc') {
      return [...filtered].sort((a, b) => b.producto.precio - a.producto.precio);
    }
    if (sort === 'rating_desc') {
      return [...filtered].sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
    }
    return filtered;
  });

  ngOnInit(): void {
    this.cargarCatalogo();
  }

  cargarCatalogo(): void {
    this.loading.set(true);
    this.productosService.getProductos().subscribe({
      next: (productos) => {
        if (productos.length === 0) {
          this.items.set([]);
          this.loading.set(false);
          return;
        }

        const requests = productos.map((producto) =>
          forkJoin({
            inventario: this.inventarioService
              .getInventario(producto.id)
              .pipe(catchError(() => of(null))),
            resenas: this.resenasService
              .getResenasProducto(producto.id)
              .pipe(catchError(() => of({ producto_id: producto.id, promedio: null, resenas: [] }))),
          })
        );

        forkJoin(requests).subscribe({
          next: (details) => {
            const vms: ProductoCardVM[] = productos.map((producto, idx) => ({
              producto,
              disponible: details[idx].inventario?.disponible ?? null,
              promedio: details[idx].resenas.promedio,
              totalResenas: details[idx].resenas.resenas.length,
            }));
            this.items.set(vms);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.showApiError(err, 'No se pudo cargar el catálogo de productos.');
      },
    });
  }

  selectCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  togglePriceRange(key: PriceRangeKey): void {
    this.priceRange.set(this.priceRange() === key ? 'all' : key);
  }

  toggleInStock(): void {
    this.onlyInStock.update((v) => !v);
  }

  clearFilters(): void {
    this.selectedCategory.set('Todos');
    this.priceRange.set('all');
    this.onlyInStock.set(false);
    this.searchService.clear();
  }

  agregarRapido(vm: ProductoCardVM): void {
    if (vm.disponible !== null && vm.disponible <= 0) {
      this.toast.warning('Sin existencias', 'Este producto está agotado temporalmente.', 'STOCK_INSUFICIENTE');
      return;
    }

    this.addingId.set(vm.producto.id);
    this.carritoService.agregarProducto(vm.producto.id, 1).subscribe({
      next: () => {
        this.addingId.set(null);
        this.toast.success('Agregado al carrito', `${vm.producto.nombre} se añadió a tu carrito.`);
      },
      error: (err) => {
        this.addingId.set(null);
        if (err?.codigo !== 'NO_AUTENTICADO') {
          this.toast.showApiError(err);
        } else {
          this.toast.info('Inicia sesión', err.mensaje);
        }
      },
    });
  }
}
