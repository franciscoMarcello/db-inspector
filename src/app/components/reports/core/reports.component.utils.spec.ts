import { formatVariableLabel, summarizeFilterValue } from './reports.component.utils';
import { ReportVariable } from '../../../services/report.service';

describe('formatVariableLabel', () => {
  it('transforma chave snake_case em rotulo legivel', () => {
    expect(formatVariableLabel('data_inicial')).toBe('Data inicial');
    expect(formatVariableLabel('data_inicial', 'data_inicial')).toBe('Data inicial');
  });

  it('transforma camelCase e chaves com ponto ou hifen', () => {
    expect(formatVariableLabel('dataInicial')).toBe('Data inicial');
    expect(formatVariableLabel('safra.ano')).toBe('Safra ano');
    expect(formatVariableLabel('codigo-item')).toBe('Codigo item');
  });

  it('mantem o rotulo definido pelo autor do relatorio', () => {
    expect(formatVariableLabel('safra', 'Safra 2025')).toBe('Safra 2025');
    expect(formatVariableLabel('item', 'Item')).toBe('Item');
  });

  it('cai na chave quando o rotulo e vazio', () => {
    expect(formatVariableLabel('item', '')).toBe('Item');
    expect(formatVariableLabel('item', null)).toBe('Item');
  });

  it('rotulo em snake_case diferente da chave tambem e formatado', () => {
    expect(formatVariableLabel('dt_ini', 'data_inicial')).toBe('Data inicial');
  });
});

describe('summarizeFilterValue', () => {
  const variable = (over: Partial<ReportVariable>): ReportVariable => ({
    key: 'k',
    label: 'K',
    type: 'string',
    required: false,
    multiple: false,
    defaultValue: null,
    orderIndex: 0,
    ...over,
  });

  it('sem valor nem padrao devolve vazio', () => {
    expect(summarizeFilterValue(variable({}), '', '')).toBe('');
  });

  it('data vira dd/mm/aaaa', () => {
    expect(summarizeFilterValue(variable({ type: 'date' }), '2026-11-04', '')).toBe('04/11/2026');
  });

  it('usa o texto da opcao escolhida e, sem valor, o padrao do relatorio', () => {
    expect(summarizeFilterValue(variable({}), '30', 'A01 - Curral 1')).toBe('A01 - Curral 1');
    expect(summarizeFilterValue(variable({ defaultValue: '5' }), '', '')).toBe('5');
  });

  it('busca digitada sem opcao escolhida nao aparece como filtro', () => {
    expect(summarizeFilterValue(variable({}), '', 'A0')).toBe('');
    expect(summarizeFilterValue(variable({ defaultValue: 'Todos' }), '', 'A0')).toBe('Todos');
  });

  it('datetime mantem a hora; date mostra so o dia', () => {
    expect(summarizeFilterValue(variable({ type: 'datetime' }), '2026-11-04T08:30', '')).toBe(
      '04/11/2026 08:30',
    );
    expect(summarizeFilterValue(variable({ type: 'date' }), '2026-11-04T08:30', '')).toBe(
      '04/11/2026',
    );
  });

  it('multipla escolha mostra os rotulos e resume acima de tres', () => {
    const labels = { '1': 'A01', '2': 'A02', '3': 'A03', '4': 'A04', '5': 'A05' };
    const multi = variable({ multiple: true });
    expect(summarizeFilterValue(multi, '1,2', '', labels)).toBe('A01, A02');
    expect(summarizeFilterValue(multi, '1,2,3,4,5', '', labels)).toBe('A01, A02, A03 e mais 2');
  });
});
