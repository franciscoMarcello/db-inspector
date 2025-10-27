import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { EnvStorageService } from './env-storage.service';
@Injectable({ providedIn: 'root' })
export class DbInspectorService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);
  private get base(): string {
    return this.env.getActive()?.backend || 'http://localhost:8080/api/db';
  }

  getSchemas(): Observable<string[]> {
    return this.http.get<any>(`${this.base}/schemas`).pipe(
      map((res: any) => {
        // compatível com os dois formatos: array direto OU objeto { data: [...] }
        const data = Array.isArray(res) ? res : res?.data;
        if (!Array.isArray(data)) return [];
        return data.map((row: any) => row.schema_name);
      })
    );
  }

  getTables(schema: string): Observable<string[]> {
    return this.http.get<any>(`${this.base}/${encodeURIComponent(schema)}/tables`).pipe(
      map((res: any) => {
        const data = Array.isArray(res) ? res : res?.data;
        if (!Array.isArray(data)) return [];
        return data.map((r: any) => r.table_name);
      })
    );
  }

  getTableDetails(schema: string, table: string) {
    return this.http.get(
      `${this.base}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/details`
    );
  }

  getTableRelations(schema: string, table: string) {
    return this.http.get(
      `${this.base}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/relations`
    );
  }

  runQuery(query: string): Observable<any> {
    return this.http.post<any>(`${this.base}/query`, {
      query,
      asDict: true,
      withDescription: true,
    });
  }
}
