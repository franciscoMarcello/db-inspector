import {
  ReportCreateInput,
  ReportDefinition,
  ReportFolder,
  ReportVariable,
  ReportVariableInput,
  ReportVariableOption,
} from '../../services/report.service';
import { DraftVariable, FolderNode, ReportDraft, TemplateDraft } from './reports.component.models';
import { SQL_VARIABLE_RE } from './reports.component.constants';

export type StatusTone = 'status-error' | 'status-success' | 'status-info';
export type SelectionResult = {
  selectedFolderId: string | null;
  selectedReportId: string | null;
};

export function resolveStatusTone(message: string): StatusTone {
  const msg = (message || '').toLowerCase();
  if (msg.includes('falha') || msg.includes('inválido') || msg.includes('invalido')) {
    return 'status-error';
  }
  if (
    msg.includes('criado') ||
    msg.includes('atualizado') ||
    msg.includes('removido') ||
    msg.includes('concluida') ||
    msg.includes('executada')
  ) {
    return 'status-success';
  }
  return 'status-info';
}

export function statusTitleFromTone(tone: StatusTone): string {
  if (tone === 'status-error') return 'Erro';
  if (tone === 'status-success') return 'Sucesso';
  return 'Info';
}

export function belongsToFolder(report: ReportDefinition, folder: FolderNode): boolean {
  if (report.folderId && String(report.folderId) === String(folder.id)) return true;
  if (report.folderName && String(report.folderName) === String(folder.name)) return true;
  if (report.templateName && String(report.templateName) === String(folder.name)) return true;
  if (report.templateName && String(report.templateName) === String(folder.id)) return true;
  return false;
}

export function rebuildFolderNodes(
  apiFolders: ReportFolder[],
  currentFolders: FolderNode[],
  persistedExpandedState: Record<string, boolean>
): FolderNode[] {
  const expanded = new Map(currentFolders.map((folder) => [folder.id, folder.expanded]));
  return (apiFolders || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((folder) => ({
      ...folder,
      expanded: expanded.get(folder.id) ?? persistedExpandedState[String(folder.id)] ?? true,
    }));
}

export function resolveSelection(
  reports: ReportDefinition[],
  folders: FolderNode[],
  selectedFolderId: string | null,
  selectedReportId: string | null,
  preferredReportId?: string,
  preferredFolderId?: string
): SelectionResult {
  if (!reports.length || !folders.length) {
    return {
      selectedFolderId: folders[0]?.id ?? null,
      selectedReportId: null,
    };
  }

  let nextFolderId = preferredFolderId || selectedFolderId || folders[0]?.id || null;
  const selectedFolder = folders.find((folder) => folder.id === nextFolderId) ?? null;

  let report = preferredReportId
    ? reports.find((item) => item.id === preferredReportId)
    : selectedReportId
    ? reports.find((item) => item.id === selectedReportId)
    : undefined;

  if (!report && selectedFolder) {
    report = reports.find((item) => belongsToFolder(item, selectedFolder));
  }
  if (!report) report = reports[0];

  const nextReportId = report?.id ?? null;
  if (!nextReportId) {
    return { selectedFolderId: nextFolderId, selectedReportId: null };
  }

  if (report?.folderId) {
    nextFolderId = report.folderId;
  } else if (report?.folderName) {
    const folderByName = folders.find((folder) => folder.name === report?.folderName);
    if (folderByName) nextFolderId = folderByName.id;
  } else if (report?.templateName) {
    const folderByTemplate = folders.find(
      (folder) => folder.name === report?.templateName || folder.id === report?.templateName
    );
    if (folderByTemplate) nextFolderId = folderByTemplate.id;
  }

  return {
    selectedFolderId: nextFolderId,
    selectedReportId: nextReportId,
  };
}

export function variablesFromSql(
  sql: string,
  currentVars: ReportVariableInput[] = []
): ReportVariableInput[] {
  const currentByKey = new Map(currentVars.map((v) => [v.key, v]));
  const seen = new Set<string>();
  const vars: ReportVariableInput[] = [];
  let match: RegExpExecArray | null;

  while ((match = SQL_VARIABLE_RE.exec(sql)) !== null) {
    const key = match[2];
    if (seen.has(key)) continue;
    seen.add(key);
    const current = currentByKey.get(key);
    vars.push({
      key,
      label: current?.label ?? key,
      type: current?.type ?? 'string',
      required: current?.required ?? false,
      defaultValue: current?.defaultValue ?? null,
      orderIndex: vars.length,
      optionsSql: current?.optionsSql ?? null,
    });
  }

  return vars;
}

export function normalizeFileName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function formatDateTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
    value.getHours()
  )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function displayVariableOption(value: ReportVariableOption | string | null): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.descricao ?? '');
}

