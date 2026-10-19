import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';
function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : /\.[cm]?[jt]sx?$/.test(e.name) ? [`${dir}/${e.name}`] : []); }
function imports(file: string): string[] {
  const out: string[] = [];
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const spec = node.arguments[0];
      out.push(spec && ts.isStringLiteral(spec) ? spec.text : '<dynamic import forbidden>');
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); return out;
}
test('pure tests and their local dependencies cannot import I/O-heavy modules', () => {
  const errors: string[] = [], seen = new Set<string>();
  const scan = (file: string): void => {
    if (seen.has(file)) return; seen.add(file);
    for (const spec of imports(file)) {
      if (/^(?:node:)?(?:child_process|https?|net)(?:\/|$)/.test(spec) || /^(?:sharp|@img\/sharp)(?:\/|$)/.test(spec) || spec === '<dynamic import forbidden>') errors.push(`${file}: ${spec}`);
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec).replace(/\.[cm]?jsx?$/, '.ts');
        if (target.includes('/src/server/')) errors.push(`${file}: ${spec}`);
        else if (['.ts', '.tsx'].includes(extname(target))) scan(target);
      }
    }
  };
  for (const file of [...files('tests/unit'), ...files('tests/property')]) scan(resolve(file));
  expect(errors).toEqual([]);
});
