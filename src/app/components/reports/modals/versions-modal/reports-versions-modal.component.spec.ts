import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { NGX_MONACO_EDITOR_CONFIG } from 'ngx-monaco-editor-v2';
import {
  ReportDefinition,
  ReportRunResponse,
  ReportService,
  ReportVersion,
  ReportVersionSummary,
} from '../../../../services/report.service';
import {
  describePreviewParams,
  outdatedBaseWarning,
  pickInitialVersion,
  ReportsVersionsModalComponent,
  ReportVersionsChange,
  versionActionsFor,
  versionAuthorLabel,
  versionStatusLabel,
} from './reports-versions-modal.component';

function summary(overrides: Partial<ReportVersionSummary> = {}): ReportVersionSummary {
  return {
    versionNumber: 1,
    status: 'PUBLISHED',
    name: 'Colheita',
    baseVersionNumber: null,
    authorType: 'USER',
    authorName: 'Ana',
    note: null,
    hasJrxml: false,
    createdAt: 1700000000000,
    updatedAt: null,
    publishedAt: null,
    publishedBy: null,
    revision: 1700000000000 + (overrides.versionNumber ?? 1),
    ...overrides,
  };
}

function fullVersion(overrides: Partial<ReportVersion> = {}): ReportVersion {
  return {
    reportId: 'r1',
    versionNumber: 1,
    status: 'PUBLISHED',
    baseVersionNumber: null,
    name: 'Colheita',
    description: null,
    folderId: 'f1',
    sql: 'SELECT 1',
    secondSql: null,
    comparisonKey: null,
    variables: [],
    jasperTemplateId: null,
    jrxml: null,
    authorType: 'USER',
    authorName: 'Ana',
    note: null,
    createdAt: 1700000000000,
    updatedAt: null,
    publishedAt: null,
    publishedBy: null,
    revision: 1700000000000 + (overrides.versionNumber ?? 1),
    ...overrides,
  };
}

