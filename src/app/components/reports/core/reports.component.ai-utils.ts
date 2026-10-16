import { HttpErrorResponse } from '@angular/common/http';
import { StatusTone } from './reports.component.utils';

// Mesmo visual dos filtros em pilula da pagina, sem carregar o CSS inteiro dela em cada modal.
export const AI_PILL_ACTIVE_CLASS =
  'border-[color-mix(in_srgb,var(--text-primary)_26%,transparent)] bg-[color-mix(in_srgb,var(--bg-surface-alt)_76%,var(--text-primary)_6%)] text-[var(--text-primary)]';
export const AI_PILL_INACTIVE_CLASS =
  'border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] text-[var(--text-muted)]';

const TONE_TEXT_CLASSES: Record<StatusTone, string> = {
  'status-success': 'text-[#16a34a]',
  'status-error': 'text-[#ef4444]',
  'status-info': 'text-[#3b82f6]',
};

export function aiToneTextClass(tone: StatusTone): string {
  return TONE_TEXT_CLASSES[tone];
}

/**
 * Os endpoints de IA respondem erro como { erro: codigo, mensagem, problemas[] }; o extrator
 * generico pegaria o codigo em `erro`, entao a mensagem legivel tem prioridade aqui.
 */
export function resolveAiErrorMessage(err: unknown, fallback: string): string {
  const status = Number((err as HttpErrorResponse | null)?.status ?? 0);
  if (status === 403) return 'Acesso negado: esta função é exclusiva de administradores.';

  const payload = (err as HttpErrorResponse | null)?.error;
  // Em downloads (responseType blob) o corpo do erro chega como Blob, sem mensagem legivel.
  if (payload instanceof Blob) return fallback;
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const message = typeof data['mensagem'] === 'string' ? data['mensagem'].trim() : '';
    if (message) return message;
    if (Array.isArray(data['problemas'])) {
      const problems = data['problemas']
        .map((item) => {
          const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          return String(record['mensagem'] ?? '').trim();
        })
        .filter(Boolean);
      if (problems.length) return problems.join(' | ');
    }
    const generic = typeof data['message'] === 'string' ? data['message'].trim() : '';
    if (generic) return generic;
  }
  // Sem corpo legivel, a mensagem do HttpErrorResponse e tecnica ("Http failure response..."):
  // melhor o texto da tela.
  return fallback;
}

export function formatDateTimeMs(value: number | null | undefined): string {
  if (!value || value <= 0) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(value),
    );
  } catch {
    return '—';
  }
}

/** Copia texto; em HTTP sem TLS a Clipboard API nao existe, entao cai no execCommand. */
export async function copyTextToClipboard(
  text: string,
  doc: Document = document,
): Promise<boolean> {
  const clipboard = doc.defaultView?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // segue para o fallback
    }
  }
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  area.select();
  try {
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function downloadBlobFile(blob: Blob, fileName: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
