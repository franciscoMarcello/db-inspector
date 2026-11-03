import { buildComparisonPayload, EmailScheduleResult } from './email-schedule-dialog';

function result(overrides: Partial<EmailScheduleResult> = {}): EmailScheduleResult {
  return {
    sql: 'select 1',
    secondSql: 'select 1 from dummy',
    compareWithSap: true,
    comparisonKey: 'Chave',
    comparisonTolerances: {},
    comparisonTolerancePercents: {},
    comparisonColumns: [],
    comparisonIgnoreColumns: [],
    comparisonGroupBy: '',
    comparisonValueColumn: '',
    comparisonTopN: 10,
    sendOnlyIfDifferent: true,
    comparisonTitle: '',
    comparisonNote: '',
    to: 'dev@example.com',
    cc: '',
    subject: 'Alerta',
    message: '',
    reportId: '',
    attachPdf: false,
    pdfMode: 'report',
    pdfTitle: '',
    pdfSubtitle: '',
    pdfIncludeSummary: true,
    pdfMaxRows: 3000,
    attachXlsx: true,
    time: '08:00',
    days: ['mon'],
    ...overrides,
  };
}

describe('buildComparisonPayload', () => {
  it('omite listas e mapas vazios para nao sobrescrever o default do backend', () => {
    const payload = buildComparisonPayload(result());

    expect(payload.comparisonColumns).toBeUndefined();
    expect(payload.comparisonIgnoreColumns).toBeUndefined();
    expect(payload.comparisonTolerances).toBeUndefined();
    expect(payload.comparisonTolerancePercents).toBeUndefined();
    expect(payload.comparisonGroupBy).toBeUndefined();
    expect(payload.comparisonValueColumn).toBeUndefined();
    expect(payload.comparisonKey).toBe('Chave');
    expect(payload.comparisonTopN).toBe(10);
  });

  it('envia as opcoes de comparacao preenchidas', () => {
    const payload = buildComparisonPayload(
      result({
        comparisonColumns: ['Chave', 'Custo Total'],
        comparisonTolerances: { 'custo total': 0.02 },
        comparisonTolerancePercents: { 'custo total': 0.5 },
        comparisonGroupBy: 'Modelo',
        comparisonValueColumn: 'Custo Total',
        comparisonTopN: 0,
      }),
    );

    expect(payload.comparisonColumns).toEqual(['Chave', 'Custo Total']);
    expect(payload.comparisonTolerances).toEqual({ 'custo total': 0.02 });
    expect(payload.comparisonTolerancePercents).toEqual({ 'custo total': 0.5 });
    expect(payload.comparisonGroupBy).toBe('Modelo');
    expect(payload.comparisonValueColumn).toBe('Custo Total');
    expect(payload.comparisonTopN).toBe(0);
  });
});
