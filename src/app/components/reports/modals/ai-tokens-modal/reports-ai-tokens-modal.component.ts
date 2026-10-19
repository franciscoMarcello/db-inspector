import { NgClass } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AiToken,
  AiTokenCreated,
  AiTokenCreateInput,
  ReportService,
} from '../../../../services/report.service';
import { AppButtonComponent } from '../../../shared/app-button/app-button.component';
import {
  AI_PILL_ACTIVE_CLASS,
  AI_PILL_INACTIVE_CLASS,
  aiToneTextClass,
  copyTextToClipboard,
  formatDateTimeMs,
  resolveAiErrorMessage,
} from '../../core/reports.component.ai-utils';
import { StatusTone, statusTitleFromTone } from '../../core/reports.component.utils';

export const AI_TOKEN_DEFAULT_DAYS = 30;
export const AI_TOKEN_MAX_DAYS = 90;
export const AI_TOKEN_NAME_MAX = 120;
const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AiConnectionMode = 'mcp' | 'openapi' | 'rest';

export type AiConnectionCommands = {
  mcpUrl: string;
  mcpCli: string;
  mcpJson: string;
  codexEnv: string;
  codexCli: string;
  codexToml: string;
  openApiUrl: string;
  curl: string;
};

export type AiTokenSituation = {
  label: 'Ativo' | 'Expirado' | 'Revogado';
  tone: 'ok' | 'warn' | 'muted';
  attention: string;
};

export type AiCommandBlock = { key: string; title: string; text: string };

type CreatedTokenView = { info: AiTokenCreated; commands: AiConnectionCommands };
type Feedback = { tone: StatusTone; message: string };

export function buildAiConnectionCommands(baseUrl: string, token: string): AiConnectionCommands {
  const base = baseUrl.replace(/\/+$/, '');
  const mcpUrl = `${base}/ai/mcp`;
  const authorization = `Bearer ${token}`;
  return {
    mcpUrl,
    mcpCli: `claude mcp add --transport http dbinspector ${mcpUrl} --header "Authorization: ${authorization}"`,
    mcpJson: JSON.stringify(
      {
        mcpServers: {
          dbinspector: { type: 'http', url: mcpUrl, headers: { Authorization: authorization } },
        },
      },
      null,
      2,
    ),
    // O Codex le o token de uma variavel de ambiente (nao aceita o valor no comando).
    codexEnv: `export DBINSPECTOR_TOKEN="${token}"`,
    codexCli: `codex mcp add dbinspector --url ${mcpUrl} --bearer-token-env-var DBINSPECTOR_TOKEN`,
    codexToml: [
      '[mcp_servers.dbinspector]',
      `url = "${mcpUrl}"`,
      'bearer_token_env_var = "DBINSPECTOR_TOKEN"',
    ].join('\n'),
    openApiUrl: `${base}/ai/openapi.yaml`,
    curl: `curl -H "Authorization: ${authorization}" ${base}/ai/instrucoes`,
  };
}

export function aiCommandBlocks(
  commands: AiConnectionCommands,
  mode: AiConnectionMode,
): AiCommandBlock[] {
  if (mode === 'openapi') {
    return [{ key: 'openApiUrl', title: 'URL do esquema OpenAPI', text: commands.openApiUrl }];
  }
  if (mode === 'rest') {
    return [{ key: 'curl', title: 'cURL', text: commands.curl }];
  }
  return [
    { key: 'mcpCli', title: 'Claude Code (linha de comando)', text: commands.mcpCli },
    {
      key: 'codexEnv',
      title: 'Codex (1) defina o token na variavel de ambiente, no terminal e no perfil do shell',
      text: commands.codexEnv,
    },
    { key: 'codexCli', title: 'Codex (2) adicione o servidor MCP', text: commands.codexCli },
    {
      key: 'codexToml',
      title: 'Codex (alternativa ao passo 2): ~/.codex/config.toml',
      text: commands.codexToml,
    },
    { key: 'mcpJson', title: 'Outros clientes MCP (configuração JSON)', text: commands.mcpJson },
  ];
}

