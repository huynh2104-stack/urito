/**
 * E-05: コメント変更前後で実行コード（コメント除去後のコンパイル結果）が同一かを TypeScript API で検証する。
 * 使い方:
 *   node scripts/verify-comment-only.mjs <file1.ts> <file2.ts>  (2ファイル比較)
 *   node scripts/verify-comment-only.mjs --git <path>            (HEAD版との比較)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function stripToExecutable(source, fileName) {
  const out = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      removeComments: true,
    },
  });
  return out.outputText.replace(/\r\n/g, '\n').trim();
}

const args = process.argv.slice(2);
if (args[0] === '--git' && args[1]) {
  const target = args[1];
  const headSrc = execFileSync('git', ['show', `HEAD:${target}`], { encoding: 'utf8' });
  const curSrc = readFileSync(target, 'utf8');
  if (stripToExecutable(headSrc, target) !== stripToExecutable(curSrc, target)) {
    console.error(`NG: ${target} にコメント以外のコード変更が含まれています`);
    process.exit(1);
  }
  console.log(`OK: ${target} はコメントのみの編集です`);
} else if (args.length === 2) {
  const [a, b] = args;
  const srcA = readFileSync(a, 'utf8');
  const srcB = readFileSync(b, 'utf8');
  if (stripToExecutable(srcA, a) !== stripToExecutable(srcB, b)) {
    console.error(`NG: ${a} と ${b} の実行AST出力が一致しません`);
    process.exit(1);
  }
  console.log(`OK: ${a} == ${b} (コメント除外後完全一致)`);
} else {
  console.error('使い方: node scripts/verify-comment-only.mjs <a.ts> <b.ts> または --git <path>');
  process.exit(2);
}
