const SQL_VARIABLE_RE = /(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g;

function formatDateTime(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = value.getFullYear();
  const MM = pad(value.getMonth() + 1);
  const dd = pad(value.getDate());
  const HH = pad(value.getHours());
  const mm = pad(value.getMinutes());
  const ss = pad(value.getSeconds());
  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inSingleQuote && !inDoubleQuote && ch === '-' && next === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    out += ch;

    if (!inDoubleQuote && ch === "'") {
      if (inSingleQuote && next === "'") {
        out += next;
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (!inSingleQuote && ch === '"') {
      if (inDoubleQuote && next === '"') {
        out += next;
        i += 2;
        continue;
      }
      inDoubleQuote = !inDoubleQuote;
    }

    i += 1;
  }

  return out;
}

export function extractSqlVariables(sql: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  const cleanSql = stripSqlComments(sql);
  SQL_VARIABLE_RE.lastIndex = 0;
  while ((match = SQL_VARIABLE_RE.exec(cleanSql)) !== null) {
    names.add(match[2]);
  }
  return Array.from(names).sort();
}

export function buildVariablesMap(variableNames: string[], variablesRaw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const name of variableNames) {
    const raw = (variablesRaw[name] ?? '').trim();

    if (!raw) {
      out[name] = null;
      continue;
    }

    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      out[name] = Number(raw);
      continue;
    }

    if (/^(true|false)$/i.test(raw)) {
      out[name] = raw.toLowerCase() === 'true';
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      out[name] = new Date(raw + 'T00:00:00');
      continue;
    }

    out[name] = raw;
  }

  return out;
}

export function expandSqlVariables(sql: string, vars: Record<string, unknown>): string {
  SQL_VARIABLE_RE.lastIndex = 0;
  return sql.replace(SQL_VARIABLE_RE, (full, prefix, name) => {
    if (!(name in vars)) return full;
    const value = vars[name];

    if (value === null || value === undefined) return `${prefix}NULL`;

    if (value instanceof Date) {
      const escaped = formatDateTime(value).replace(/'/g, "''");
      return `${prefix}'${escaped}'`;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Valor numérico inválido para :${name}`);
      return `${prefix}${value}`;
    }

    if (typeof value === 'boolean') {
      return `${prefix}${value ? 'TRUE' : 'FALSE'}`;
    }

    return `${prefix}'${String(value).replace(/'/g, "''")}'`;
  });
}
