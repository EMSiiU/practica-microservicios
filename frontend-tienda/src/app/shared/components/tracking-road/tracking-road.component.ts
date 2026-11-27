import { Component, computed, input, signal } from '@angular/core';
import { EstadoRastreo } from '../../../core/models/api.models';

@Component({
  selector: 'app-tracking-road',
  standalone: true,
  templateUrl: './tracking-road.component.html',
  styleUrl: './tracking-road.component.css',
})
export class TrackingRoadComponent {
  readonly guia = input.required<string>();
  readonly estado = input.required<EstadoRastreo>();

  readonly copied = signal(false);

  readonly stepIndex = computed(() => {
    const st = this.estado();
    if (st === 'preparando') return 1;
    if (st === 'en_transito') return 2;
    return 3;
  });

  readonly truckLeftPercent = computed(() => {
    const idx = this.stepIndex();
    if (idx === 1) return 16;
    if (idx === 2) return 50;
    return 84;
  });

  readonly progressPercent = computed(() => {
    const idx = this.stepIndex();
    if (idx === 1) return 16;
    if (idx === 2) return 50;
    return 100;
  });

  readonly estadoTitulo = computed(() => {
    const st = this.estado();
    if (st === 'preparando') return 'Preparando tu paquete';
    if (st === 'en_transito') return '¡Tu pedido va en camino!';
    return 'Paquete entregado';
  });

  readonly estadoDescripcion = computed(() => {
    const st = this.estado();
    if (st === 'preparando') {
      return 'Estamos verificando y empacando tus artículos antes de entregarlos al transportista.';
    }
    if (st === 'en_transito') {
      return 'El vehículo de reparto ya salió con tu orden y está en ruta hacia tu código postal.';
    }
    return 'La entrega fue completada en el domicilio registrado.';
  });

  copiarGuia(): void {
    navigator.clipboard?.writeText(this.guia()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    });
  }
}
