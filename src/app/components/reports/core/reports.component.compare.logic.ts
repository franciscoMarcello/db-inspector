import { ReportCompareResponse } from '../../../services/report.service';
import { ResultTableHeaderGroup } from '../../shared/result-table/result-table.component';
import {
  compareCellDiffClass,
  compareColumnDiffValue,
  compareDifferentFields,
  compareDifferentFieldsLabel,
  CompareFieldDetail,
  formatCompareDelta,
  formatCompareDiffPercent,
} from './reports.component.compare-utils';

type CompareDiffItem = {
  key: string | null;
  fields: Record<string, CompareFieldDetail>;
  source1Row?: Record<string, unknown> | null;
  source2Row?: Record<string, unknown> | null;
};

export class ReportsCompareLogic {
  private compareCompactCache:
    | { cmpRef: ReportCompareResponse; columns: string[]; rows: Record<string, unknown>[] }
    | null = null;
  private compareFullCache:
    | {
        cmpRef: ReportCompareResponse;
        columns: string[];
        labels: Record<string, string>;
        groups: ResultTableHeaderGroup[];
        rows: Record<string, unknown>[];
      }
    | null = null;

  compareDifferenceRows(cmp: ReportCompareResponse): Array<{ key: string | null; field: string; source1: unknown; source2: unknown; diff: unknown; item: CompareDiffItem }> {
    const rows: Array<{ key: string | null; field: string; source1: unknown; source2: unknown; diff: unknown; item: CompareDiffItem }> = [];
    for (const item of (cmp.diff?.withDifferences ?? []) as CompareDiffItem[]) {
      for (const field of compareDifferentFields(item)) {
        const detail = item.fields?.[field] ?? {};
        rows.push({ key: item.key, field, source1: detail.source1 ?? '', source2: detail.source2 ?? '', diff: detail.diff ?? '', item });
      }
    }
    return rows;
  }

  compareCompactTableColumns(cmp: ReportCompareResponse): string[] {
    this.ensureCompareCompactCache(cmp);
    return this.compareCompactCache?.columns ?? [];
  }

  compareCompactTableRows(cmp: ReportCompareResponse): Record<string, unknown>[] {
    this.ensureCompareCompactCache(cmp);
    return this.compareCompactCache?.rows ?? [];
  }

  compareFullTableColumns(cmp: ReportCompareResponse): string[] {
    this.ensureCompareFullCache(cmp);
    return this.compareFullCache?.columns ?? [];
  }

  compareFullTableColumnLabels(cmp: ReportCompareResponse): Record<string, string> {
    this.ensureCompareFullCache(cmp);
    return this.compareFullCache?.labels ?? {};
  }

  compareFullTableHeaderGroups(cmp: ReportCompareResponse): ResultTableHeaderGroup[] {
    this.ensureCompareFullCache(cmp);
    return this.compareFullCache?.groups ?? [];
  }

  compareFullTableRows(cmp: ReportCompareResponse): Record<string, unknown>[] {
    this.ensureCompareFullCache(cmp);
    return this.compareFullCache?.rows ?? [];
  }

