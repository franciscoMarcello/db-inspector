import { Injectable } from '@angular/core';

export type EnvConfig = {
  backend: string;
};

@Injectable({ providedIn: 'root' })
export class EnvStorageService {
  private resolveBackendBase(): string {
    const win = window as Window & {
      __AGROREPORT_CONFIG__?: { apiBase?: string };
    };
    const runtimeApiBase = String(win.__AGROREPORT_CONFIG__?.apiBase || '').trim();
    if (runtimeApiBase) return runtimeApiBase;

    const metaApiBase = document
      .querySelector('meta[name="agroreport-api-base"]')
      ?.getAttribute('content')
      ?.trim();
    if (metaApiBase) return metaApiBase;

    const host = window.location.hostname || '';
    const isLocalDev =
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
    return isLocalDev ? 'http://localhost:8080/api/db' : '/api/db';
  }

  getActive(): EnvConfig | null {
    return { backend: this.resolveBackendBase() };
  }
}
