import { contrastRatio } from './utils/contrast';

// Minimos WCAG AA: 4,5 para texto, 3 para bordas de controle e indicadores.
const TEXT = 4.5;
const UI = 3;

const PAIRS: ReadonlyArray<[foreground: string, background: string, minimum: number]> = [
  ['--text-primary', '--bg-page', TEXT],
  ['--text-primary', '--bg-surface', TEXT],
  ['--text-primary', '--bg-surface-alt', TEXT],
  ['--text-primary', '--chip-bg', TEXT],
  ['--text-muted', '--bg-page', TEXT],
  ['--text-muted', '--bg-surface', TEXT],
  ['--text-muted', '--bg-surface-alt', TEXT],
  ['--on-accent', '--chip-bg-active', TEXT],
  ['--accent-soft-text', '--accent-soft', TEXT],
  // Links e textos azuis usam --accent-soft-text; --chip-bg-active e so fundo de botao.
  ['--accent-soft-text', '--bg-surface', TEXT],
  ['--accent-soft-text', '--bg-surface-alt', TEXT],
  ['--danger', '--bg-surface', TEXT],
  ['--warning-soft-text', '--warning-soft', TEXT],
  ['--success', '--bg-surface', TEXT],
  ['--warning', '--bg-surface', TEXT],
  ['--info', '--bg-surface', TEXT],
  ['--attention', '--bg-surface', TEXT],
  ['--danger', '--bg-surface-alt', TEXT],
  ['--attention', '--bg-surface-alt', TEXT],
  ['--border-strong', '--bg-surface', UI],
  // Icones de tipo de arquivo ficam sobre o botao neutro (surface-alt) e sobre menus (surface).
  ['--file-excel', '--bg-surface-alt', UI],
  ['--file-excel', '--bg-surface', UI],
  ['--file-pdf', '--bg-surface-alt', UI],
  ['--file-pdf', '--bg-surface', UI],
  ['--chip-bg-active', '--bg-surface', UI],
];

// Fica direto no <html> para nao herdar a classe de tema que outro teste deixe no body.
function readTokens(dark: boolean): (name: string) => string {
  const probe = document.createElement('div');
  if (dark) probe.classList.add('dark-theme');
  document.documentElement.appendChild(probe);
  const style = getComputedStyle(probe);
  const values = new Map(
    PAIRS.flatMap(([fg, bg]) => [fg, bg]).map((n) => [n, style.getPropertyValue(n).trim()]),
  );
  probe.remove();
  return (name) => values.get(name) ?? '';
}

for (const [label, dark] of [
  ['claro', false],
  ['escuro', true],
] as const) {
  describe(`tokens de cor do tema ${label}`, () => {
    let token: (name: string) => string;
    beforeAll(() => (token = readTokens(dark)));

    for (const [fg, bg, minimum] of PAIRS) {
      it(`${fg} sobre ${bg} tem contraste de pelo menos ${minimum}`, () => {
        const ratio = contrastRatio(token(fg), token(bg));
        expect(ratio)
          .withContext(`${token(fg)} sobre ${token(bg)} = ${ratio.toFixed(2)}`)
          .toBeGreaterThanOrEqual(minimum);
      });
    }
  });
}