export function computeVariableInputs(
  vars: ReportVariable[],
  previous: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const v of vars) {
    const existing = previous[v.key];
    next[v.key] = existing !== undefined ? existing : (v.defaultValue ?? '');
  }
  return next;
}

export function filterVariableOptionItems(
  all: ReportVariableOption[],
  termRaw: string
): ReportVariableOption[] {
  const term = termRaw.trim().toLowerCase();
  if (!term) return all;
  return all.filter((opt) => String(opt.descricao ?? '').toLowerCase().includes(term));
}

export function buildParamsForOptions(
  vars: ReportVariable[],
  inputs: Record<string, string>,
  excludeKey: string
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const v of vars) {
    if (v.key === excludeKey) continue;
    const raw = (inputs[v.key] ?? '').trim();
    if (!raw) continue;
    const parsed = parseVariableValue(v.type, raw, v.key);
    if (!parsed.error && parsed.value !== undefined) params[v.key] = parsed.value;
  }
  return params;
}

export function buildRunParams(
  vars: ReportVariable[],
  inputs: Record<string, string>
): { params?: Record<string, unknown>; error?: string } {
  if (!vars.length) return { params: {} };

  const params: Record<string, unknown> = {};
  for (const v of vars) {
    const rawInput = (inputs[v.key] ?? '').trim();
    const raw = rawInput || (v.defaultValue ?? '');

    if (!raw) {
      if (v.required) return { error: `Parametro obrigatório sem valor: ${v.label || v.key}` };
      continue;
    }

    const parsed = parseVariableValue(v.type, raw, v.key);
    if (parsed.error) return { error: parsed.error };
    params[v.key] = parsed.value;
  }

  return { params };
}

export function syncOptionSearchText(
  rawInputValue: string,
  options: ReportVariableOption[]
): string {
  const rawValue = String(rawInputValue ?? '').trim();
  if (!rawValue) return '';
  const match = options.find((opt) => String(opt.valor ?? '') === rawValue);
  return match ? String(match.descricao ?? '') : rawValue;
}

export function detectDraftVariables(
  sql: string,
  existing: Array<Partial<DraftVariable>> = []
): DraftVariable[] {
  const existingByKey = new Map(existing.map((v) => [String(v.key || ''), v]));
  const detected = variablesFromSql(sql, []);
  const detectedKeys = new Set(detected.map((v) => v.key));
  const orderedExisting = [...existing]
    .filter((v) => detectedKeys.has(String(v.key || '')))
    .sort((a, b) => {
      const ao = Number.isFinite(Number(a.orderIndex)) ? Number(a.orderIndex) : Number.MAX_SAFE_INTEGER;
      const bo = Number.isFinite(Number(b.orderIndex)) ? Number(b.orderIndex) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return String(a.key || '').localeCompare(String(b.key || ''), undefined, {
        sensitivity: 'base',
      });
    });

  const orderedDetectedKeys = [
    ...orderedExisting.map((v) => String(v.key || '')),
    ...detected
      .map((v) => v.key)
      .filter((key) => !orderedExisting.some((v) => String(v.key || '') === key)),
  ];

  return orderedDetectedKeys.map((key, idx) => {
    const current = existingByKey.get(key);
    return {
      id: current?.id ? String(current.id) : undefined,
      key,
      label: String(current?.label ?? key),
      type: (current?.type as DraftVariable['type']) || 'string',
      required: Boolean(current?.required ?? false),
      defaultValue:
        current?.defaultValue === undefined || current?.defaultValue === null
          ? null
          : String(current.defaultValue),
      optionsSql:
        current?.optionsSql === undefined || current?.optionsSql === null
          ? null
          : String(current.optionsSql),
      orderIndex: idx,
    };
  });
}

export function buildArchivePayload(
  current: ReportDefinition,
  folder: FolderNode | null,
  folders: FolderNode[],
  archived: boolean
): ReportCreateInput | null {
  const folderId =
    current.folderId ??
    folder?.id ??
    folders.find((f) => f.name === current.folderName || f.name === current.templateName)?.id;
  if (!folderId) return null;

  return {
    name: current.name,
    folderId,
    templateName: folder?.name ?? current.folderName ?? current.templateName,
    jasperTemplateId: current.jasperTemplateId ?? undefined,
    sql: current.sql,
    description: current.description,
    variables: (current.variables || []).map((v, idx) => ({
      id: v.id,
      key: v.key,
      label: v.label,
      type: v.type,
      required: v.required,
      defaultValue: v.defaultValue,
      orderIndex: Number.isFinite(v.orderIndex) ? v.orderIndex : idx,
      optionsSql: v.optionsSql?.trim() ? String(v.optionsSql).trim() : null,
    })),
    archived,
  };
}

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}

