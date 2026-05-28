import { firstValueFrom } from 'rxjs';
import { ReportCompareResponse, ReportDefinition, ReportService } from '../../../services/report.service';
import { createXlsxBlob, createXlsxWorkbookBlob } from '../../../utils/xlsx-export';
import { normalizeFileName } from './reports.component.utils';

export interface ReportsExportHost {
  runResult: { name: string; columns: string[]; rows: Record<string, unknown>[] } | null;
  selectedReport: ReportDefinition | null;
  compareResult: ReportCompareResponse | null;
  compareQuickFilter: 'all' | 'different' | 'missingInSystem' | 'missingInSap' | 'duplicates';
  loadingExcel: boolean;
  loadingCompareExcel: boolean;
  loadingCompareRawExcel: boolean;
  loadingPdf: boolean;
  closeExportMenu(): void;
  buildRunParams(): Record<string, unknown> | null;
  setStatusMessage(message: string, autoClearMs?: number): void;
  resolveRequestError(error: unknown, fallback: string): string;
}

export class ReportsExportLogic {
  constructor(
    private readonly host: ReportsExportHost,
    private readonly reportService: ReportService
  ) {}

  exportExcel() {
    this.host.closeExportMenu();
    const result = this.host.runResult;
    const report = this.host.selectedReport;
    if (!result || !report?.id) return;

    this.host.loadingExcel = true;
    const params = this.host.buildRunParams();
    if (params === null) {
      this.host.loadingExcel = false;
      return;
    }

    firstValueFrom(this.reportService.runReportAllWithParams(report.id, params, false))
      .then((fullResult) => {
        this.host.loadingExcel = false;
        const exportedRows = fullResult.rows || [];
        const blob = createXlsxBlob(fullResult.columns || result.columns || [], exportedRows);
        this.downloadBlob(blob, `${normalizeFileName(fullResult.name || result.name)}.xlsx`);
        this.host.setStatusMessage(
          `Exportacao Excel concluida para "${fullResult.name || result.name}" (${exportedRows.length} linhas).`,
          3000
        );
      })
      .catch((err) => {
        this.host.loadingExcel = false;
        this.host.setStatusMessage(this.host.resolveRequestError(err, 'Falha ao exportar Excel.'));
      });
  }

  exportCompareExcel() {
    const cmp = this.host.compareResult;
    if (!cmp?.diff) {
      this.host.setStatusMessage('Não há diferenças para exportar.');
      return;
    }

    this.host.loadingCompareExcel = true;
    try {
      const timestamp = this.timestamp();
      const reportName = normalizeFileName(cmp.name || this.host.selectedReport?.name || 'comparacao');

      const diffRows = this.buildCompareDivergenceRows(cmp);
      const missingSapRows = cmp.diff.onlyInSource1;
      const missingSystemRows = cmp.diff.onlyInSource2;
      const duplicateSystemRows = cmp.duplicateKeysSource1.map((item) => ({ chave: item.key, ocorrencias: item.count }));
      const duplicateSapRows = cmp.duplicateKeysSource2.map((item) => ({ chave: item.key, ocorrencias: item.count }));

      const nowIso = new Date().toISOString();
      const sheets: Array<{ name: string; columns: string[]; rows: Record<string, unknown>[] }> = [];
      sheets.push({
        name: 'Resumo',
        columns: ['relatorio', 'modo', 'comparisonKey', 'correspondencias', 'iguais', 'diferentes', 'faltantes_sap', 'faltantes_agromobi', 'gerado_em'],
        rows: [{
          relatorio: cmp.name || this.host.selectedReport?.name || '',
          modo: cmp.mode,
          comparisonKey: cmp.comparisonKey ?? '',
          correspondencias: cmp.diff.matchCount,
          iguais: cmp.diff.equalCount,
          diferentes: cmp.diff.differentCount,
          faltantes_sap: missingSapRows.length,
          faltantes_agromobi: missingSystemRows.length,
          gerado_em: nowIso,
        }],
      });

      const addEverything = this.host.compareQuickFilter === 'all';
      if ((addEverything || this.host.compareQuickFilter === 'different') && diffRows.length) {
        sheets.push({ name: 'Divergencias', columns: ['chave', 'campo', 'agromobi', 'sap_hana', 'delta'], rows: diffRows });
      }
      if ((addEverything || this.host.compareQuickFilter === 'missingInSap') && missingSapRows.length) {
        sheets.push({
          name: 'Faltantes_SAP',
          columns: this.resolveColumns(cmp.source1.columns, missingSapRows),
          rows: missingSapRows,
        });
      }
      if ((addEverything || this.host.compareQuickFilter === 'missingInSystem') && missingSystemRows.length) {
        sheets.push({
          name: 'Faltantes_Agromobi',
          columns: this.resolveColumns(cmp.source2.columns, missingSystemRows),
          rows: missingSystemRows,
        });
      }
      if ((addEverything || this.host.compareQuickFilter === 'duplicates') && duplicateSystemRows.length) {
        sheets.push({ name: 'Duplicadas_Agromobi', columns: ['chave', 'ocorrencias'], rows: duplicateSystemRows });
      }
      if ((addEverything || this.host.compareQuickFilter === 'duplicates') && duplicateSapRows.length) {
        sheets.push({ name: 'Duplicadas_SAP', columns: ['chave', 'ocorrencias'], rows: duplicateSapRows });
      }

      if (sheets.length === 1) {
        this.host.setStatusMessage('Nenhum dado para exportar no filtro atual.');
        return;
      }

      const blob = createXlsxWorkbookBlob(sheets);
      this.downloadBlob(blob, `comparacao_${reportName}_${timestamp}.xlsx`);
      this.host.setStatusMessage('Excel de diferenças exportado.', 2500);
    } finally {
      this.host.loadingCompareExcel = false;
    }
  }

