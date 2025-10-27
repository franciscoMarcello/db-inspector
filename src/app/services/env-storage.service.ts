import { Injectable } from '@angular/core';

export type EnvConfig = { id: string; name: string; url: string; apiKey: string; backend: string };
type EnvState = { items: EnvConfig[]; activeId: string | null };
const KEY = 'env_state_v1';

@Injectable({ providedIn: 'root' })
export class EnvStorageService {
  private read(): EnvState {
    try {
      const raw = localStorage.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as EnvState) : { items: [], activeId: null };

      s.items = (s.items ?? []).map((it: any) => ({
        id: String(it.id ?? crypto.randomUUID()),
        name: String(it.name ?? ''),
        url: String(it.url ?? ''),
        apiKey: String(it.apiKey ?? ''),
        backend: String(it.backend ?? 'http://localhost:8080/api/db'),
      }));

      return s;
    } catch {
      return { items: [], activeId: null };
    }
  }
  private write(s: EnvState) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  all(): EnvConfig[] {
    return this.read().items;
  }
  getActive(): EnvConfig | null {
    const s = this.read();
    return s.items.find((i) => i.id === s.activeId) ?? null;
  }
  setActive(id: string): void {
    const s = this.read();
    if (s.items.some((i) => i.id === id)) {
      s.activeId = id;
      this.write(s);
    }
  }
  upsert(cfg: Omit<EnvConfig, 'id'> & { id?: string }): EnvConfig {
    const s = this.read();
    if (cfg.id) {
      const i = s.items.findIndex((x) => x.id === cfg.id);
      if (i >= 0) s.items[i] = { ...s.items[i], ...cfg } as EnvConfig;
      else s.items.push(cfg as EnvConfig);
    } else {
      const id = crypto.randomUUID();
      s.items.push({ id, name: cfg.name, url: cfg.url, apiKey: cfg.apiKey, backend: cfg.backend });
      cfg = { ...cfg, id };
    }
    if (!s.activeId && s.items.length) s.activeId = s.items[0].id;
    this.write(s);
    return s.items.find((x) => x.id === cfg.id)!;
  }
  remove(id: string): void {
    const s = this.read();
    s.items = s.items.filter((i) => i.id !== id);
    if (s.activeId === id) s.activeId = s.items[0]?.id ?? null;
    this.write(s);
  }
}
