import { Injectable } from '@angular/core';

export type QuerySnippet = {
  id: string;
  name: string;
  sql: string;
  updatedAt: number;
  folder: string;
};

type State = { items: QuerySnippet[] };
const KEY = 'dbi.snippets.v1';
type SnippetUpsertInput = {
  id?: string;
  name: string;
  sql: string;
  folder?: string | null;
};

@Injectable({ providedIn: 'root' })
export class SnippetStorageService {
  private read(): State {
    try {
      const raw = localStorage.getItem(KEY);
      const s = raw ? (JSON.parse(raw) as State) : { items: [] };
      s.items = (s.items ?? []).map((it: any) => ({
        id: String(it.id ?? crypto.randomUUID()),
        name: String(it.name ?? ''),
        sql: String(it.sql ?? ''),
        updatedAt: Number(it.updatedAt ?? Date.now()),
        folder: String(it.folder ?? '').trim(),
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
  upsert(sn: SnippetUpsertInput): QuerySnippet {
    const s = this.read();
    const now = Date.now();
    const name = sn.name.trim();
    const sql = sn.sql;
    const folderProvided = Object.prototype.hasOwnProperty.call(sn, 'folder');
    const folderValue = folderProvided ? String(sn.folder ?? '').trim() : undefined;

    if (!sn.id) {
      const idxByName = s.items.findIndex(
        (x) => x.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (idxByName >= 0) {
        s.items[idxByName] = {
          ...s.items[idxByName],
          name,
          sql,
          updatedAt: now,
          ...(folderProvided ? { folder: folderValue ?? '' } : {}),
        };
        this.write(s);
        return s.items[idxByName];
      }
    }

    if (sn.id) {
      const i = s.items.findIndex((x) => x.id === sn.id);
      if (i >= 0) {
        s.items[i] = {
          ...s.items[i],
          name,
          sql,
          updatedAt: now,
          ...(folderProvided ? { folder: folderValue ?? '' } : {}),
        };
        this.write(s);
        return s.items[i];
      } else {
        const item: QuerySnippet = {
          id: sn.id,
          name,
          sql,
          updatedAt: now,
          folder: folderValue ?? '',
        };
        s.items.push(item);
        this.write(s);
        return item;
      }
    }

    const id = crypto.randomUUID();
    const item: QuerySnippet = { id, name, sql, updatedAt: now, folder: folderValue ?? '' };
    s.items.push(item);
    this.write(s);
    return item;
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
  moveToFolder(id: string, folder: string | null | undefined) {
    const s = this.read();
    const i = s.items.findIndex((x) => x.id === id);
    if (i >= 0) {
      s.items[i] = {
        ...s.items[i],
        folder: String(folder ?? '').trim(),
        updatedAt: Date.now(),
      };
      this.write(s);
    }
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
        folder: String(it.folder ?? '').trim(),
      });
    }
    this.write(s);
  }
}