  exportCompareRawExcel() {
    const cmp = this.host.compareResult;
    if (!cmp) {
      this.host.setStatusMessage('Não há resultados de comparação para exportar.');
      return;
    }

    this.host.loadingCompareRawExcel = true;
    try {
      const timestamp = this.timestamp();
      const reportName = normalizeFileName(cmp.name || this.host.selectedReport?.name || 'comparacao');
      const sheets: Array<{ name: string; columns: string[]; rows: Record<string, unknown>[] }> = [
        {
          name: 'Resumo',
          columns: ['relatorio', 'modo', 'comparisonKey', 'linhas_agromobi', 'linhas_sap', 'gerado_em'],
          rows: [{
            relatorio: cmp.name || this.host.selectedReport?.name || '',
            modo: cmp.mode,
            comparisonKey: cmp.comparisonKey ?? '',
            linhas_agromobi: cmp.source1.rowCount,
            linhas_sap: cmp.source2.rowCount,
            gerado_em: new Date().toISOString(),
          }],
        },
        { name: 'Agromobi', columns: this.resolveColumns(cmp.source1.columns, cmp.source1.rows), rows: cmp.source1.rows },
        { name: 'SAP_HANA', columns: this.resolveColumns(cmp.source2.columns, cmp.source2.rows), rows: cmp.source2.rows },
      ];

      const blob = createXlsxWorkbookBlob(sheets);
      this.downloadBlob(blob, `resultados_comparacao_${reportName}_${timestamp}.xlsx`);
      this.host.setStatusMessage('Excel de resultados da comparação exportado.', 2500);
    } finally {
      this.host.loadingCompareRawExcel = false;
    }
  }

  exportPdf() {
    this.host.closeExportMenu();
    const report = this.host.selectedReport;
    if (!report?.id) {
      this.host.setStatusMessage('Selecione um relatório para exportar PDF.');
      return;
    }
    if (!report.jasperTemplateId) {
      this.host.setStatusMessage('Este relatório não possui template Jasper vinculado.');
      return;
    }

    const params = this.host.buildRunParams();
    if (params === null) return;

    this.host.loadingPdf = true;
    this.reportService.generateReportPdf(report.id, params, true).subscribe({
      next: (blob) => {
        this.host.loadingPdf = false;
        this.downloadBlob(blob, `${normalizeFileName(report.name)}.pdf`);
        this.host.setStatusMessage(`Exportacao PDF concluida para "${report.name}".`, 2500);
      },
      error: (err) => {
        this.host.loadingPdf = false;
        this.host.setStatusMessage(this.host.resolveRequestError(err, 'Falha ao exportar PDF.'));
      },
    });
  }

  private resolveColumns(preferredColumns: string[], rows: Record<string, unknown>[]): string[] {
    if (Array.isArray(preferredColumns) && preferredColumns.length) return preferredColumns;
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row || {})) keys.add(key);
    }
    return [...keys];
  }

  private buildCompareDivergenceRows(cmp: ReportCompareResponse): Record<string, unknown>[] {
    if (!cmp.diff) return [];
    const rows: Record<string, unknown>[] = [];
    for (const item of cmp.diff.withDifferences) {
      const fields = item.fields || {};
      for (const [fieldName, detail] of Object.entries(fields)) {
        if (detail?.equal) continue;
        rows.push({
          chave: item.key ?? '',
          campo: fieldName,
          agromobi: detail?.source1 ?? '',
          sap_hana: detail?.source2 ?? '',
          delta: detail?.diff ?? '',
        });
      }
    }
    return rows;
  }

  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private timestamp(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  }
}
