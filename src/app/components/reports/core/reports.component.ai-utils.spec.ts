import { HttpErrorResponse } from '@angular/common/http';
import {
  aiToneTextClass,
  copyTextToClipboard,
  formatDateTimeMs,
  resolveAiErrorMessage,
} from './reports.component.ai-utils';

describe('reports.component.ai-utils', () => {
  it('prefere a mensagem legivel ao codigo de erro da IA', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: { erro: 'requisicao_invalida', mensagem: 'A validade deve estar entre 1 e 90 dias' },
    });
    expect(resolveAiErrorMessage(err, 'fallback')).toBe('A validade deve estar entre 1 e 90 dias');
  });

  it('junta as mensagens de problemas de validacao', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        erro: 'requisicao_invalida',
        problemas: [{ mensagem: 'nome obrigatorio' }, { mensagem: 'nome muito longo' }],
      },
    });
    expect(resolveAiErrorMessage(err, 'fallback')).toBe('nome obrigatorio | nome muito longo');
  });

  it('trata 403 como funcao exclusiva de administradores', () => {
    const err = new HttpErrorResponse({ status: 403, error: { mensagem: 'Forbidden' } });
    expect(resolveAiErrorMessage(err, 'fallback')).toContain('exclusiva de administradores');
  });

  it('usa o fallback quando o corpo do erro e um blob', () => {
    const err = new HttpErrorResponse({ status: 500, error: new Blob(['x']) });
    expect(resolveAiErrorMessage(err, 'Falha ao baixar.')).toBe('Falha ao baixar.');
  });

  it('formata datas em epoch ms e trata vazio', () => {
    expect(formatDateTimeMs(null)).toBe('—');
    expect(formatDateTimeMs(0)).toBe('—');
    expect(formatDateTimeMs(1700000000000)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('mapeia o tom do status para a cor do titulo', () => {
    expect(aiToneTextClass('status-error')).toContain('#ef4444');
    expect(aiToneTextClass('status-success')).toContain('#16a34a');
  });

  it('copia pela Clipboard API quando disponivel', async () => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo(undefined);
    const fakeDoc = { defaultView: { navigator: { clipboard: { writeText } } } };
    const ok = await copyTextToClipboard('rpt_abc', fakeDoc as unknown as Document);
    expect(ok).toBeTrue();
    expect(writeText).toHaveBeenCalledWith('rpt_abc');
  });

  it('cai no execCommand quando a Clipboard API falha', async () => {
    const writeText = jasmine.createSpy('writeText').and.rejectWith(new Error('negado'));
    const execCommand = jasmine.createSpy('execCommand').and.returnValue(true);
    const fakeDoc = {
      defaultView: { navigator: { clipboard: { writeText } } },
      createElement: (tag: string) => document.createElement(tag),
      body: document.body,
      execCommand,
    };
    const ok = await copyTextToClipboard('rpt_abc', fakeDoc as unknown as Document);
    expect(ok).toBeTrue();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
