import { formatVariableLabel } from './reports.component.utils';

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
