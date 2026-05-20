import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AppButtonComponent } from '../shared/app-button/app-button.component';
import { Dashboard, DashboardRunResult, DashboardService, DashboardWidget } from '../../services/dashboard.service';

type WidgetState = {
  loading: boolean;
  error: string;
  result: DashboardRunResult | null;
};

type ChartRow = {
  label: string;
  value: number;
  displayValue: string;
  pct: number;
};

type LinePoint = ChartRow & {
  x: number;
  y: number;
};

type LineStats = {
  min: number;
  minDisplayValue: string;
  max: number;
  maxDisplayValue: string;
};

type PieSegment = ChartRow & {
  path: string;
  color: string;
};

type ChartHover = {
  label: string;
  value: number;
  displayValue: string;
  pct?: number;
  x: number;
  y: number;
  color?: string;
};

@Component({
  selector: 'app-dashboard-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: './dashboard-viewer.component.html',
  styleUrls: ['./dashboard-viewer.component.css'],
})
export class DashboardViewerComponent implements OnInit {
  dashboard: Dashboard | null = null;
  statusMessage = '';
  loading = false;
  widgetStates: Record<string, WidgetState> = {};
  chartHover: Record<string, ChartHover | null> = {};
  filterValues: Record<string, string> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dashboardService: DashboardService
  ) {}

  ngOnInit(): void {
    const id = String(this.route.snapshot.paramMap.get('id') || '').trim();
    if (!id) {
      this.statusMessage = 'Dashboard inválido.';
      return;
    }
    this.loadDashboard(id);
  }

  goList() {
    this.router.navigate(['/dashboards']);
  }

  goEdit() {
    if (!this.dashboard?.id) return;
    this.router.navigate(['/dashboards', this.dashboard.id, 'edit']);
  }

  reloadWidget(widget: DashboardWidget) {
    if (!this.dashboard) return;
    this.setWidgetState(widget.id, { loading: true, error: '', result: null });
    this.dashboardService.runWidget(this.dashboard.id, widget.id, this.buildFilterParams()).subscribe({
      next: (result) => this.setWidgetState(widget.id, { loading: false, error: '', result }),
      error: () => this.setWidgetState(widget.id, { loading: false, error: 'Falha ao carregar widget.', result: null }),
    });
  }

  applyFilters() {
    const widgets = this.dashboard?.widgets || [];
    for (const widget of widgets) this.reloadWidget(widget);
  }

  widgetState(widgetId: string): WidgetState {
    return this.widgetStates[widgetId] || { loading: false, error: '', result: null };
  }

  asKpiValue(result: DashboardRunResult | null): string {
    if (!result?.rows?.length || !result.columns.length) return '-';
    const firstColumn = result.columns[0];
    const value = result.rows[0]?.[firstColumn];
    return value == null ? '-' : String(value);
  }

  chartRows(result: DashboardRunResult | null): ChartRow[] {
    if (!result || result.columns.length < 2) return [];
    const labelKey = result.columns[0];
    const valueKey = result.columns[1];
    const parsed = result.rows
      .map((row) => {
        const rawValue = row[valueKey];
        return {
          label: String(row[labelKey] ?? ''),
          value: this.toNumber(rawValue),
          displayValue: this.formatRawValue(rawValue),
        };
      })
      .filter((item) => Number.isFinite(item.value));
    const max = parsed.reduce((acc, item) => Math.max(acc, item.value), 0);
    return parsed.map((item) => ({
      ...item,
      pct: max > 0 ? Math.max(2, Math.round((item.value / max) * 100)) : 0,
    }));
  }

  barRows(result: DashboardRunResult | null): ChartRow[] {
    return this.chartRows(result).slice(0, 12);
  }

  isHorizontalBar(widget: DashboardWidget): boolean {
    const config = widget.configJson || {};
    const raw = String(config['orientation'] ?? config['barOrientation'] ?? '').trim().toLowerCase();
    return raw === 'horizontal';
  }

  verticalBarRows(result: DashboardRunResult | null): ChartRow[] {
    return this.chartRows(result).slice(0, 10);
  }

  linePoints(result: DashboardRunResult | null): LinePoint[] {
    const rows = this.chartRows(result);
    if (!rows.length) return [];
    const width = 320;
    const height = 150;
    const padX = 24;
    const padTop = 26;
    const padBottom = 28;
    const max = Math.max(...rows.map((row) => row.value), 0);
    const min = Math.min(...rows.map((row) => row.value), 0);
    const span = max - min || 1;
    return rows.map((row, index) => ({
      ...row,
      x: rows.length === 1 ? width / 2 : padX + (index * (width - padX * 2)) / (rows.length - 1),
      y: height - padBottom - ((row.value - min) / span) * (height - padTop - padBottom),
    }));
  }

  linePolyline(result: DashboardRunResult | null): string {
    return this.linePoints(result).map((point) => `${point.x},${point.y}`).join(' ');
  }

  lineAreaPath(result: DashboardRunResult | null): string {
    return '';
  }

  lineStats(result: DashboardRunResult | null): LineStats | null {
    const rows = this.chartRows(result);
    if (!rows.length) return null;
    const minRow = rows.reduce((current, row) => (row.value < current.value ? row : current), rows[0]);
    const maxRow = rows.reduce((current, row) => (row.value > current.value ? row : current), rows[0]);
    return {
      min: minRow.value,
      minDisplayValue: minRow.displayValue,
      max: maxRow.value,
      maxDisplayValue: maxRow.displayValue,
    };
  }

  pieSegments(result: DashboardRunResult | null): PieSegment[] {
    const colors = ['#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#22d3ee', '#f472b6', '#84cc16'];
    const rows = this.chartRows(result).filter((row) => row.value > 0).slice(0, 8);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total <= 0) return [];

    let angle = -90;
    return rows.map((row, index) => {
      const sweep = Math.min((row.value / total) * 360, 359.99);
      const path = this.describeArc(76, 76, 58, angle, angle + sweep);
      angle += sweep;
      return {
        ...row,
        pct: Math.round((row.value / total) * 100),
        path,
        color: colors[index % colors.length],
      };
    });
  }

  formatChartValue(value: number): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  }

  setLineHover(widgetId: string, point: LinePoint) {
    this.chartHover = {
      ...this.chartHover,
      [widgetId]: {
        label: point.label,
        value: point.value,
        displayValue: point.displayValue,
        x: (point.x / 320) * 100,
        y: (point.y / 150) * 100,
      },
    };
  }

  setPieHover(widgetId: string, segment: PieSegment) {
    this.chartHover = {
      ...this.chartHover,
      [widgetId]: {
        label: segment.label,
        value: segment.value,
        displayValue: segment.displayValue,
        pct: segment.pct,
        x: 50,
        y: 50,
        color: segment.color,
      },
    };
  }

  clearChartHover(widgetId: string) {
    this.chartHover = {
      ...this.chartHover,
      [widgetId]: null,
    };
  }

  private loadDashboard(id: string) {
    this.loading = true;
    this.statusMessage = '';
    this.dashboardService.getById(id).subscribe({
      next: (dashboard) => {
        this.loading = false;
        this.dashboard = dashboard;
        this.initFilterValues(dashboard);
        const widgets = [...(dashboard.widgets || [])].sort((a, b) => a.positionOrder - b.positionOrder);
        for (const widget of widgets) this.reloadWidget(widget);
      },
      error: () => {
        this.loading = false;
        this.statusMessage = 'Falha ao carregar dashboard.';
      },
    });
  }

  private setWidgetState(widgetId: string, state: WidgetState) {
    this.widgetStates = {
      ...this.widgetStates,
      [widgetId]: state,
    };
  }

  private initFilterValues(dashboard: Dashboard) {
    const next: Record<string, string> = {};
    for (const filter of dashboard.filtersJson || []) {
      next[filter.key] =
        filter.defaultValue == null
          ? ''
          : filter.type === 'date'
          ? this.normalizeDateValue(String(filter.defaultValue))
          : String(filter.defaultValue);
    }
    this.filterValues = next;
  }

  private buildFilterParams(): Record<string, unknown> {
    const filtersByKey = new Map((this.dashboard?.filtersJson || []).map((filter) => [filter.key, filter]));
    return Object.entries(this.filterValues).reduce<Record<string, unknown>>((acc, [key, value]) => {
      const raw = String(value ?? '').trim();
      if (!raw) return acc;
      const filter = filtersByKey.get(key);
      acc[key] = filter?.type === 'date' ? this.normalizeDateValue(raw) : raw;
      return acc;
    }, {});
  }

  private normalizeDateValue(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return raw;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return 0;

      let normalized = raw;
      if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
        normalized = raw.replace(/,/g, '');
      } else if (/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
        normalized = raw.replace(/\./g, '').replace(',', '.');
      } else if (/^[-+]?\d+,\d+$/.test(raw)) {
        normalized = raw.replace(',', '.');
      }

      const n = Number(normalized);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private formatRawValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return '-';
      const parsed = this.toNumber(raw);
      if (Number.isFinite(parsed)) return this.formatChartValue(parsed);
      return raw;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return this.formatChartValue(value);
    return String(value);
  }

  private describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const start = this.polarToCartesian(cx, cy, r, endAngle);
    const end = this.polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  }

  private polarToCartesian(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
    const radians = (angle * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(radians),
      y: cy + r * Math.sin(radians),
    };
  }
}
