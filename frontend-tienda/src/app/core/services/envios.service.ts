import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockStoreService } from '../mocks/mock-store.service';
import { CotizarEnvioRequest, CotizarEnvioResponse, RastreoEnvio } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class EnviosService {
  private readonly http = inject(HttpClient);
  private readonly mockStore = inject(MockStoreService);

  cotizar(payload: CotizarEnvioRequest): Observable<CotizarEnvioResponse> {
    if (environment.useMocks) {
      return this.mockStore.cotizarEnvio(payload);
    }
    return this.http.post<CotizarEnvioResponse>(`${environment.apiUrls.envios}/api/envios/cotizar`, payload);
  }

  rastrear(guia: string): Observable<RastreoEnvio> {
    if (environment.useMocks) {
      return this.mockStore.getRastreo(guia);
    }
    return this.http.get<RastreoEnvio>(
      `${environment.apiUrls.envios}/api/envios/rastreo/${encodeURIComponent(guia)}`
    );
  }
}
