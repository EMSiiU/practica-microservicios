import { Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, CodigoErrorContrato } from '../models/api.models';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  codigo?: string;
  titulo: string;
  mensaje: string;
}

const CONTRACT_TITLES: Record<CodigoErrorContrato, string> = {
  CORREO_DUPLICADO: 'Correo ya registrado',
  STOCK_INSUFICIENTE: 'Stock insuficiente',
  RESENA_DUPLICADA: 'Reseña duplicada',
  CARRITO_VACIO: 'Carrito vacío',
  ESTADO_INVALIDO: 'Transición de estado inválida',
  SOLICITUD_DISTINTA: 'Solicitud inconsistente en reintento',
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<ToastMessage[]>([]);

  show(tone: ToastTone, titulo: string, mensaje: string, codigo?: string, durationMs = 5000): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, tone, titulo, mensaje, codigo }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  success(titulo: string, mensaje: string): void {
    this.show('success', titulo, mensaje);
  }

  warning(titulo: string, mensaje: string, codigo?: string): void {
    this.show('warning', titulo, mensaje, codigo, 6000);
  }

  info(titulo: string, mensaje: string): void {
    this.show('info', titulo, mensaje);
  }

  showApiError(err: unknown, fallbackMessage = 'Ocurrió un error al procesar la solicitud.'): void {
    const apiErr = this.extractApiError(err);
    const code = apiErr?.codigo;
    const knownTitle =
      code && code in CONTRACT_TITLES
        ? CONTRACT_TITLES[code as CodigoErrorContrato]
        : 'No se pudo completar la operación';
    const message = apiErr?.mensaje || fallbackMessage;

    this.show('error', knownTitle, message, code, 6500);
  }

  extractApiError(err: unknown): ApiError | null {
    if (err instanceof HttpErrorResponse) {
      if (err.error && typeof err.error === 'object' && 'codigo' in err.error && 'mensaje' in err.error) {
        return err.error as ApiError;
      }
      if (err.status === 0) {
        return {
          codigo: 'CONEXION_FALLIDA',
          mensaje: 'No fue posible conectar con el microservicio correspondiente.',
        };
      }
      return {
        codigo: `HTTP_${err.status}`,
        mensaje: err.message || 'Error inesperado del servidor.',
      };
    }

    if (err && typeof err === 'object' && 'codigo' in err && 'mensaje' in err) {
      return err as ApiError;
    }

    return null;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
