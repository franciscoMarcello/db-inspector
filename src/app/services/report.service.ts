import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EnvStorageService } from './env-storage.service';

export type ReportVariableType = 'string' | 'number' | 'date' | 'datetime' | 'boolean';
export type ReportFolder = {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
};

export type ReportFolderInput = {
  name: string;
  description: string | null;
  archived?: boolean;
};

export type ReportVariable = {
  id?: string;
  key: string;
  label: string;
  type: ReportVariableType;
  required: boolean;
  defaultValue: string | null;
  orderIndex: number;
};

export type ReportVariableInput = Omit<ReportVariable, 'id'> & {
  id?: string;
};

export type ReportDefinition = {
  id: string;
  name: string;
  folderId?: string | null;
  folderName?: string;
  templateName?: string;
  sql: string;
  description: string | null;
  variables: ReportVariable[];
  archived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ReportCreateInput = {
  name: string;
  folderId: string;
  templateName?: string;
  sql: string;
  description: string | null;
  variables: ReportVariableInput[];
  archived?: boolean;
};

export type ReportRunSummary = {
  column: string;
  sum: number;
};

export type ReportRunResponse = {
  name: string;
  meta: {
    environment: string;
    generatedAt: string;
    lastRunAt: string;
    rowCount: number;
    elapsedMs: number;
    truncated: boolean;
  };
  query: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summaries: ReportRunSummary[];
};

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);

  private get base(): string {
    return this.env.getActive()?.backend || '/api/db';
  }

  listFolders(): Observable<ReportFolder[]> {
    return this.http
      .get<any>(`${this.base}/report-folders`)
      .pipe(map((res) => this.normalizeFolders(res)));
  }

  createFolder(payload: ReportFolderInput): Observable<ReportFolder> {
    return this.http
      .post<any>(`${this.base}/report-folders`, payload)
      .pipe(map((res) => this.normalizeFolder(res)));
  }

  updateFolder(id: string, payload: ReportFolderInput): Observable<ReportFolder> {
    return this.http
      .put<any>(`${this.base}/report-folders/${encodeURIComponent(id)}`, payload)
      .pipe(map((res) => this.normalizeFolder(res)));
  }

  deleteFolder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/report-folders/${encodeURIComponent(id)}`);
  }

  listReports(): Observable<ReportDefinition[]> {
    return this.http
      .get<any>(`${this.base}/reports`)
      .pipe(map((res) => this.normalizeReports(res)));
  }

  createReport(payload: ReportCreateInput): Observable<ReportDefinition> {
    return this.http
      .post<any>(`${this.base}/reports`, {
        ...payload,
        folder_id: payload.folderId,
      })
      .pipe(map((res) => this.normalizeReport(res)));
  }

  updateReport(id: string, payload: ReportCreateInput): Observable<ReportDefinition> {
    return this.http
      .put<any>(`${this.base}/reports/${encodeURIComponent(id)}`, {
        ...payload,
        folder_id: payload.folderId,
      })
      .pipe(map((res) => this.normalizeReport(res)));
  }

  deleteReport(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/reports/${encodeURIComponent(id)}`);
  }

  runReport(id: string): Observable<ReportRunResponse> {
    return this.http.post<ReportRunResponse>(`${this.base}/reports/${encodeURIComponent(id)}/run`, {});
  }

  runReportWithParams(
    id: string,
    params?: Record<string, unknown> | null
  ): Observable<ReportRunResponse> {
    const body =
      params && Object.keys(params).length
        ? { params }
        : null;
    return this.http.post<ReportRunResponse>(`${this.base}/reports/${encodeURIComponent(id)}/run`, body);
  }

  private normalizeFolders(res: any): ReportFolder[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeFolder(item))
      .filter((item: ReportFolder | null): item is ReportFolder => !!item);
  }

  private normalizeFolder(item: any): ReportFolder {
    return {
      id: String(item?.id ?? item?.folderId ?? item?.folder_id ?? ''),
      name: String(item?.name ?? ''),
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      archived: Boolean(item?.archived),
    };
  }

  private normalizeReports(res: any): ReportDefinition[] {
    const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return data
      .map((item: any) => this.normalizeReport(item))
      .filter((item: ReportDefinition | null): item is ReportDefinition => !!item);
  }

  private normalizeReport(item: any): ReportDefinition {
    return {
      id: String(item?.id ?? ''),
      name: String(item?.name ?? ''),
      folderId: this.extractFolderId(item),
      folderName: this.extractFolderName(item),
      templateName:
        item?.templateName !== undefined
          ? String(item.templateName ?? '')
          : item?.template_name !== undefined
          ? String(item.template_name ?? '')
          : undefined,
      sql: String(item?.sql ?? ''),
      description:
        item?.description === null || item?.description === undefined
          ? null
          : String(item.description),
      variables: Array.isArray(item?.variables)
        ? item.variables.map((v: any) => this.normalizeVariable(v))
        : [],
      archived: Boolean(item?.archived),
      createdAt: Number(item?.createdAt ?? item?.created_at ?? 0),
      updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0),
    };
  }

  private normalizeVariable(item: any): ReportVariable {
    return {
      id: item?.id ? String(item.id) : undefined,
      key: String(item?.key ?? ''),
      label: String(item?.label ?? item?.key ?? ''),
      type: this.normalizeVariableType(item?.type),
      required: Boolean(item?.required),
      defaultValue:
        item?.defaultValue === null || item?.defaultValue === undefined
          ? null
          : String(item.defaultValue),
      orderIndex: Number(item?.orderIndex ?? 0),
    };
  }

  private normalizeVariableType(value: any): ReportVariableType {
    const t = String(value ?? 'string').toLowerCase();
    if (t === 'number' || t === 'date' || t === 'datetime' || t === 'boolean') return t;
    return 'string';
  }

  private extractFolderId(item: any): string | null {
    const raw =
      item?.folderId ??
      item?.folder_id ??
      item?.reportFolderId ??
      item?.report_folder_id ??
      item?.folder?.id ??
      null;
    if (raw === null || raw === undefined || raw === '') return null;
    return String(raw);
  }

  private extractFolderName(item: any): string | undefined {
    const raw =
      item?.folderName ??
      item?.folder_name ??
      item?.reportFolderName ??
      item?.report_folder_name ??
      item?.folder?.name ??
      undefined;
    if (raw === undefined || raw === null || raw === '') return undefined;
    return String(raw);
  }
}