export function aiTokenSituation(token: AiToken, now: number): AiTokenSituation {
  if (token.revokedAt) {
    return { label: 'Revogado', tone: 'muted', attention: '' };
  }
  if (token.expired || token.expiresAt <= now) {
    return {
      label: 'Expirado',
      tone: 'warn',
      attention: 'Expirado: gere um novo token para o agente continuar acessando.',
    };
  }
  const daysLeft = Math.ceil((token.expiresAt - now) / DAY_MS);
  if (daysLeft <= EXPIRING_SOON_DAYS) {
    return {
      label: 'Ativo',
      tone: 'warn',
      attention: `Expira em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}.`,
    };
  }
  return { label: 'Ativo', tone: 'ok', attention: '' };
}

export function validateAiTokenForm(
  nameRaw: string,
  daysRaw: unknown,
): { input?: AiTokenCreateInput; error?: string } {
  const name = String(nameRaw ?? '').trim();
  if (!name) return { error: 'Informe um nome para identificar o token.' };
  if (name.length > AI_TOKEN_NAME_MAX) {
    return { error: `O nome pode ter no máximo ${AI_TOKEN_NAME_MAX} caracteres.` };
  }
  const text = String(daysRaw ?? '').trim();
  const days = text === '' ? Number.NaN : Number(text);
  if (!Number.isInteger(days) || days < 1 || days > AI_TOKEN_MAX_DAYS) {
    return {
      error: `A validade deve ser um número inteiro de dias entre 1 e ${AI_TOKEN_MAX_DAYS}.`,
    };
  }
  return { input: { name, validityDays: days } };
}

@Component({
  selector: 'app-reports-ai-tokens-modal',
  standalone: true,
  imports: [NgClass, FormsModule, AppButtonComponent],
  templateUrl: './reports-ai-tokens-modal.component.html',
  styleUrls: ['../../reports-page/reports.component.modals.css'],
})
export class ReportsAiTokensModalComponent {
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = input(false);
  readonly close = output<void>();

  readonly tokens = signal<AiToken[]>([]);
  readonly loadingList = signal(false);
  readonly listError = signal('');
  readonly name = signal('');
  readonly validityDays = signal<number | string | null>(AI_TOKEN_DEFAULT_DAYS);
  readonly creating = signal(false);
  readonly formError = signal('');
  readonly revokingId = signal<string | null>(null);
  readonly feedback = signal<Feedback | null>(null);
  private createSubscription: Subscription | null = null;
  readonly created = signal<CreatedTokenView | null>(null);
  readonly connectionMode = signal<AiConnectionMode>('mcp');
  readonly copiedKey = signal<string | null>(null);

  readonly tokenRows = computed(() => {
    const now = Date.now();
    return this.tokens().map((token) => ({
      ...token,
      situation: aiTokenSituation(token, now),
      createdLabel: formatDateTimeMs(token.createdAt),
      expiresLabel: formatDateTimeMs(token.expiresAt),
      lastUsedLabel: token.lastUsedAt ? formatDateTimeMs(token.lastUsedAt) : 'Nunca usado',
    }));
  });

  readonly nameMax = AI_TOKEN_NAME_MAX;
  readonly maxDays = AI_TOKEN_MAX_DAYS;
  readonly pillActiveClass = AI_PILL_ACTIVE_CLASS;
  readonly pillInactiveClass = AI_PILL_INACTIVE_CLASS;
  readonly connectionModes: ReadonlyArray<{ value: AiConnectionMode; label: string }> = [
    { value: 'mcp', label: 'MCP' },
    { value: 'openapi', label: 'ChatGPT / OpenAPI' },
    { value: 'rest', label: 'REST / cURL' },
  ];

  constructor() {
    effect(() => {
      const isOpen = this.open();
      untracked(() => this.handleOpenState(isOpen));
    });
    this.destroyRef.onDestroy(() => {
      this.cancelPendingCreation();
      this.clearCreatedToken();
    });
  }

  statusTitle(tone: StatusTone): string {
    return statusTitleFromTone(tone);
  }

  toneTextClass(tone: StatusTone): string {
    return aiToneTextClass(tone);
  }

  formatDate(value: number | null): string {
    return formatDateTimeMs(value);
  }

