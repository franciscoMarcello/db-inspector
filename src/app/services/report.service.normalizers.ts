import type {
  ReportVariableInput,
  ReportVersion,
  ReportVersionAuthorType,
  ReportVersionDiscardResponse,
  ReportVersionStatus,
  ReportVersionSummary,
} from './report.service';

export function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return undefined;
}

export function extractAclFlag(item: any, kind: 'view' | 'run'): boolean | undefined {
  const key = kind === 'view' ? 'View' : 'Run';
  const lower = kind;
  const aliases: unknown[] = [
    item?.[`can${key}`],
    item?.[`can_${lower}`],
    item?.[`${lower}Allowed`],
    item?.[`${lower}_allowed`],
    item?.[`is${key}Allowed`],
    item?.[`is_${lower}_allowed`],
    item?.[`${lower}`],
    item?.[`allow${key}`],
    item?.[`allow_${lower}`],
    item?.[`aclCan${key}`],
    item?.acl?.[`can${key}`],
    item?.acl?.[`can_${lower}`],
    item?.acl?.[`${lower}`],
    item?.permissions?.[`can${key}`],
    item?.permissions?.[`can_${lower}`],
    item?.permissions?.[`${lower}`],
    item?.access?.[`can${key}`],
    item?.access?.[`can_${lower}`],
    item?.access?.[`${lower}`],
    item?.effective?.[`can${key}`],
    item?.effective?.[`can_${lower}`],
    item?.effective?.[`${lower}`],
  ];

  for (const candidate of aliases) {
    const parsed = readOptionalBoolean(candidate);
    if (parsed !== undefined) return parsed;
  }

  return undefined;
}

function uniqueColumns(columns: string[]): string[] {
  const out = new Set<string>();
  for (const column of columns) {
    const normalized = String(column ?? '').trim();
    if (normalized) out.add(normalized);
  }
  return [...out];
}

function readColumnsList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueColumns(
      value.map((col) => String(col ?? '').trim()).filter((col) => col.length > 0),
    );
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const directColumns = readColumnsList(record['columns']);
    if (directColumns.length) return directColumns;
    const sourceColumns = readColumnsList(record['source1'] ?? record['primary']);
    if (sourceColumns.length) return sourceColumns;
  }

  return [];
}

function pickFirstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function normalizeReportColumnsResponse(reportId: string, item: unknown) {
  const data = item as Record<string, unknown>;
  const primaryColumns = readColumnsList(
    pickFirstDefined(data?.['primaryColumns'], data?.['columns']),
  );
  const secondaryColumns = readColumnsList(data?.['secondaryColumns']);
  const mergedColumnsRaw = readColumnsList(data?.['mergedColumns']);
  const mergedColumns = mergedColumnsRaw.length
    ? mergedColumnsRaw
    : uniqueColumns([...primaryColumns, ...secondaryColumns]);

  return {
    reportId,
    primaryColumns,
    secondaryColumns,
    mergedColumns,
  };
}

function normalizeCompareSource(item: any) {
  const columns = Array.isArray(item?.columns)
    ? item.columns.map((col: unknown) => String(col))
    : [];
  const rows = Array.isArray(item?.rows)
    ? item.rows.filter((row: unknown) => !!row && typeof row === 'object')
    : [];
  return {
    label: String(item?.label ?? ''),
    columns,
    rows: rows as Record<string, unknown>[],
    rowCount: Number(item?.rowCount ?? rows.length ?? 0),
  };
}

function normalizeDuplicateKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry: any) => {
      if (entry === null || entry === undefined) return null;
      if (typeof entry === 'string' || typeof entry === 'number') {
        return { key: String(entry), count: 2 };
      }
      const key = entry?.key ?? entry?.value ?? entry?.comparisonKey;
      if (key === null || key === undefined) return null;
      const countRaw = entry?.count ?? entry?.occurrences ?? entry?.total;
      const count = Number(countRaw ?? 2);
      return {
        key: String(key),
        count: Number.isFinite(count) && count > 0 ? count : 2,
      };
    })
    .filter(Boolean);
}

function normalizeCompareDiff(item: any) {
  const onlyInSource1 = Array.isArray(item?.onlyInSource1)
    ? (item.onlyInSource1 as Record<string, unknown>[])
    : [];
  const onlyInSource2 = Array.isArray(item?.onlyInSource2)
    ? (item.onlyInSource2 as Record<string, unknown>[])
    : [];
  const withDifferences = Array.isArray(item?.withDifferences) ? item.withDifferences : [];
  return {
    onlyInSource1,
    onlyInSource2,
    matchCount: Number(item?.matchCount ?? 0),
    equalCount: Number(item?.equalCount ?? 0),
    differentCount: Number(item?.differentCount ?? 0),
    withDifferences,
  };
}

