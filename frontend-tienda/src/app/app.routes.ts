import { Routes } from '@angular/router';
import { CatalogoComponent } from './features/catalogo/catalogo.component';
import { ProductoDetalleComponent } from './features/producto-detalle/producto-detalle.component';
import { CarritoCheckoutComponent } from './features/carrito-checkout/carrito-checkout.component';
import { CheckoutPagoComponent } from './features/checkout-pago/checkout-pago.component';
import { MisPedidosComponent } from './features/mis-pedidos/mis-pedidos.component';
import { RastreoComponent } from './features/rastreo/rastreo.component';
import { AdminPanelComponent } from './features/admin-panel/admin-panel.component';
import { SaludSistemaComponent } from './features/salud-sistema/salud-sistema.component';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', component: CatalogoComponent },
  { path: 'producto/:id', component: ProductoDetalleComponent },
  { path: 'carrito', component: CarritoCheckoutComponent },
  { path: 'checkout', component: CheckoutPagoComponent },
  { path: 'checkout/:id', component: CheckoutPagoComponent },
  { path: 'pedidos', component: MisPedidosComponent },
  { path: 'rastreo', component: RastreoComponent },
  { path: 'vendedor', redirectTo: 'vendedor/productos', pathMatch: 'full' },
  { path: 'vendedor/:tab', component: AdminPanelComponent, canActivate: [adminGuard] },
  { path: 'sistema', component: SaludSistemaComponent, canActivate: [adminGuard] },
  { path: 'admin/operaciones', redirectTo: 'sistema', pathMatch: 'full' },
  { path: 'admin', redirectTo: 'vendedor/productos', pathMatch: 'full' },
  { path: 'admin/:tab', redirectTo: 'vendedor/:tab', pathMatch: 'full' },
  { path: '**', redirectTo: '' },
];