  commandBlocks(commands: AiConnectionCommands, mode: AiConnectionMode): AiCommandBlock[] {
    return aiCommandBlocks(commands, mode);
  }

  closeModal(): void {
    this.cancelPendingCreation();
    this.clearCreatedToken();
    this.close.emit();
  }

  loadTokens(): void {
    this.loadingList.set(true);
    this.listError.set('');
    this.reportService
      .listAiTokens()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tokens) => {
          this.loadingList.set(false);
          this.tokens.set(tokens ?? []);
        },
        error: (err: unknown) => {
          this.loadingList.set(false);
          this.tokens.set([]);
          this.listError.set(resolveAiErrorMessage(err, 'Falha ao carregar os tokens de IA.'));
        },
      });
  }

  createToken(): void {
    if (this.creating()) return;
    const result = validateAiTokenForm(this.name(), this.validityDays());
    if (!result.input) {
      this.formError.set(result.error ?? '');
      return;
    }
    this.formError.set('');
    this.feedback.set(null);
    this.creating.set(true);
    this.createSubscription = this.reportService
      .createAiToken(result.input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.createSubscription = null;
          this.creating.set(false);
          this.name.set('');
          this.validityDays.set(AI_TOKEN_DEFAULT_DAYS);
          this.copiedKey.set(null);
          this.connectionMode.set('mcp');
          this.created.set({
            info,
            commands: buildAiConnectionCommands(this.reportService.apiBaseUrl(), info.token),
          });
        },
        error: (err: unknown) => {
          this.createSubscription = null;
          this.creating.set(false);
          this.formError.set(resolveAiErrorMessage(err, 'Falha ao gerar o token.'));
        },
      });
  }

  finishCreated(): void {
    const name = this.created()?.info.name ?? '';
    this.clearCreatedToken();
    this.feedback.set({
      tone: 'status-success',
      message: `Token "${name}" criado. Ele aparece na lista apenas pelo prefixo.`,
    });
    this.loadTokens();
  }

  revoke(token: AiToken): void {
    if (token.revokedAt || this.revokingId()) return;
    const ok = confirm(
      `Revogar o token "${token.name}" (${token.prefix}...)?\n\n` +
        'Os agentes que usam este token perdem o acesso na hora. Esta ação não pode ser desfeita.',
    );
    if (!ok) return;
    this.revokingId.set(token.id);
    this.feedback.set(null);
    this.reportService
      .revokeAiToken(token.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.revokingId.set(null);
          this.feedback.set({
            tone: 'status-success',
            message: `Token "${token.name}" revogado.`,
          });
          this.loadTokens();
        },
        error: (err: unknown) => {
          this.revokingId.set(null);
          if (Number((err as HttpErrorResponse | null)?.status ?? 0) === 409) {
            this.feedback.set({
              tone: 'status-info',
              message: `O token "${token.name}" já estava revogado. A lista foi atualizada.`,
            });
            this.loadTokens();
            return;
          }
          this.feedback.set({
            tone: 'status-error',
            message: resolveAiErrorMessage(err, 'Falha ao revogar o token.'),
          });
        },
      });
  }

  async copy(key: string, text: string): Promise<void> {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      this.copiedKey.set(key);
      return;
    }
    this.copiedKey.set(null);
    this.feedback.set({
      tone: 'status-error',
      message: 'Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.',
    });
  }

  selectAll(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.select();
    }
  }

  private handleOpenState(isOpen: boolean): void {
    this.cancelPendingCreation();
    this.clearCreatedToken();
    if (!isOpen) return;
    this.feedback.set(null);
    this.formError.set('');
    this.name.set('');
    this.validityDays.set(AI_TOKEN_DEFAULT_DAYS);
    this.loadTokens();
  }

  /**
   * Fechar com a criacao em andamento descarta a resposta: o valor rpt_ nao pode voltar para a
   * memoria de um modal fechado. Se o servidor ja tiver criado o token, ele aparece na lista
   * (so pelo prefixo) e pode ser revogado.
   */
  private cancelPendingCreation(): void {
    this.createSubscription?.unsubscribe();
    this.createSubscription = null;
    this.creating.set(false);
  }

  private clearCreatedToken(): void {
    this.created.set(null);
    this.copiedKey.set(null);
  }
}