export function readBooleanRecord(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key) || '{}';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function writeBooleanRecord(key: string, value: Record<string, boolean>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

export function consumeStoredText(key: string): string | null {
  try {
    const value = (localStorage.getItem(key) || '').trim();
    localStorage.removeItem(key);
    return value || null;
  } catch {
    return null;
  }
}

export function validateTemplateDraft(draft: TemplateDraft): { error?: string } {
  if (!draft.name.trim()) return { error: 'Informe o nome do template.' };
  if (!draft.jrxml.trim()) return { error: 'Informe ou carregue o conteúdo JRXML.' };
  return {};
}

export function toTemplatePayload(draft: TemplateDraft): {
  name: string;
  description: string | null;
  jrxml: string;
  archived: false;
} {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    jrxml: draft.jrxml.trim(),
    archived: false,
  };
}

export function validateReportDraft(
  draft: ReportDraft,
  folderExists: boolean
): { error?: string } {
  if (!folderExists) return { error: 'Selecione uma pasta válida.' };
  if (!draft.name.trim()) return { error: 'Informe o nome do relatório.' };
  if (!draft.sql.trim()) return { error: 'Informe a SQL do relatório.' };
  return {};
}

export function toReportVariablesPayload(draftVars: DraftVariable[]): ReportVariableInput[] {
  return draftVars.map((v, idx) => ({
    id: v.id,
    key: v.key,
    label: (v.label || v.key).trim(),
    type: v.type,
    required: v.required,
    defaultValue: v.defaultValue ? String(v.defaultValue) : null,
    orderIndex: idx,
    optionsSql: v.optionsSql?.trim() ? String(v.optionsSql).trim() : null,
  }));
}

export function toReportCreatePayload(
  draft: ReportDraft,
  folder: FolderNode,
  variables: ReportVariableInput[]
): ReportCreateInput {
  return {
    name: draft.name.trim(),
    folderId: folder.id,
    templateName: folder.name,
    jasperTemplateId: draft.jasperTemplateId || undefined,
    sql: draft.sql.trim(),
    description: draft.description.trim() || null,
    variables,
    archived: false,
  };
}

export function createReportDraftForCreate(folderId: string, presetSql?: string): ReportDraft {
  return {
    id: null,
    name: '',
    sql: (presetSql || 'SELECT 1 AS ok;').trim(),
    description: '',
    folderId,
    jasperTemplateId: '',
  };
}

export function createReportDraftForEdit(
  current: ReportDefinition,
  folderId: string
): ReportDraft {
  return {
    id: current.id,
    name: current.name,
    sql: current.sql,
    description: current.description || '',
    folderId,
    jasperTemplateId: current.jasperTemplateId || '',
  };
}

export function buildClearedFilterState(
  vars: ReportVariable[],
  currentSearch: Record<string, string>
): { inputs: Record<string, string>; search: Record<string, string> } {
  const inputs: Record<string, string> = {};
  const search = { ...currentSearch };
  for (const v of vars) {
    inputs[v.key] = v.defaultValue ?? '';
    if (v.optionsSql && v.optionsSql.trim()) search[v.key] = '';
  }
  return { inputs, search };
}

export function parseVariableValue(
  type: ReportVariableInput['type'],
  raw: string,
  key: string
): { value?: unknown; error?: string } {
  if (type === 'string') return { value: raw };

  if (type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { error: `Valor inválido para ${key}: esperado número.` };
    }
    return { value: n };
  }

  if (type === 'boolean') {
    const normalized = raw.toLowerCase();
    if (['true', '1', 'sim', 'yes'].includes(normalized)) return { value: true };
    if (['false', '0', 'nao', 'não', 'no'].includes(normalized)) return { value: false };
    return { error: `Valor inválido para ${key}: esperado booleano.` };
  }

  if (type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return { error: `Valor inválido para ${key}: esperado yyyy-MM-dd.` };
    }
    return { value: raw };
  }

  if (type === 'datetime') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return { value: raw };
    const fromLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
      ? new Date(`${raw}:00`)
      : new Date(raw);
    if (Number.isNaN(fromLocal.getTime())) {
      return { error: `Valor inválido para ${key}: esperado datetime ISO.` };
    }
    return { value: formatDateTime(fromLocal) };
  }

  return { value: raw };
}
