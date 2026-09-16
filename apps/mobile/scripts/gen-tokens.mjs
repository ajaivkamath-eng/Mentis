/**
 * Generates `apps/mobile/tokens.json` from the single source of truth,
 * `packages/core/src/tokens.ts`.
 *
 * Tooling that cannot import TypeScript (tailwind.config.js, metro.config.js)
 * reads the generated JSON instead of hand-copying hex values. CI re-runs this
 * script and fails if the committed JSON is stale, so the two can never drift.
 *
 *   node scripts/gen-tokens.mjs            # write tokens.json
 *   node scripts/gen-tokens.mjs --check     # exit 1 if it is out of date
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const tokensTsPath = resolve(here, '../../../packages/core/src/tokens.ts');
const outPath = resolve(here, '../tokens.json');

/** Compile the token module in memory (it has no imports) and evaluate it. */
function loadTokens() {
  const source = readFileSync(tokensTsPath, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'tokens.ts',
  }).outputText;

  const module = { exports: {} };
  new Function('exports', 'module', js)(module.exports, module);
  return module.exports;
}

/** `brandText` → `--brand-text` (matches the CSS contract in app.css/global.css). */
const cssVar = (key) => `--${key.replace(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase()}`;

function build() {
  const t = loadTokens();
  // `chart` is a series array, not a single value — it is emitted as chart1…5.
  const semanticColours = Object.fromEntries(
    Object.keys(t.darkTheme)
      .filter((key) => key !== 'chart')
      .map((key) => [key, cssVar(key)]),
  );

  return {
    $comment:
      'GENERATED from packages/core/src/tokens.ts by apps/mobile/scripts/gen-tokens.mjs — do not edit by hand.',
    version: t.DS_VERSION,
    semanticColours,
    radii: t.radii,
    space: t.space,
    fonts: { sans: t.fonts.sans, display: t.fonts.display, mono: t.fonts.mono },
    duration: t.duration,
    easing: t.easing,
    spring: t.spring,
    typeScale: t.typeScale,
    themes: { dark: t.darkTheme, light: t.lightTheme },
    cssVars: t.cssVarNames,
  };
}

const json = `${JSON.stringify(build(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== json) {
    console.error('tokens.json is out of date — run: npm run tokens:sync');
    process.exit(1);
  }
  console.log('tokens.json is in sync with packages/core/src/tokens.ts');
} else {
  writeFileSync(outPath, json);
  console.log(`wrote ${outPath}`);
}
