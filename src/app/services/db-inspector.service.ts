import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { EnvStorageService } from './env-storage.service';

export interface EmailSendPayload {
  sql: string;
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
  comparisonTitle?: string;
  comparisonNote?: string;
  reportId?: string;
  attachPdf?: boolean;
  pdfMode?: 'report' | 'scheduled_sql';
  pdfTitle?: string;
  pdfSubtitle?: string;
  pdfIncludeSummary?: boolean;
  pdfMaxRows?: number;
  attachXlsx?: boolean;
  compareWithSap?: boolean;
  secondSql?: string;
  comparisonKey?: string;
  comparisonTolerances?: Record<string, number>;
  comparisonTolerancePercents?: Record<string, number>;
  comparisonColumns?: string[];
  comparisonIgnoreColumns?: string[];
  comparisonGroupBy?: string;
  comparisonValueColumn?: string;
  comparisonTopN?: number;
  sendOnlyIfDifferent?: boolean;
  time?: string;
  days?: string[];
  asDict?: boolean;
  withDescription?: boolean;
}

export interface ComparisonPreviewPayload {
  sql: string;
  secondSql: string;
  comparisonKey?: string;
  comparisonTolerances?: Record<string, number>;
  comparisonTolerancePercents?: Record<string, number>;
  comparisonColumns?: string[];
  comparisonIgnoreColumns?: string[];
  comparisonGroupBy?: string;
  comparisonValueColumn?: string;
  sampleLimit?: number;
}

export interface ComparisonGroupSummary {
  group: string;
  onlyInSource1: number;
  onlyInSource2: number;
  divergentValues: number;
  deltaSum: number;
  valueOnlyInSource1: number;
  valueOnlyInSource2: number;
}

export interface ComparisonDifferenceView {
  type: 'ONLY_IN_SOURCE1' | 'ONLY_IN_SOURCE2' | 'DIVERGENT_VALUE';
  key?: string;
  column?: string;
  value1?: string;
  value2?: string;
  delta?: number;
  row: Record<string, unknown>;
}

export interface ComparisonPreviewResponse {
  status: 'DIVERGENCIA' | 'SEM_DIVERGENCIA';
  onlyInSource1: number;
  onlyInSource2: number;
  differentRows: number;
  matchedRows: number;
  divergencePercent: number;
  columnsSource1: string[];
  columnsSource2: string[];
  comparedColumns: string[];
  groups: ComparisonGroupSummary[];
  differencesSample: ComparisonDifferenceView[];
  differencesTotal: number;
}

export interface EmailSendResponse {
  status: 'sent' | 'scheduled' | 'skipped';
  previewRows?: number;
  attachedCsv?: boolean;
  scheduleId?: string;
  cron?: string;
  nextRun?: string;
}

export interface EmailTestPayload {
  to: string;
  cc?: string;
  subject?: string;
  message?: string;
}

export interface EmailTestResponse {
  status: 'sent';
}

export interface ApiEmailSchedule {
  id: string;
  sql: string;
  secondSql?: string;
  compareWithSap?: boolean;
  comparisonKey?: string;
  comparisonTolerances?: Record<string, number>;
  comparisonTolerancePercents?: Record<string, number>;
  comparisonColumns?: string[];
  comparisonIgnoreColumns?: string[];
  comparisonGroupBy?: string;
  comparisonValueColumn?: string;
  comparisonTopN?: number;
  sendOnlyIfDifferent?: boolean;
  to: string;
  cc: string;
  subject: string;
  message?: string;
  comparisonTitle?: string;
  comparisonNote?: string;
  reportId?: string;
  attachPdf?: boolean;
  pdfMode?: 'report' | 'scheduled_sql';
  pdfTitle?: string;
  pdfSubtitle?: string;
  pdfIncludeSummary?: boolean;
  pdfMaxRows?: number;
  attachXlsx?: boolean;
  time: string;
  days: string[];
  status?: string;
  cron?: string;
  nextRun?: string;
  asDict?: boolean;
  withDescription?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DbInspectorService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);
  private get base(): string {
    return this.env.getActive()?.backend || '/api/db';
  }

  getSchemas(): Observable<string[]> {
    return this.http.get<any>(`${this.base}/schemas`).pipe(
      map((res: any) => {
        const data = Array.isArray(res) ? res : res?.data;
        if (!Array.isArray(data)) return [];
        return data.map((row: any) => row.schema_name);
      }),
    );
  }

  getTables(schema: string): Observable<string[]> {
    return this.http.get<any>(`${this.base}/${encodeURIComponent(schema)}/tables`).pipe(
      map((res: any) => {
        const data = Array.isArray(res) ? res : res?.data;
        if (!Array.isArray(data)) return [];
        return data.map((r: any) => r.table_name);
      }),
    );
  }

  getTableDetails(schema: string, table: string) {
    return this.http.get(
      `${this.base}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/details`,
    );
  }

  getTableRelations(schema: string, table: string) {
    return this.http.get(
      `${this.base}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/relations`,
    );
  }

  runQuery(query: string, page = 0, size = 200): Observable<any> {
    return this.http.post<any>(`${this.base}/query`, {
      query,
      page,
      size,
      asDict: true,
      withDescription: true,
    });
  }

  runQueryAll(query: string): Observable<any> {
    return this.http.post<any>(`${this.base}/query/all`, {
      query,
      asDict: true,
      withDescription: true,
    });
  }

  sendEmail(payload: EmailSendPayload): Observable<EmailSendResponse> {
    return this.http.post<EmailSendResponse>(`${this.base}/email/send`, {
      asDict: true,
      withDescription: true,
      ...payload,
    });
  }

  sendEmailTest(payload: EmailTestPayload): Observable<EmailTestResponse> {
    return this.http.post<EmailTestResponse>(`${this.base}/email/test`, payload);
  }

  listEmailSchedules(): Observable<ApiEmailSchedule[]> {
    return this.http.get<ApiEmailSchedule[]>(`${this.base}/email/schedules`);
  }

  getEmailSchedule(id: string): Observable<ApiEmailSchedule> {
    return this.http.get<ApiEmailSchedule>(
      `${this.base}/email/schedules/${encodeURIComponent(id)}`,
    );
  }

  createEmailSchedule(payload: Omit<ApiEmailSchedule, 'id'>): Observable<ApiEmailSchedule> {
    return this.http.post<ApiEmailSchedule>(`${this.base}/email/schedules`, payload);
  }

  updateEmailSchedule(
    id: string,
    payload: Partial<ApiEmailSchedule>,
  ): Observable<ApiEmailSchedule> {
    return this.http.put<ApiEmailSchedule>(
      `${this.base}/email/schedules/${encodeURIComponent(id)}`,
      payload,
    );
  }

  pauseEmailSchedule(id: string): Observable<ApiEmailSchedule> {
    return this.http.post<ApiEmailSchedule>(
      `${this.base}/email/schedules/${encodeURIComponent(id)}/pause`,
      {},
    );
  }

  resumeEmailSchedule(id: string): Observable<ApiEmailSchedule> {
    return this.http.post<ApiEmailSchedule>(
      `${this.base}/email/schedules/${encodeURIComponent(id)}/resume`,
      {},
    );
  }

  deleteEmailSchedule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/email/schedules/${encodeURIComponent(id)}`);
  }

  previewEmailComparison(payload: ComparisonPreviewPayload): Observable<ComparisonPreviewResponse> {
    return this.http.post<ComparisonPreviewResponse>(
      `${this.base}/email/schedules/preview`,
      payload,
    );
  }

  runEmailSchedule(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/email/schedules/${encodeURIComponent(id)}/run`, {});
  }
}
