import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DbInspectorService {
  private http = inject(HttpClient);
  private base = 'http://localhost:8080/test';

 getSchemas(): Observable<string[]> {
  return this.http.get<any>(`${this.base}/schemas`).pipe(
    map(response => {
      // backend retorna { fields: [...], data: [{ schema_name: "..." }, ...] }
      if (!response.data) return [];
      return response.data.map((row: any) => row.schema_name);
    })
  );
}

  getTables(schema: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/${schema}/tables`).pipe(
      map((res: any) => Array.isArray(res) ? res : res?.data?.map((r:any)=>r.table_name) ?? [])
    );
  }

  getTableDetails(schema: string, table: string) {
    return this.http.get(`${this.base}/${schema}/${table}/details`);
  }

  getTableRelations(schema: string, table: string) {
    return this.http.get(`${this.base}/${schema}/${table}/relations`);
  }
  runQuery(query: string): Observable<any> {
    return this.http.post<any>(`${this.base}/query`, {
      query,
      asDict: true,
      withDescription: true
    });
  }
}
