/** E-04: src/features/registry.ts と src/i18n/ja.ts から機能台帳ドキュメント docs/ja/features.md を生成する。 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = process.cwd();

function loadTsExports(relPath) {
  const source = readFileSync(join(ROOT, relPath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const mod = { exports: {} };
  vm.runInNewContext(transpiled.outputText, { exports: mod.exports, module: mod });
  return mod.exports;
}

const { FEATURES } = loadTsExports('src/features/registry.ts');
const { ja } = loadTsExports('src/i18n/ja.ts');

const STATUS_LABEL = {
  stable: '安定版 (stable)',
  beta: 'ベータ (beta)',
  wip: '開発中 (wip)',
  planned: '計画中 (planned)',
};

const lines = [
  '# Urito POS 機能台帳',
  '',
  '> このファイルは `npm run docs:features` により [registry.ts](../../src/features/registry.ts) から自動生成されます。手動編集しないでください。',
  '',
  `| ID | 機能名 | 状態 | 導入バージョン | パス | 概要 |`,
  `|---|---|---|---|---|---|`,
];

for (const f of FEATURES) {
  const title = ja[f.titleKey] ?? f.titleKey;
  const desc = f.descKey ? (ja[f.descKey] ?? '') : '';
  const path = f.path ? `\`${f.path}\`` : '—';
  lines.push(`| \`${f.id}\` | ${title} | ${STATUS_LABEL[f.status] ?? f.status} | v${f.since} | ${path} | ${desc} |`);
}

lines.push('');

mkdirSync(join(ROOT, 'docs', 'ja'), { recursive: true });
const outPath = join(ROOT, 'docs', 'ja', 'features.md');
writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Generated ${outPath} (${FEATURES.length} entries)`);

// E-01: README.md 内のマーカー間にも機能一覧テーブルを自動注入する
const readmePath = join(ROOT, 'README.md');
const startMark = '<!-- FEATURES:START -->';
const endMark = '<!-- FEATURES:END -->';
const readme = readFileSync(readmePath, 'utf8');
const sIdx = readme.indexOf(startMark);
const eIdx = readme.indexOf(endMark);
if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
  const tableLines = lines.slice(4, -1); // テーブルヘッダ〜データ行
  const injected = `${readme.slice(0, sIdx + startMark.length)}\n\n${tableLines.join('\n')}\n\n${readme.slice(eIdx)}`;
  writeFileSync(readmePath, injected, 'utf8');
  console.log(`Updated ${readmePath} between feature markers (${FEATURES.length} entries)`);
}
