import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Dashboard,
  DashboardFilterConfig,
  DashboardFilterType,
  DashboardService,
  DashboardSystem,
  DashboardWidget,
  DashboardWidgetInput,
  DashboardWidgetType,
} from '../../services/dashboard.service';
import { AppButtonComponent } from '../shared/app-button/app-button.component';

type WidgetDraft = {
  id?: string;
  title: string;
  type: DashboardWidgetType;
  querySql: string;
  configJsonText: string;
};

type FilterDraft = {
  key: string;
  label: string;
  type: DashboardFilterType;
  defaultValue: string;
};

@Component({
  selector: 'app-dashboard-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: './dashboard-builder.component.html',
  styleUrls: ['./dashboard-builder.component.css'],
})
export class DashboardBuilderComponent implements OnInit {
  dashboardId: string | null = null;
  name = '';
  description = '';
  system: DashboardSystem = 'AGROMOBI';
  filterDrafts: FilterDraft[] = [];
  statusMessage = '';
  loading = false;
  saving = false;
  widgetDrafts: WidgetDraft[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dashboardService: DashboardService
  ) {}

  ngOnInit(): void {
    const id = String(this.route.snapshot.paramMap.get('id') || '').trim();
    const systemFromQuery = String(this.route.snapshot.queryParamMap.get('system') || '').toUpperCase();
    if (systemFromQuery === 'SAP') this.system = 'SAP';
    this.dashboardId = id || null;
    if (this.dashboardId) this.load(this.dashboardId);
  }

  get isEditMode(): boolean {
    return !!this.dashboardId;
  }

  load(id: string) {
    this.loading = true;
    this.statusMessage = '';
    this.dashboardService.getById(id).subscribe({
      next: (dashboard) => {
        this.loading = false;
        this.applyDashboard(dashboard);
      },
      error: () => {
        this.loading = false;
        this.statusMessage = 'Falha ao carregar dashboard.';
      },
    });
  }

  addWidgetDraft() {
    this.widgetDrafts = [
      ...this.widgetDrafts,
      {
        title: '',
        type: 'table',
        querySql: '',
        configJsonText: '{}',
      },
    ];
  }

  removeWidgetDraft(index: number) {
    this.widgetDrafts = this.widgetDrafts.filter((_, idx) => idx !== index);
  }

  addFilterDraft() {
    this.filterDrafts = [
      ...this.filterDrafts,
      {
        key: '',
        label: '',
        type: 'text',
        defaultValue: '',
      },
    ];
  }

  removeFilterDraft(index: number) {
    this.filterDrafts = this.filterDrafts.filter((_, idx) => idx !== index);
  }

  saveDashboard() {
    const name = this.name.trim();
    if (!name) {
      this.statusMessage = 'Nome do dashboard é obrigatório.';
      return;
    }

    this.saving = true;
    this.statusMessage = '';
    const payload = {
      name,
      description: this.description.trim() || null,
      system: this.system,
      filtersJson: this.toFiltersPayload(),
      archived: false,
    };

    const save$ = this.dashboardId
      ? this.dashboardService.update(this.dashboardId, payload)
      : this.dashboardService.create(payload);

    save$.subscribe({
      next: (dashboard) => {
        this.syncWidgets(dashboard);
      },
      error: () => {
        this.saving = false;
        this.statusMessage = 'Falha ao salvar dashboard.';
      },
    });
  }

  goViewer() {
    if (!this.dashboardId) return;
    this.router.navigate(['/dashboards', this.dashboardId]);
  }

  goList() {
    this.router.navigate(['/dashboards']);
  }

  private applyDashboard(dashboard: Dashboard) {
    this.dashboardId = dashboard.id;
    this.name = dashboard.name;
    this.description = dashboard.description || '';
    this.system = dashboard.system;
    this.filterDrafts = (dashboard.filtersJson || []).map((filter) => this.toFilterDraft(filter));
    this.widgetDrafts = (dashboard.widgets || [])
      .sort((a, b) => a.positionOrder - b.positionOrder)
      .map((widget) => this.toDraft(widget));
  }

