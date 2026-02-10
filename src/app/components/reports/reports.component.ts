import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type ReportRow = Record<string, string | number>;

type ReportMock = {
  id: string;
  folderId: string;
  name: string;
  description: string;
  updatedAt: string;
  columns: string[];
  rows: ReportRow[];
};

type FolderMock = {
  id: string;
  name: string;
  expanded: boolean;
};

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.css'],
})
export class ReportsComponent {
  folders: FolderMock[] = [
    { id: 'batidas', name: 'Batidas Realizadas', expanded: false },
    { id: 'trato', name: 'Previsto x Realizado Trato', expanded: true },
    { id: 'curral', name: 'Previsto x Realizado Curral', expanded: true },
    { id: 'caixa', name: 'Fluxo de Caixa', expanded: false },
  ];

  reports: ReportMock[] = [
    {
      id: 'rpt-1',
      folderId: 'curral',
      name: 'Previsto x Realizado Curral',
      description: 'Comparativo diario por curral com diferenca em kg.',
      updatedAt: '2026-02-10 09:20',
      columns: ['dt', 'qt_prevista', 'qt_realizada', 'dif_kg', 'curral', 'lote'],
      rows: [
        {
          dt: '01/01/2026',
          qt_prevista: 1915,
          qt_realizada: 1010,
          dif_kg: -905,
          curral: 'D02',
          lote: 'LT.32',
        },
        {
          dt: '03/01/2026',
          qt_prevista: 1400,
          qt_realizada: 1330,
          dif_kg: -70,
          curral: 'D04',
          lote: 'LT.36',
        },
        {
          dt: '04/01/2026',
          qt_prevista: 1331,
          qt_realizada: 1415,
          dif_kg: 84,
          curral: 'D04',
          lote: 'LT.36',
        },
      ],
    },
    {
      id: 'rpt-2',
      folderId: 'trato',
      name: 'Previsto x Realizado Trato',
      description: 'Consolidado por dieta e periodo.',
      updatedAt: '2026-02-09 16:40',
      columns: ['dt', 'dieta', 'previsto', 'realizado', 'dif'],
      rows: [
        { dt: '01/01/2026', dieta: 'Terminacao 6', previsto: 12600, realizado: 12110, dif: -490 },
        { dt: '02/01/2026', dieta: 'Terminacao 6', previsto: 12240, realizado: 11850, dif: -390 },
      ],
    },
    {
      id: 'rpt-3',
      folderId: 'caixa',
      name: 'Fluxo de Caixa Semanal',
      description: 'Entradas e saidas por semana.',
      updatedAt: '2026-02-10 08:10',
      columns: ['Semana', 'Entradas', 'Saidas', 'Saldo'],
      rows: [
        { Semana: '2026-W05', Entradas: 18500, Saidas: 12120, Saldo: 6380 },
        { Semana: '2026-W06', Entradas: 17210, Saidas: 10920, Saldo: 6290 },
      ],
    },
  ];

  selectedFolderId = 'curral';
  selectedReportId = 'rpt-1';
  newFolderName = '';
  filterTerm = '';
  periodFrom = '2026-01-01';
  periodTo = '2026-01-31';
  statusMessage = '';

  get selectedReport(): ReportMock | null {
    return this.reports.find((report) => report.id === this.selectedReportId) ?? null;
  }

  get displayedRows(): ReportRow[] {
    if (!this.selectedReport) return [];
    const term = this.filterTerm.trim().toLowerCase();
    if (!term) return this.selectedReport.rows;
    return this.selectedReport.rows.filter((row) =>
      this.selectedReport!.columns.some((col) => String(row[col] ?? '').toLowerCase().includes(term))
    );
  }

  reportsByFolder(folderId: string): ReportMock[] {
    return this.reports.filter((report) => report.folderId === folderId);
  }

  toggleFolder(folderId: string) {
    this.folders = this.folders.map((folder) =>
      folder.id === folderId ? { ...folder, expanded: !folder.expanded } : folder
    );
  }

  selectFolder(folder: FolderMock) {
    this.selectedFolderId = folder.id;
    const firstReport = this.reportsByFolder(folder.id)[0];
    this.selectedReportId = firstReport ? firstReport.id : '';
    this.statusMessage = '';
  }

  selectReport(reportId: string) {
    this.selectedReportId = reportId;
    this.statusMessage = '';
  }

  createFolder() {
    const name = this.newFolderName.trim();
    if (!name) {
      this.statusMessage = 'Informe um nome para a pasta.';
      return;
    }

    const exists = this.folders.some((folder) => folder.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      this.statusMessage = 'Ja existe uma pasta com esse nome.';
      return;
    }

    const id = `folder-${Date.now()}`;
    this.folders = [...this.folders, { id, name, expanded: true }];
    this.newFolderName = '';
    this.statusMessage = `Pasta "${name}" criada (mock).`;
  }

  applyFilters() {
    this.statusMessage = 'Filtros aplicados (mock).';
  }

  exportExcel(report: ReportMock) {
    const csv = this.toCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    this.downloadBlob(blob, `${this.fileName(report.name)}.csv`);
    this.statusMessage = `Exportacao Excel mock concluida para "${report.name}".`;
  }

  exportPdf(report: ReportMock) {
    this.statusMessage = `Exportacao PDF mock para "${report.name}" (integracao real entra depois).`;
  }

  private toCsv(report: ReportMock): string {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const header = report.columns.map((col) => escape(col)).join(',');
    const lines = report.rows.map((row) =>
      report.columns.map((col) => escape(row[col] ?? '')).join(',')
    );
    return [header, ...lines].join('\n');
  }

  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private fileName(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
}
