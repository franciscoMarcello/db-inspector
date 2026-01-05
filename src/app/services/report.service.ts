import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvStorageService } from './env-storage.service';

export type ReportDefinition = {
  id: string;
  name: string;
  templateName: string;
  sql: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
};

const REPORT_SERVER_KEY = 'dbi.report.server';
const REPORT_TEMPLATE_KEY = 'dbi.report.template';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);

  private get backendBase(): string {
    const base = this.env.getActive()?.backend || 'http://localhost:8080/api/db';
    return base.replace(/\/+$/, '');
  }

  private makeBackendUrl(path: string): string {
    return `${this.backendBase}${path}`;
  }

  renderReport(serverUrl: string, templateName: string, data: any): Observable<Blob> {
    const url = serverUrl.replace(/\/+$/, '') + '/api/report';
    const payload = {
      template: { name: templateName },
      data,
    };
    return this.http.post(url, payload, { responseType: 'blob' }) as Observable<Blob>;
  }

  getServerUrl(): string | null {
    return localStorage.getItem(REPORT_SERVER_KEY);
  }

  setServerUrl(value: string) {
    localStorage.setItem(REPORT_SERVER_KEY, value);
  }

  getDefaultTemplate(): string | null {
    return localStorage.getItem(REPORT_TEMPLATE_KEY);
  }

  setDefaultTemplate(value: string) {
    localStorage.setItem(REPORT_TEMPLATE_KEY, value);
  }

  listReports(): Observable<ReportDefinition[]> {
    return this.http.get<ReportDefinition[]>(this.makeBackendUrl('/reports'));
  }

  createReport(
    report: Omit<ReportDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Observable<ReportDefinition> {
    return this.http.post<ReportDefinition>(this.makeBackendUrl('/reports'), report);
  }

  updateReport(
    id: string,
    report: Omit<ReportDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Observable<ReportDefinition> {
    return this.http.put<ReportDefinition>(
      this.makeBackendUrl(`/reports/${encodeURIComponent(id)}`),
      report
    );
  }

  removeReport(id: string): Observable<void> {
    return this.http.delete<void>(this.makeBackendUrl(`/reports/${encodeURIComponent(id)}`));
  }
}
