import { Routes } from '@angular/router';
import { CatalogoComponent } from './features/catalogo/catalogo.component';
import { ProductoDetalleComponent } from './features/producto-detalle/producto-detalle.component';
import { CarritoCheckoutComponent } from './features/carrito-checkout/carrito-checkout.component';
import { MisPedidosComponent } from './features/mis-pedidos/mis-pedidos.component';

export const routes: Routes = [
  { path: '', component: CatalogoComponent },
  { path: 'producto/:id', component: ProductoDetalleComponent },
  { path: 'carrito', component: CarritoCheckoutComponent },
  { path: 'pedidos', component: MisPedidosComponent },
  { path: '**', redirectTo: '' },
];
