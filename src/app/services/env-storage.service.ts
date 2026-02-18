import { Injectable } from '@angular/core';

export type EnvConfig = {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  backend: string;
};

@Injectable({ providedIn: 'root' })
export class EnvStorageService {
  private resolveBackendBase(): string {
    const host = window.location.hostname || '';
    const isDev =
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
    return isDev ? 'http://localhost:8080/api/db' : '/api/db';
  }

  private fixedEnv(): EnvConfig {
    const backend = this.resolveBackendBase();
    return {
      id: 'fixed',
      name: backend.includes('localhost:8080') ? 'Desenvolvimento' : 'Produção',
      url: '',
      apiKey: '',
      backend,
    };
  }

  all(): EnvConfig[] {
    return [this.fixedEnv()];
  }
  getActive(): EnvConfig | null {
    return this.fixedEnv();
  }
  setActive(_id: string): void {}

  upsert(cfg: Omit<EnvConfig, 'id'> & { id?: string }): EnvConfig {
    return {
      id: cfg.id || 'fixed',
      name: cfg.name || this.fixedEnv().name,
      url: cfg.url || '',
      apiKey: cfg.apiKey || '',
      backend: this.resolveBackendBase(),
    };
  }
  remove(_id: string): void {}
}
