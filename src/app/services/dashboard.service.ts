import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EnvStorageService } from './env-storage.service';

export type DashboardSystem = 'AGROMOBI' | 'SAP';
export type DashboardWidgetType = 'kpi' | 'bar' | 'line' | 'pie' | 'table';

export type DashboardFilterType = 'text' | 'number' | 'date';

export type DashboardFilterConfig = {
  key: string;
  label: string;
  type: DashboardFilterType;
  defaultValue?: string | number | null;
};

export type DashboardWidget = {
  id: string;
  dashboardId: string;
  title: string;
  type: DashboardWidgetType;
  querySql: string;
  configJson: Record<string, unknown> | null;
  layoutJson: Record<string, unknown> | null;
  positionOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Dashboard = {
  id: string;
  name: string;
  description: string | null;
  system: DashboardSystem;
  filtersJson: DashboardFilterConfig[];
  archived: boolean;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  widgets: DashboardWidget[];
};

export type DashboardInput = {
  name: string;
  description?: string | null;
  system: DashboardSystem;
  filtersJson?: DashboardFilterConfig[];
  archived?: boolean;
};

export type DashboardWidgetInput = {
  title: string;
  type: DashboardWidgetType;
  querySql: string;
  configJson?: Record<string, unknown> | null;
  layoutJson?: Record<string, unknown> | null;
  positionOrder?: number;
};

export type DashboardRunResult = {
  meta: {
    elapsedMs: number;
    rowCount: number;
    truncated: boolean;
  };
  columns: string[];
  rows: Record<string, unknown>[];
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);

  private get base(): string {
    return `${this.env.getActive()?.backend || '/api/db'}/dashboards`;
  }

  list(system?: DashboardSystem, archived = false): Observable<Dashboard[]> {
    return this.http
      .get<any>(this.base, { params: { ...(system ? { system } : {}), archived: String(archived) } })
      .pipe(map((res) => this.normalizeDashboardList(res)));
  }

  getById(id: string): Observable<Dashboard> {
    return this.http.get<any>(`${this.base}/${encodeURIComponent(id)}`).pipe(map((res) => this.normalizeDashboard(res)));
  }

  create(payload: DashboardInput): Observable<Dashboard> {
    return this.http.post<any>(this.base, payload).pipe(map((res) => this.normalizeDashboard(res)));
  }

  update(id: string, payload: DashboardInput): Observable<Dashboard> {
    return this.http.put<any>(`${this.base}/${encodeURIComponent(id)}`, payload).pipe(map((res) => this.normalizeDashboard(res)));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(id)}`);
  }

  createWidget(dashboardId: string, payload: DashboardWidgetInput): Observable<DashboardWidget> {
    return this.http
      .post<any>(`${this.base}/${encodeURIComponent(dashboardId)}/widgets`, payload)
      .pipe(map((res) => this.normalizeWidget(res, dashboardId)));
  }

  updateWidget(dashboardId: string, widgetId: string, payload: DashboardWidgetInput): Observable<DashboardWidget> {
    return this.http
      .put<any>(`${this.base}/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}`, payload)
      .pipe(map((res) => this.normalizeWidget(res, dashboardId)));
  }

  deleteWidget(dashboardId: string, widgetId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}`);
  }

  previewWidget(dashboardId: string, widgetId: string, params?: Record<string, unknown>): Observable<DashboardRunResult> {
    return this.http
      .post<any>(
        `${this.base}/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}/preview`,
        this.buildRunBody(params)
      )
      .pipe(map((res) => this.normalizeRunResult(res)));
  }

  runWidget(dashboardId: string, widgetId: string, params?: Record<string, unknown>): Observable<DashboardRunResult> {
    return this.http
      .post<any>(
        `${this.base}/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}/run`,
        this.buildRunBody(params)
      )
      .pipe(map((res) => this.normalizeRunResult(res)));
  }

  private normalizeDashboardList(res: any): Dashboard[] {
    const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    return list.map((item: any) => this.normalizeDashboard(item));
  }

  private normalizeDashboard(item: any): Dashboard {
    const id = String(item?.id ?? '');
    const widgetsRaw = Array.isArray(item?.widgets) ? item.widgets : [];
    return {
      id,
      name: String(item?.name ?? ''),
      description: item?.description == null ? null : String(item.description),
      system: String(item?.system ?? 'AGROMOBI').toUpperCase() === 'SAP' ? 'SAP' : 'AGROMOBI',
      filtersJson: this.normalizeFilters(item?.filtersJson ?? item?.filters_json),
      archived: Boolean(item?.archived),
      createdBy: item?.createdBy == null ? (item?.created_by == null ? null : String(item.created_by)) : String(item.createdBy),
      createdAt: item?.createdAt == null ? (item?.created_at == null ? null : String(item.created_at)) : String(item.createdAt),
      updatedAt: item?.updatedAt == null ? (item?.updated_at == null ? null : String(item.updated_at)) : String(item.updatedAt),
      widgets: widgetsRaw.map((widget: any) => this.normalizeWidget(widget, id)),
    };
  }

  private normalizeWidget(item: any, dashboardId: string): DashboardWidget {
    const typeRaw = String(item?.type ?? 'table').toLowerCase();
    const type: DashboardWidgetType =
      typeRaw === 'kpi' || typeRaw === 'bar' || typeRaw === 'line' || typeRaw === 'pie' ? typeRaw : 'table';
    return {
      id: String(item?.id ?? ''),
      dashboardId: String(item?.dashboardId ?? item?.dashboard_id ?? dashboardId),
      title: String(item?.title ?? ''),
      type,
      querySql: String(item?.querySql ?? item?.query_sql ?? ''),
      configJson: this.normalizeJsonLike(item?.configJson ?? item?.config_json),
      layoutJson: this.normalizeJsonLike(item?.layoutJson ?? item?.layout_json),
      positionOrder: Number(item?.positionOrder ?? item?.position_order ?? 0),
      createdAt: item?.createdAt == null ? (item?.created_at == null ? null : String(item.created_at)) : String(item.createdAt),
      updatedAt: item?.updatedAt == null ? (item?.updated_at == null ? null : String(item.updated_at)) : String(item.updatedAt),
    };
  }

  private normalizeRunResult(item: any): DashboardRunResult {
    const columns = Array.isArray(item?.columns) ? item.columns.map((col: unknown) => String(col)) : [];
    const rows = Array.isArray(item?.rows) ? item.rows.filter((row: unknown) => !!row && typeof row === 'object') : [];
    return {
      meta: {
        elapsedMs: Number(item?.meta?.elapsedMs ?? item?.meta?.elapsed_ms ?? 0),
        rowCount: Number(item?.meta?.rowCount ?? item?.meta?.row_count ?? rows.length),
        truncated: Boolean(item?.meta?.truncated),
      },
      columns,
      rows: rows as Record<string, unknown>[],
    };
  }

  private normalizeJsonLike(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'object') return value as Record<string, unknown>;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }

  private normalizeFilters(value: unknown): DashboardFilterConfig[] {
    const parsed = this.normalizeJsonArray(value);
    return parsed
      .map((item: any): DashboardFilterConfig | null => {
        const key = String(item?.key ?? '').trim();
        if (!key) return null;
        const typeRaw = String(item?.type ?? 'text').toLowerCase();
        const type: DashboardFilterType = typeRaw === 'number' || typeRaw === 'date' ? typeRaw : 'text';
        return {
          key,
          label: String(item?.label ?? key),
          type,
          defaultValue: item?.defaultValue ?? item?.default_value ?? null,
        };
      })
      .filter((item: DashboardFilterConfig | null): item is DashboardFilterConfig => !!item);
  }

  private normalizeJsonArray(value: unknown): unknown[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private buildRunBody(params?: Record<string, unknown>): Record<string, unknown> {
    const cleanParams = Object.entries(params || {}).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (value === null || value === undefined || value === '') return acc;
      acc[key] = value;
      return acc;
    }, {});
    return Object.keys(cleanParams).length ? { params: cleanParams } : {};
  }
}