function report(overrides: Partial<ReportDefinition> = {}): ReportDefinition {
  return {
    id: 'r1',
    name: 'Colheita',
    sql: 'SELECT 1',
    description: null,
    variables: [],
    archived: false,
    draft: false,
    openDraftVersion: 3,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('reports-versions-modal helpers', () => {
  it('traduz os status das versoes', () => {
    expect(versionStatusLabel('DRAFT')).toBe('Rascunho');
    expect(versionStatusLabel('PUBLISHED')).toBe('Publicada');
    expect(versionStatusLabel('SUPERSEDED')).toBe('Substituída');
    expect(versionStatusLabel('DISCARDED')).toBe('Descartada');
    expect(versionStatusLabel('REPLACED_DRAFT')).toBe('Rascunho anterior');
  });

  it('rotula o autor conforme o tipo', () => {
    expect(versionAuthorLabel({ authorType: 'AI_TOKEN', authorName: 'token-x' })).toBe('IA');
    expect(versionAuthorLabel({ authorType: 'SYSTEM', authorName: 'job' })).toBe('Sistema');
    expect(versionAuthorLabel({ authorType: 'USER', authorName: 'Ana' })).toBe('Ana');
    expect(versionAuthorLabel({ authorType: 'USER', authorName: '  ' })).toBe('Usuário');
  });

  it('habilita as acoes conforme o status', () => {
    expect(versionActionsFor(summary({ status: 'DRAFT', hasJrxml: true }))).toEqual({
      preview: true,
      pdf: true,
      publish: true,
      discard: true,
      restore: false,
      reuse: false,
    });
    expect(versionActionsFor(summary({ status: 'PUBLISHED' }))).toEqual({
      preview: true,
      pdf: false,
      publish: false,
      discard: false,
      restore: false,
      reuse: false,
    });
    expect(versionActionsFor(summary({ status: 'SUPERSEDED' }))).toEqual({
      preview: true,
      pdf: false,
      publish: false,
      discard: false,
      restore: true,
      reuse: true,
    });
    const discarded = versionActionsFor(summary({ status: 'DISCARDED' }));
    expect(discarded.publish || discarded.discard || discarded.restore).toBeFalse();
    expect(discarded.reuse).toBeTrue();
    expect(versionActionsFor(summary({ status: 'REPLACED_DRAFT', hasJrxml: true }))).toEqual({
      preview: true,
      pdf: true,
      publish: false,
      discard: false,
      restore: false,
      reuse: true,
    });
    expect(versionActionsFor(null).preview).toBeFalse();
  });

  it('avisa quando o rascunho foi feito sobre uma versao diferente da publicada', () => {
    const published = summary({ versionNumber: 3, status: 'PUBLISHED' });
    expect(
      outdatedBaseWarning(
        summary({ versionNumber: 4, status: 'DRAFT', baseVersionNumber: 2 }),
        published,
      ),
    ).toBe('Este rascunho foi feito sobre a versão 2; a publicada hoje é a 3.');
    expect(
      outdatedBaseWarning(
        summary({ versionNumber: 4, status: 'DRAFT', baseVersionNumber: 3 }),
        published,
      ),
    ).toBe('');
    expect(
      outdatedBaseWarning(
        summary({ versionNumber: 4, status: 'DRAFT', baseVersionNumber: null }),
        published,
      ),
    ).toContain('a publicada hoje é a 3');
    expect(
      outdatedBaseWarning(
        summary({ versionNumber: 2, status: 'SUPERSEDED', baseVersionNumber: 1 }),
        published,
      ),
    ).toBe('');
    expect(
      outdatedBaseWarning(
        summary({ versionNumber: 1, status: 'DRAFT', baseVersionNumber: null }),
        null,
      ),
    ).toBe('');
  });

  it('seleciona inicialmente o rascunho aberto, depois a publicada', () => {
    const list = [
      summary({ versionNumber: 4, status: 'DRAFT' }),
      summary({ versionNumber: 3, status: 'PUBLISHED' }),
      summary({ versionNumber: 2, status: 'SUPERSEDED' }),
    ];
    expect(pickInitialVersion(list, null)).toBe(4);
    expect(pickInitialVersion(list, 2)).toBe(2);
    expect(pickInitialVersion(list, 99)).toBe(4);
    expect(pickInitialVersion(list.slice(1), null)).toBe(3);
    expect(pickInitialVersion([], null)).toBeNull();
  });

  it('descreve a origem dos parametros da previa', () => {
    const rows = describePreviewParams(
      [
        {
          key: 'b',
          label: 'B',
          type: 'string',
          required: false,
          multiple: false,
          defaultValue: 'x',
          orderIndex: 1,
        },
        {
          key: 'a',
          label: 'A',
          type: 'date',
          required: true,
          multiple: false,
          defaultValue: null,
          orderIndex: 0,
        },
        {
          key: 'c',
          label: '',
          type: 'number',
          required: false,
          multiple: false,
          defaultValue: null,
          orderIndex: 2,
        },
      ],
      { a: '2025-01-01' },
    );
    expect(rows).toEqual([
      { key: 'a', label: 'A', value: '2025-01-01', source: 'form' },
      { key: 'b', label: 'B', value: 'x', source: 'default' },
      { key: 'c', label: 'c', value: '', source: 'empty' },
    ]);
  });
});

describe('ReportsVersionsModalComponent', () => {
  let fixture: ComponentFixture<ReportsVersionsModalComponent>;
  let component: ReportsVersionsModalComponent;
  let service: jasmine.SpyObj<ReportService>;
  let emitted: ReportVersionsChange[];

  const versions = [
    summary({ versionNumber: 3, status: 'DRAFT', baseVersionNumber: 1, authorType: 'AI_TOKEN' }),
    summary({ versionNumber: 2, status: 'PUBLISHED', publishedAt: 1700000001000 }),
    summary({ versionNumber: 1, status: 'SUPERSEDED' }),
  ];
  const contents: Record<number, ReportVersion> = {
    1: fullVersion({ versionNumber: 1, status: 'SUPERSEDED', sql: 'SELECT 0' }),
    2: fullVersion({ versionNumber: 2, status: 'PUBLISHED', sql: 'SELECT 1', jrxml: '<a/>' }),
    3: fullVersion({
      versionNumber: 3,
      status: 'DRAFT',
      baseVersionNumber: 1,
      sql: 'SELECT 2 WHERE safra = :safra',
      variables: [
        {
          key: 'safra',
          label: 'Safra',
          type: 'number',
          required: true,
          multiple: false,
          defaultValue: null,
          orderIndex: 0,
        },
      ],
    }),
  };

  async function openWith(target: ReportDefinition, inputs: Record<string, string> = {}) {
    fixture.componentRef.setInput('report', target);
    fixture.componentRef.setInput('paramInputs', inputs);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<ReportService>('ReportService', [
      'listReportVersions',
      'getReportVersion',
      'runReportVersion',
      'generateReportVersionPdf',
      'publishReportVersion',
      'discardReportVersion',
      'restoreReportVersion',
      'reuseReportVersion',
    ]);
    service.listReportVersions.and.callFake(() => of(versions));
    service.getReportVersion.and.callFake((_id: string, n: number) => of(contents[n]));

    await TestBed.configureTestingModule({
      imports: [ReportsVersionsModalComponent],
      providers: [
        { provide: ReportService, useValue: service },
        { provide: NGX_MONACO_EDITOR_CONFIG, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsVersionsModalComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.changed.subscribe((change) => emitted.push(change));
  });

  it('carrega as versoes ao abrir e seleciona o rascunho aberto', async () => {
    await openWith(report());

    expect(service.listReportVersions).toHaveBeenCalledOnceWith('r1');
    expect(component.selectedNumber()).toBe(3);
    expect(component.selectedVersion()?.sql).toContain(':safra');
    expect(component.currentPublished()?.versionNumber).toBe(2);
    expect(component.baseWarning()).toBe(
      'Este rascunho foi feito sobre a versão 1; a publicada hoje é a 2.',
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Este rascunho foi feito sobre a versão 1');
    expect(text).toContain('Publicar');
    expect(text).toContain('Descartar');
    expect(text).not.toContain('Restaurar');
  });

  it('nao carrega nada enquanto fechado', () => {
    fixture.componentRef.setInput('report', report());
    fixture.detectChanges();
    expect(service.listReportVersions).not.toHaveBeenCalled();
  });

  it('libera restaurar apenas para versao substituida', async () => {
    await openWith(report());
    component.selectVersion(1);
    fixture.detectChanges();

    expect(component.actions().restore).toBeTrue();
    expect(component.actions().publish).toBeFalse();
    expect(component.baseWarning()).toBe('');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Restaurar');
    expect(text).not.toContain('Publicar');
  });

  it('so permite comparar quando a versao nao e a publicada atual', async () => {
    await openWith(report());
    expect(component.canCompare()).toBeTrue();

    component.setViewMode('compare');
    const [diff] = component.diffViews();
    expect(diff.original.code).toBe('SELECT 1');
    expect(diff.modified.code).toBe('SELECT 2 WHERE safra = :safra');
    expect(diff.original.language).toBe('sql');
    expect(component.compareTargets()).toEqual(['sql', 'jrxml']);

    component.setCompareTarget('jrxml');
    expect(component.diffViews()[0].original.code).toBe('<a/>');
    expect(component.diffViews()[0].original.language).toBe('xml');

    component.selectVersion(2);
    expect(component.canCompare()).toBeFalse();
    expect(component.viewMode()).toBe('content');
    expect(component.diffViews()).toEqual([]);
  });

  it('nao executa a previa quando falta parametro obrigatorio', async () => {
    await openWith(report());
    component.runPreview();

    expect(service.runReportVersion).not.toHaveBeenCalled();
    expect(component.feedback()?.tone).toBe('status-error');
    expect(component.feedback()?.message).toContain('Safra');
  });

  it('executa a previa com os valores do formulario da pagina', async () => {
    const run: ReportRunResponse = {
      name: 'Colheita',
      meta: {
        environment: 'dev',
        generatedAt: '',
        lastRunAt: '',
        page: 0,
        size: 200,
        rowCount: 1,
        elapsedMs: 5,
        truncated: false,
      },
      query: '',
      columns: ['a'],
      rows: [{ a: 1 }],
      summaries: [],
    };
    service.runReportVersion.and.returnValue(of(run));
    await openWith(report(), { safra: '2025' });

    component.runPreview();

    expect(service.runReportVersion).toHaveBeenCalledOnceWith('r1', 3, {
      params: { safra: 2025 },
      page: 0,
      size: 200,
    });
    expect(component.preview()).toBe(run);
    expect(component.feedback()?.tone).toBe('status-success');
  });

  function runResponse(): ReportRunResponse {
    return {
      name: 'Colheita',
      meta: {
        environment: 'dev',
        generatedAt: '',
        lastRunAt: '',
        page: 0,
        size: 200,
        rowCount: 1,
        elapsedMs: 5,
        truncated: false,
      },
      query: '',
      columns: ['a'],
      rows: [{ a: 1 }],
      summaries: [],
    };
  }

  it('atualizar descarta a previa da mesma versao, que a IA pode ter regravado', async () => {
    service.runReportVersion.and.returnValue(of(runResponse()));
    await openWith(report(), { safra: '2025' });
    component.runPreview();
    expect(component.preview()).not.toBeNull();

    component.loadVersions();

    expect(component.selectedNumber()).toBe(3);
    expect(component.preview()).toBeNull();
    expect(component.previewVersionNumber()).toBeNull();
  });

  it('previa que chega depois de atualizar e ignorada', async () => {
    const pending = new Subject<ReportRunResponse>();
    service.runReportVersion.and.returnValue(pending.asObservable());
    await openWith(report(), { safra: '2025' });
    component.runPreview();

    component.loadVersions();
    pending.next(runResponse());
    pending.complete();

    expect(component.preview()).toBeNull();
    expect(component.loadingPreview()).toBeFalse();
  });

  it('conteudo antigo que chega depois de atualizar nao entra no cache', async () => {
    const stale = new Subject<ReportVersion>();
    const fresh = fullVersion({ versionNumber: 3, status: 'DRAFT', sql: 'SELECT novo' });
    let calls = 0;
    service.getReportVersion.and.callFake((_id: string, n: number) => {
      if (n !== 3) return of(contents[n]);
      calls++;
      return calls === 1 ? stale.asObservable() : of(fresh);
    });
    await openWith(report());

    component.loadVersions();
    stale.next(contents[3]);
    stale.complete();

    expect(component.selectedVersion()?.sql).toBe('SELECT novo');
  });

  it('erro ao carregar outra versao nao aparece sobre a versao selecionada', async () => {
    const pending = new Subject<ReportVersion>();
    service.getReportVersion.and.callFake((_id: string, n: number) =>
      n === 1 ? pending.asObservable() : of(contents[n]),
    );
    await openWith(report());
    component.selectVersion(1);
    component.selectVersion(2);

    pending.error(new HttpErrorResponse({ status: 500 }));

    expect(component.versionError()).toBe('');
  });

  it('publicar fica bloqueado enquanto atualiza e envia a revisao que a pessoa viu', async () => {
    const pendingList = new Subject<ReportVersionSummary[]>();
    await openWith(report());
    expect(component.canPublishNow()).toBeTrue();

    service.listReportVersions.and.returnValue(pendingList.asObservable());
    component.loadVersions();
    expect(component.canPublishNow()).toBeFalse();
    spyOn(window, 'confirm').and.returnValue(true);
    component.publishSelected();
    expect(service.publishReportVersion).not.toHaveBeenCalled();

    pendingList.next(versions);
    pendingList.complete();
    expect(component.canPublishNow()).toBeTrue();
    service.publishReportVersion.and.returnValue(of(contents[3]));
    component.publishSelected();
    expect(service.publishReportVersion).toHaveBeenCalledOnceWith(
      'r1',
      3,
      contents[3].revision,
      '',
    );
  });

  it('falha ao carregar a publicada mostra erro na comparacao em vez de carregar para sempre', async () => {
    service.getReportVersion.and.callFake((_id: string, n: number) =>
      n === 2 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(contents[n]),
    );
    await openWith(report());

    component.setViewMode('compare');

    expect(component.compareError()).toContain('versão publicada 2');
    expect(component.loadingCompare()).toBeFalse();
    expect(component.versionError()).toBe('');

    // Trocar de versao sem sair de Comparar tenta de novo e nao deixa o erro antigo na tela.
    service.getReportVersion.and.callFake((_id: string, n: number) => of(contents[n]));
    component.selectVersion(1);
    expect(component.compareError()).toBe('');
    expect(component.publishedVersion()?.versionNumber).toBe(2);
  });

  it('nao chama o backend quando a confirmacao e cancelada', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    await openWith(report());

    component.publishSelected();
    component.discardSelected();

    expect(service.publishReportVersion).not.toHaveBeenCalled();
    expect(service.discardReportVersion).not.toHaveBeenCalled();
  });

  it('publica com nota, recarrega a lista e avisa a pagina', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.publishReportVersion.and.returnValue(of(contents[3]));
    await openWith(report());
    component.note.set('ok');

    component.publishSelected();

    expect(service.publishReportVersion).toHaveBeenCalledOnceWith('r1', 3, 1700000000003, 'ok');
    expect(service.listReportVersions).toHaveBeenCalledTimes(2);
    expect(component.note()).toBe('');
    expect(emitted).toEqual([
      { reportId: 'r1', action: 'publish', reportDeleted: false, message: 'Versão 3 publicada.' },
    ]);
  });

  it('em conflito (409) mostra erro e recarrega as versoes', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.publishReportVersion.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    await openWith(report());

    component.publishSelected();

    expect(component.feedback()?.tone).toBe('status-error');
    expect(component.feedback()?.message).toContain('não está mais no estado esperado');
    expect(service.listReportVersions).toHaveBeenCalledTimes(2);
    expect(component.busyAction()).toBeNull();
  });

  it('descarte com reportDeleted limpa o estado e avisa a pagina para remover o relatorio', async () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    service.discardReportVersion.and.returnValue(of({ reportDeleted: true }));
    await openWith(report({ draft: true, openDraftVersion: 3 }));

    component.discardSelected();

    expect(confirmSpy.calls.mostRecent().args[0]).toContain('apaga o relatório');
    expect(service.discardReportVersion).toHaveBeenCalledOnceWith('r1', 3);
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual(
      jasmine.objectContaining({ reportId: 'r1', action: 'discard', reportDeleted: true }),
    );
    expect(emitted[0].message).toContain('foi removido');
    expect(component.versions()).toEqual([]);
    expect(component.selectedNumber()).toBeNull();
    expect(service.listReportVersions).toHaveBeenCalledTimes(1);
  });

  it('descarte sem reportDeleted recarrega e seleciona a publicada', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.discardReportVersion.and.returnValue(of({ reportDeleted: false }));
    await openWith(report());

    component.discardSelected();

    expect(emitted).toEqual([
      jasmine.objectContaining({ action: 'discard', reportDeleted: false }),
    ]);
    expect(service.listReportVersions).toHaveBeenCalledTimes(2);
    expect(component.selectedNumber()).toBe(2);
  });

  it('restaura a versao substituida e seleciona a nova versao publicada', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.restoreReportVersion.and.returnValue(
      of(fullVersion({ versionNumber: 4, status: 'PUBLISHED' })),
    );
    service.listReportVersions.and.returnValues(
      of(versions),
      of([summary({ versionNumber: 4, status: 'PUBLISHED' }), ...versions.slice(1)]),
    );
    await openWith(report());
    component.selectVersion(1);

    component.restoreSelected();

    expect(service.restoreReportVersion).toHaveBeenCalledOnceWith('r1', 1, '');
    expect(component.selectedNumber()).toBe(4);
    expect(emitted[0]).toEqual(
      jasmine.objectContaining({ action: 'restore', reportDeleted: false }),
    );
  });

  it('rascunho anterior so oferece usar como rascunho e nao avisa base desatualizada', async () => {
    const withReplaced = [
      summary({ versionNumber: 4, status: 'DRAFT', baseVersionNumber: 2 }),
      summary({ versionNumber: 3, status: 'REPLACED_DRAFT', baseVersionNumber: 1 }),
      summary({ versionNumber: 2, status: 'PUBLISHED' }),
    ];
    service.listReportVersions.and.returnValue(of(withReplaced));
    service.getReportVersion.and.callFake((_id: string, n: number) =>
      of(fullVersion({ versionNumber: n })),
    );
    await openWith(report());
    component.selectVersion(3);
    fixture.detectChanges();

    expect(component.baseWarning()).toBe('');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Rascunho anterior');
    expect(text).toContain('Usar como rascunho');
    expect(text).not.toContain('Publicar');
    expect(text).not.toContain('Descartar');
    expect(text).not.toContain('Restaurar');
  });

  it('retoma versao como rascunho, seleciona o novo rascunho e avisa a pagina', async () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    service.reuseReportVersion.and.returnValue(
      of(fullVersion({ versionNumber: 4, status: 'DRAFT' })),
    );
    service.listReportVersions.and.returnValues(
      of(versions),
      of([
        summary({ versionNumber: 4, status: 'DRAFT' }),
        summary({ versionNumber: 3, status: 'REPLACED_DRAFT' }),
        ...versions.slice(1),
      ]),
    );
    await openWith(report());
    component.selectVersion(1);
    component.note.set('voltando ao filtro antigo');

    component.reuseSelected();

    expect(confirmSpy.calls.mostRecent().args[0]).toContain('vira histórico');
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('Nada é publicado');
    expect(service.reuseReportVersion).toHaveBeenCalledOnceWith(
      'r1',
      1,
      'voltando ao filtro antigo',
    );
    expect(component.selectedNumber()).toBe(4);
    expect(component.selectedSummary()?.status).toBe('DRAFT');
    expect(emitted).toEqual([
      {
        reportId: 'r1',
        action: 'reuse',
        reportDeleted: false,
        message: 'Versão 1 retomada como rascunho v4.',
      },
    ]);
  });

  it('nao retoma quando a confirmacao e cancelada ou a acao nao esta liberada', async () => {
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);
    await openWith(report());
    component.selectVersion(1);
    component.reuseSelected();
    expect(service.reuseReportVersion).not.toHaveBeenCalled();

    confirmSpy.calls.reset();
    component.selectVersion(2);
    component.reuseSelected();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('em 409 ao retomar avisa que ja e o rascunho aberto e recarrega', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.reuseReportVersion.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    await openWith(report());
    component.selectVersion(1);

    component.reuseSelected();

    expect(component.feedback()?.tone).toBe('status-error');
    expect(component.feedback()?.message).toContain('já é o rascunho aberto');
    expect(service.listReportVersions).toHaveBeenCalledTimes(2);
    expect(component.busyAction()).toBeNull();
  });

  it('mostra mensagem de permissao quando o backend responde 403', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    service.publishReportVersion.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    await openWith(report());

    component.publishSelected();

    expect(component.feedback()?.message).toContain('permissão');
    expect(emitted).toEqual([]);
  });
});