  compareFieldStats(cmp: ReportCompareResponse): Array<{ field: string; count: number }> {
    const counts = new Map<string, number>();
    for (const item of (cmp.diff?.withDifferences ?? []) as CompareDiffItem[]) {
      for (const field of compareDifferentFields(item)) counts.set(field, (counts.get(field) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count || a.field.localeCompare(b.field)).slice(0, 5);
  }

  compareDifferenceSourceRow(cmp: ReportCompareResponse, item: CompareDiffItem, source: 'source1' | 'source2'): Record<string, unknown> {
    const directRow = source === 'source1' ? item.source1Row : item.source2Row;
    if (directRow && typeof directRow === 'object') return directRow;
    const key = item.key;
    const comparisonKey = cmp.comparisonKey;
    if (key === null || key === undefined || !comparisonKey) return {};
    const rows = source === 'source1' ? cmp.source1.rows : cmp.source2.rows;
    const matchesByKey = rows.filter((row) => String(row?.[comparisonKey] ?? '') === String(key));
    if (!matchesByKey.length) return {};
    if (matchesByKey.length === 1) return matchesByKey[0];
    const expectedValueKey = source === 'source1' ? 'source1' : 'source2';
    let bestMatch = matchesByKey[0];
    let bestScore = -1;
    for (const candidate of matchesByKey) {
      let score = 0;
      for (const [fieldName, detail] of Object.entries(item.fields ?? {})) {
        const expected = detail?.[expectedValueKey];
        if (expected === undefined) continue;
        if (String(candidate?.[fieldName] ?? '') === String(expected ?? '')) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }
    return bestMatch;
  }

  private ensureCompareCompactCache(cmp: ReportCompareResponse): void {
    if (this.compareCompactCache?.cmpRef === cmp) return;
    const source1Label = this.compareDisplayLabel(cmp.source1.label);
    const source2Label = cmp.source2.label || 'SAP';
    const columns = ['Chave', 'Coluna divergente', source1Label, source2Label, 'Diferença', 'Diferença %'];
    const rows = this.compareDifferenceRows(cmp).map((row) => ({
      Chave: row.key,
      'Coluna divergente': row.field,
      [source1Label]: row.source1,
      [source2Label]: row.source2,
      Diferença: formatCompareDelta(row.diff) || '!=',
      'Diferença %': formatCompareDiffPercent({ source2: row.source2, diff: row.diff }),
      __cellClasses: {
        'Coluna divergente': 'diff-fields-list',
        [source1Label]: 'diff-cell-value diff-cell--changed',
        [source2Label]: 'diff-cell-value diff-cell--changed',
        Diferença: 'diff-cell-value diff-delta',
        'Diferença %': 'diff-cell-value diff-delta',
      },
    }));
    this.compareCompactCache = { cmpRef: cmp, columns, rows };
  }

  private ensureCompareFullCache(cmp: ReportCompareResponse): void {
    if (this.compareFullCache?.cmpRef === cmp) return;
    const columns = ['key', 'status', 'differentFields', ...cmp.source1.columns.map((col) => `source1:${col}`), ...cmp.source2.columns.map((col) => `source2:${col}`), ...cmp.source1.columns.map((col) => `diff:${col}`)];
    const labels: Record<string, string> = { key: 'Chave', status: 'Status', differentFields: 'Colunas divergentes' };
    for (const col of cmp.source1.columns) labels[`source1:${col}`] = col;
    for (const col of cmp.source2.columns) labels[`source2:${col}`] = col;
    for (const col of cmp.source1.columns) labels[`diff:${col}`] = col;
    const groups: ResultTableHeaderGroup[] = [
      { label: '', span: 3, className: 'group-spacer' },
      { label: this.compareDisplayLabel(cmp.source1.label), span: cmp.source1.columns.length, className: 'compare-group-head' },
      { label: cmp.source2.label || 'SAP', span: cmp.source2.columns.length, className: 'compare-group-head' },
      { label: 'Diferença', span: cmp.source1.columns.length, className: 'compare-group-head compare-group-head--diff' },
    ];
    const rows: Record<string, unknown>[] = [];
    const source1ByKey = this.groupRowsByComparisonKey(cmp.source1.rows, cmp.comparisonKey);
    const source2ByKey = this.groupRowsByComparisonKey(cmp.source2.rows, cmp.comparisonKey);
    const source1UsageByKey = new Map<string, number>();
    const source2UsageByKey = new Map<string, number>();
    for (const item of (cmp.diff?.withDifferences ?? []) as CompareDiffItem[]) {
      const source1Row = this.pickCompareRowForFullTable(cmp, item, 'source1', source1ByKey, source1UsageByKey);
      const source2Row = this.pickCompareRowForFullTable(cmp, item, 'source2', source2ByKey, source2UsageByKey);
      const row: Record<string, unknown> = {
        key: item.key,
        status: 'Valor diferente',
        differentFields: compareDifferentFieldsLabel(item),
        __cellClasses: { key: 'diff-key-cell', status: 'diff-status-cell', differentFields: 'diff-fields-list diff-fields-list--full' },
      };
      const cellClasses = row['__cellClasses'] as Record<string, string>;
      for (const col of cmp.source1.columns) {
        const source1Key = `source1:${col}`;
        const source2Key = `source2:${col}`;
        const diffKey = `diff:${col}`;
        row[source1Key] = source1Row[col];
        row[source2Key] = source2Row[col];
        row[diffKey] = compareColumnDiffValue(item, col);
        const sourceClass = this.classMapToString(compareCellDiffClass(item, col));
        if (sourceClass) {
          cellClasses[source1Key] = sourceClass;
          cellClasses[source2Key] = sourceClass;
        }
        cellClasses[diffKey] = row[diffKey] ? 'diff-cell-value diff-delta diff-cell--changed' : 'diff-cell-value diff-delta';
      }
      rows.push(row);
    }
    this.compareFullCache = { cmpRef: cmp, columns, labels, groups, rows };
  }

  private groupRowsByComparisonKey(rows: Record<string, unknown>[], comparisonKey: string | null | undefined): Map<string, Record<string, unknown>[]> {
    const grouped = new Map<string, Record<string, unknown>[]>();
    if (!comparisonKey) return grouped;
    for (const row of rows) {
      const key = String(row?.[comparisonKey] ?? '');
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }
    return grouped;
  }

  private pickCompareRowForFullTable(
    cmp: ReportCompareResponse,
    item: CompareDiffItem,
    source: 'source1' | 'source2',
    groupedRows: Map<string, Record<string, unknown>[]>,
    usageByKey: Map<string, number>
  ): Record<string, unknown> {
    const directRow = source === 'source1' ? item.source1Row : item.source2Row;
    if (directRow && typeof directRow === 'object') return directRow;
    const comparisonKey = cmp.comparisonKey;
    const key = item.key;
    if (!comparisonKey || key === null || key === undefined) return {};
    const keyText = String(key);
    const candidates = groupedRows.get(keyText) ?? [];
    if (!candidates.length) return {};
    const startIndex = usageByKey.get(keyText) ?? 0;
    const expectedKey = source === 'source1' ? 'source1' : 'source2';
    let bestAbsoluteIndex = startIndex;
    let bestScore = -1;
    for (let i = startIndex; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      let score = 0;
      for (const [fieldName, detail] of Object.entries(item.fields ?? {})) {
        const expected = detail?.[expectedKey];
        if (expected === undefined) continue;
        if (String(candidate?.[fieldName] ?? '') === String(expected ?? '')) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAbsoluteIndex = i;
      }
    }
    usageByKey.set(keyText, Math.min(bestAbsoluteIndex + 1, candidates.length));
    return candidates[bestAbsoluteIndex] ?? candidates[candidates.length - 1] ?? {};
  }

  private classMapToString(classMap: Record<string, boolean>): string {
    return Object.entries(classMap)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(' ');
  }

  private compareDisplayLabel(label: string | null | undefined, fallback = 'Agromobi'): string {
    const value = (label || '').trim();
    if (!value || value.toLowerCase() === 'sistema') return fallback;
    return value;
  }
}