export function normalizeCompareResponse(item: any) {
  const comparisonKey = item?.comparisonKey != null ? String(item.comparisonKey) : null;
  const mode =
    item?.mode === 'content' || item?.mode === 'keyed'
      ? item.mode
      : comparisonKey
        ? 'keyed'
        : 'content';
  return {
    name: String(item?.name ?? ''),
    mode,
    comparisonKey,
    source1: normalizeCompareSource(item?.source1),
    source2: normalizeCompareSource(item?.source2),
    duplicateKeysSource1: normalizeDuplicateKeys(item?.duplicateKeysSource1),
    duplicateKeysSource2: normalizeDuplicateKeys(item?.duplicateKeysSource2),
    diff: item?.diff ? normalizeCompareDiff(item.diff) : null,
  };
}

export function normalizeVariableOptions(res: any) {
  const data = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  return data.map((item: any) => ({
    valor: item?.valor === undefined ? (item?.value === undefined ? null : item.value) : item.valor,
    descricao: String(item?.descricao ?? item?.description ?? item?.label ?? item?.valor ?? ''),
  }));
}

type UnknownRecord = Record<string, unknown>;

const REPORT_VERSION_STATUSES: readonly ReportVersionStatus[] = [
  'DRAFT',
  'PUBLISHED',
  'SUPERSEDED',
  'DISCARDED',
  'REPLACED_DRAFT',
];

const REPORT_VERSION_AUTHOR_TYPES: readonly ReportVersionAuthorType[] = [
  'USER',
  'AI_TOKEN',
  'SYSTEM',
];

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeVersionStatus(value: unknown): ReportVersionStatus {
  const status = String(value ?? '')
    .trim()
    .toUpperCase();
  const known = REPORT_VERSION_STATUSES.find((item) => item === status);
  // Status desconhecido cai em DISCARDED para nunca liberar publicar/descartar/restaurar por engano.
  return known ?? 'DISCARDED';
}

export function normalizeVersionAuthorType(value: unknown): ReportVersionAuthorType {
  const type = String(value ?? '')
    .trim()
    .toUpperCase();
  return REPORT_VERSION_AUTHOR_TYPES.find((item) => item === type) ?? 'USER';
}

export function normalizeReportVersionSummary(item: unknown): ReportVersionSummary {
  const data = asRecord(item);
  return {
    versionNumber: Number(data['versionNumber'] ?? 0),
    status: normalizeVersionStatus(data['status']),
    name: String(data['name'] ?? ''),
    baseVersionNumber: readNullableNumber(data['baseVersionNumber']),
    authorType: normalizeVersionAuthorType(data['authorType']),
    authorName: String(data['authorName'] ?? ''),
    note: readNullableString(data['note']),
    hasJrxml: readOptionalBoolean(data['hasJrxml']) ?? false,
    createdAt: Number(data['createdAt'] ?? 0),
    updatedAt: readNullableNumber(data['updatedAt']),
    publishedAt: readNullableNumber(data['publishedAt']),
    publishedBy: readNullableString(data['publishedBy']),
    revision: Number(data['revision'] ?? 0),
  };
}

export function normalizeReportVersionSummaries(res: unknown): ReportVersionSummary[] {
  const wrapped = asRecord(res)['data'];
  const data: unknown[] = Array.isArray(res) ? res : Array.isArray(wrapped) ? wrapped : [];
  return data.map((item) => normalizeReportVersionSummary(item));
}

export function normalizeReportVersion(
  item: unknown,
  normalizeVariable: (variable: unknown) => ReportVariableInput,
): ReportVersion {
  const data = asRecord(item);
  const rawVariables = data['variables'];
  return {
    reportId: String(data['reportId'] ?? ''),
    versionNumber: Number(data['versionNumber'] ?? 0),
    status: normalizeVersionStatus(data['status']),
    baseVersionNumber: readNullableNumber(data['baseVersionNumber']),
    name: String(data['name'] ?? ''),
    description: readNullableString(data['description']),
    folderId: readNullableString(data['folderId']),
    sql: String(data['sql'] ?? ''),
    secondSql: readNullableString(data['secondSql']),
    comparisonKey: readNullableString(data['comparisonKey']),
    variables: Array.isArray(rawVariables)
      ? rawVariables.map((variable) => normalizeVariable(variable))
      : [],
    jasperTemplateId: readNullableString(data['jasperTemplateId']),
    jrxml: readNullableString(data['jrxml']),
    authorType: normalizeVersionAuthorType(data['authorType']),
    authorName: String(data['authorName'] ?? ''),
    note: readNullableString(data['note']),
    createdAt: Number(data['createdAt'] ?? 0),
    updatedAt: readNullableNumber(data['updatedAt']),
    publishedAt: readNullableNumber(data['publishedAt']),
    publishedBy: readNullableString(data['publishedBy']),
    revision: Number(data['revision'] ?? 0),
  };
}

export function normalizeVersionDiscardResponse(res: unknown): ReportVersionDiscardResponse {
  return { reportDeleted: readOptionalBoolean(asRecord(res)['reportDeleted']) ?? false };
}
