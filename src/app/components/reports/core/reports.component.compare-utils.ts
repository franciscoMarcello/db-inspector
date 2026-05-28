export type CompareFieldDetail = {
  source1?: unknown;
  source2?: unknown;
  equal?: boolean;
  diff?: unknown;
};

export function compareDifferentFields(item: { fields: Record<string, CompareFieldDetail> }): string[] {
  return Object.entries(item.fields || {})
    .filter(([, detail]) => detail && !detail.equal)
    .map(([fieldName]) => fieldName);
}

export function compareDifferentFieldsLabel(item: { fields: Record<string, CompareFieldDetail> }): string {
  return compareDifferentFields(item).join(', ');
}

export function compareDifferentFieldsCountLabel(item: { fields: Record<string, CompareFieldDetail> }): string {
  const count = compareDifferentFields(item).length;
  return `${count} ${count === 1 ? 'divergência' : 'divergências'}`;
}

export function compareCellDiffClass(
  item: { fields: Record<string, CompareFieldDetail> },
  column: string
): Record<string, boolean> {
  const detail = item.fields?.[column];
  return {
    'diff-cell--changed': Boolean(detail && !detail.equal),
    'diff-cell--missing':
      detail !== undefined &&
      (detail?.source1 === null ||
        detail?.source1 === undefined ||
        detail?.source2 === null ||
        detail?.source2 === undefined),
  };
}

export function formatCompareDelta(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return `${numeric > 0 ? '+' : ''}${value}`;
  return String(value);
}

export function compareColumnDiffValue(item: { fields: Record<string, CompareFieldDetail> }, column: string): string {
  const detail = item.fields?.[column];
  if (!detail || detail.equal) return '';
  return formatCompareDelta(detail.diff) || '≠';
}

export function formatCompareDiffPercent(row: { source2: unknown; diff: unknown }): string {
  const diff = Number(row.diff);
  const base = Number(row.source2);
  if (!Number.isFinite(diff) || !Number.isFinite(base) || base === 0) return '';
  const percent = (diff / base) * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

export function formatCompareDifferenceSummary(item: { fields: Record<string, CompareFieldDetail> }): string {
  return Object.entries(item.fields || {})
    .filter(([, detail]) => detail && !detail.equal)
    .map(([fieldName, detail]) => {
      const delta =
        detail.diff !== null && detail.diff !== undefined
          ? ` (${Number(detail.diff) > 0 ? '+' : ''}${detail.diff})`
          : '';
      return `${fieldName}: ${detail.source1 ?? ''} -> ${detail.source2 ?? ''}${delta}`;
    })
    .join('; ');
}
