// Trava de cores fixas: falha quando o numero de cores escritas direto no codigo
// (fora de src/tokens.css) passa do teto salvo em scripts/color-baseline.json.
// Uso: node scripts/check-colors.mjs [--update]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_FILE = join(ROOT, 'scripts', 'color-baseline.json');
const TOKENS_FILE = 'src/tokens.css';
// Nao conta entidades HTML (&#123;) nem ancoras (href="#abc"); conta hex seguido de _ (Tailwind).
const COLOR_LITERAL = /(?<![&"\w])#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])|\b(?:rgba?|hsla?)\(/g;

export function countColors(text) {
  return (text.match(COLOR_LITERAL) || []).length;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

export function scan(root = ROOT) {
  const perFile = {};
  for (const file of walk(join(root, 'src'))) {
    const rel = relative(root, file).split('\\').join('/');
    if (rel === TOKENS_FILE || !/\.(css|html)$/.test(rel)) continue;
    const count = countColors(readFileSync(file, 'utf8'));
    if (count) perFile[rel] = count;
  }
  return perFile;
}

function main() {
  const perFile = scan();
  const total = Object.values(perFile).reduce((sum, n) => sum + n, 0);

  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE_FILE, JSON.stringify({ max: total }, null, 2) + '\n');
    console.log(`Teto de cores fixas atualizado para ${total}.`);
    return;
  }

  const { max } = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  if (total > max) {
    console.error(`Cores fixas subiram: ${total} (teto ${max}). Use os tokens de src/tokens.css.`);
    Object.entries(perFile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([file, n]) => console.error(`  ${n}\t${file}`));
    process.exitCode = 1;
    return;
  }
  if (total < max) {
    console.log(
      `Cores fixas: ${total} (teto ${max}). Baixe o teto: npm run check:colors -- --update`,
    );
    return;
  }
  console.log(`Cores fixas: ${total} (no teto).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