  private toDraft(widget: DashboardWidget): WidgetDraft {
    return {
      id: widget.id,
      title: widget.title,
      type: widget.type,
      querySql: widget.querySql,
      configJsonText: widget.configJson ? JSON.stringify(widget.configJson, null, 2) : '{}',
    };
  }

  private toFilterDraft(filter: DashboardFilterConfig): FilterDraft {
    return {
      key: filter.key,
      label: filter.label,
      type: filter.type,
      defaultValue:
        filter.defaultValue == null
          ? ''
          : filter.type === 'date'
          ? this.normalizeDateValue(String(filter.defaultValue))
          : String(filter.defaultValue),
    };
  }

  private syncWidgets(dashboard: Dashboard) {
    const id = dashboard.id;
    const existingById = new Map((dashboard.widgets || []).map((widget) => [widget.id, widget]));
    const nextIds = new Set(this.widgetDrafts.map((draft) => draft.id).filter(Boolean) as string[]);
    const toDelete = (dashboard.widgets || []).filter((widget) => !nextIds.has(widget.id));

    const deletes = toDelete.map((widget) => this.dashboardService.deleteWidget(id, widget.id));
    let pending = deletes.length;
    const afterDelete = () => {
      pending -= 1;
      if (pending <= 0) this.upsertWidgets(id, existingById);
    };
    if (!deletes.length) {
      this.upsertWidgets(id, existingById);
      return;
    }
    for (const remove$ of deletes) {
      remove$.subscribe({
        next: afterDelete,
        error: () => {
          this.saving = false;
          this.statusMessage = 'Falha ao remover widgets antigos.';
        },
      });
    }
  }

  private upsertWidgets(dashboardId: string, existingById: Map<string, DashboardWidget>) {
    const tasks = this.widgetDrafts.map((draft, index) => {
      const payload = this.toWidgetPayload(draft, index);
      if (!payload) return null;
      if (draft.id && existingById.has(draft.id)) {
        return this.dashboardService.updateWidget(dashboardId, draft.id, payload);
      }
      return this.dashboardService.createWidget(dashboardId, payload);
    }).filter(Boolean);

    if (!tasks.length) {
      this.saving = false;
      this.dashboardId = dashboardId;
      this.statusMessage = 'Dashboard salvo com sucesso.';
      return;
    }

    let pending = tasks.length;
    for (const task$ of tasks) {
      task$!.subscribe({
        next: () => {
          pending -= 1;
          if (pending <= 0) {
            this.saving = false;
            this.dashboardId = dashboardId;
            this.statusMessage = 'Dashboard salvo com sucesso.';
          }
        },
        error: () => {
          this.saving = false;
          this.statusMessage = 'Falha ao salvar widgets do dashboard.';
        },
      });
    }
  }

  private toWidgetPayload(draft: WidgetDraft, index: number): DashboardWidgetInput | null {
    const title = draft.title.trim();
    const querySql = draft.querySql.trim();
    if (!title || !querySql) return null;
    return {
      title,
      type: draft.type,
      querySql,
      configJson: this.parseConfig(draft.configJsonText),
      positionOrder: index,
    };
  }

  private parseConfig(text: string): Record<string, unknown> | null {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  private toFiltersPayload(): DashboardFilterConfig[] {
    return this.filterDrafts
      .map((filter): DashboardFilterConfig | null => {
        const key = filter.key.trim();
        if (!key) return null;
        return {
          key,
          label: filter.label.trim() || key,
          type: filter.type,
          defaultValue:
            filter.defaultValue === ''
              ? null
              : filter.type === 'date'
              ? this.normalizeDateValue(filter.defaultValue)
              : filter.defaultValue,
        };
      })
      .filter((filter: DashboardFilterConfig | null): filter is DashboardFilterConfig => !!filter);
  }

  private normalizeDateValue(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return raw;
  }
}
