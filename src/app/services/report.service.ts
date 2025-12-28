import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  constructor(private http: HttpClient) {}

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
    return this.http.get<ReportDefinition[]>('/api/reports');
  }

  createReport(
    report: Omit<ReportDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Observable<ReportDefinition> {
    return this.http.post<ReportDefinition>('/api/reports', report);
  }

  updateReport(
    id: string,
    report: Omit<ReportDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Observable<ReportDefinition> {
    return this.http.put<ReportDefinition>(`/api/reports/${encodeURIComponent(id)}`, report);
  }

  removeReport(id: string): Observable<void> {
    return this.http.delete<void>(`/api/reports/${encodeURIComponent(id)}`);
  }
}
