import { contrastRatio } from './contrast';

describe('contrastRatio', () => {
  it('preto sobre branco da 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('uma cor sobre ela mesma da 1', () => {
    expect(contrastRatio('#2563eb', '#2563eb')).toBeCloseTo(1, 5);
  });

  it('a ordem das cores nao muda o resultado', () => {
    expect(contrastRatio('#fff', '#2563eb')).toBeCloseTo(contrastRatio('#2563eb', '#fff'), 5);
  });

  it('aceita a forma curta #rgb', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
  });

  it('confere com o valor de referencia do WCAG (azul #2563eb sobre branco = 5,17)', () => {
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(5.17, 2);
  });

  it('cor invalida falha com mensagem clara', () => {
    expect(() => contrastRatio('rgb(0,0,0)', '#fff')).toThrowError(/Cor invalida/);
  });
});
