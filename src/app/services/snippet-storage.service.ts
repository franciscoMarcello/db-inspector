import { Injectable } from '@angular/core';

export type QuerySnippet = {
  id: string;
  name: string;
  sql: string;
  updatedAt: number; // epoch ms
};

type State = { items: QuerySnippet[] };
const KEY = 'dbi.snippets.v1';

@Injectable({ providedIn: 'root' })
export class SnippetStorageService {
  private read(): State {
    try {
      const raw = localStorage.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as State) : { items: [] };
      // sanity
      s.items = (s.items ?? []).map((it: any) => ({
        id: String(it.id ?? crypto.randomUUID()),
        name: String(it.name ?? ''),
        sql: String(it.sql ?? ''),
        updatedAt: Number(it.updatedAt ?? Date.now()),
      }));
      return s;
    } catch {
      return { items: [] };
    }
  }
  private write(s: State) {
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  list(): QuerySnippet[] {
    return this.read().items.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  get(id: string): QuerySnippet | undefined {
    return this.read().items.find((i) => i.id === id);
  }
  upsert(sn: Omit<QuerySnippet, 'id' | 'updatedAt'> & { id?: string }): QuerySnippet {
    const s = this.read();
    const now = Date.now();

    if (sn.id) {
      const i = s.items.findIndex((x) => x.id === sn.id);
      if (i >= 0) s.items[i] = { ...s.items[i], name: sn.name, sql: sn.sql, updatedAt: now };
      else s.items.push({ id: sn.id, name: sn.name, sql: sn.sql, updatedAt: now });
    } else {
      const id = crypto.randomUUID();
      s.items.push({ id, name: sn.name, sql: sn.sql, updatedAt: now });
      sn = { ...sn, id };
    }

    this.write(s);
    return this.get(sn.id!)!;
  }
  rename(id: string, name: string) {
    const s = this.read();
    const i = s.items.findIndex((x) => x.id === id);
    if (i >= 0) {
      s.items[i] = { ...s.items[i], name, updatedAt: Date.now() };
      this.write(s);
    }
  }
  remove(id: string) {
    const s = this.read();
    s.items = s.items.filter((i) => i.id !== id);
    this.write(s);
  }
  // util opcional
  export(): string {
    return JSON.stringify(this.list(), null, 2);
  }
  import(json: string) {
    const arr = JSON.parse(json) as any[];
    const s: State = { items: [] };
    for (const it of arr) {
      s.items.push({
        id: String(it.id ?? crypto.randomUUID()),
        name: String(it.name ?? ''),
        sql: String(it.sql ?? ''),
        updatedAt: Number(it.updatedAt ?? Date.now()),
      });
    }
    this.write(s);
  }
}
