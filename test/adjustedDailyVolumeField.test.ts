import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, normalize, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { avRowVolume } from '@/lib/scanner/avVolume';
import { parseAlphaVantageTimeSeries } from '@/lib/candleProcessor';

/**
 * TIME_SERIES_DAILY_ADJUSTED stores share volume in '6. volume'. Field 5 is
 * '5. adjusted close', so a reader that only indexes '5. volume' stores 0 or NaN.
 * avRowVolume is the one place that may read '5. volume', and only after '6. volume'.
 */

const ROOT = resolve(__dirname, '..');
const ADJUSTED = 'TIME_SERIES_DAILY_ADJUSTED';
const FIVE = '5. volume';
const SIX = '6. volume';

type Taint = { tainted: boolean; elements?: Taint[] };
type Violation = { file: string; line: number; text: string };
type FnRec = {
  id: string;
  name: string;
  file: string;
  node: ts.FunctionLikeDeclaration;
  parent: ts.FunctionLikeDeclaration | null;
  paramCount: number;
};

const FETCH_NAMES = new Set(['fetch', 'avFetch', 'avFetchAdmin', 'fetchWithRetry', 'fetchAlphaJson']);
const CALLBACK_METHODS = new Set(['map', 'flatMap', 'forEach', 'filter', 'reduce']);

function isFn(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || ts.isNonNullExpression(cur) || ts.isSatisfiesExpression(cur)) {
    cur = cur.expression;
  }
  return cur;
}

function fnName(node: ts.FunctionLikeDeclaration): string | null {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return null;
}

function enclosingFn(node: ts.Node): ts.FunctionLikeDeclaration | null {
  let parent = node.parent;
  while (parent) {
    if (isFn(parent)) return parent;
    parent = parent.parent;
  }
  return null;
}

function isAvVolumeFile(file: string): boolean {
  return file.replace(/\\/g, '/').endsWith('lib/scanner/avVolume.ts');
}

export function adjustedVolumeViolations(files: { path: string; text: string }[]): Violation[] {
  const fileSet = new Set(files.map((file) => normalize(file.path)));
  const sources = new Map<string, ts.SourceFile>();
  const fns: FnRec[] = [];
  const fnByNode = new Map<ts.FunctionLikeDeclaration, FnRec>();
  const imports = new Map<string, Map<string, { file: string; exportName: string }>>();

  function resolveModule(fromFile: string, spec: string): string | null {
    let base: string | null = null;
    if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
    if (!base) return null;
    for (const candidate of [base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]) {
      const norm = normalize(candidate);
      if (fileSet.has(norm) || existsSync(norm)) return norm;
    }
    return null;
  }

  for (const file of files) {
    const path = normalize(file.path);
    const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(path, file.text, ts.ScriptTarget.Latest, true, kind);
    sources.set(path, sf);
    const locals = new Map<string, { file: string; exportName: string }>();
    sf.forEachChild((node) => {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.importClause?.isTypeOnly) return;
      const target = resolveModule(path, node.moduleSpecifier.text);
      if (!target || !node.importClause) return;
      const named = node.importClause.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const spec of named.elements) {
          if (spec.isTypeOnly) continue;
          locals.set(spec.name.text, { file: target, exportName: spec.propertyName?.text ?? spec.name.text });
        }
      }
    });
    imports.set(path, locals);

    function visit(node: ts.Node) {
      if (isFn(node) && node.body) {
        const name = fnName(node);
        if (name) {
          const rec: FnRec = {
            id: `${path}#${name}#${node.pos}`,
            name,
            file: path,
            node,
            parent: enclosingFn(node),
            paramCount: node.parameters.length,
          };
          fns.push(rec);
          fnByNode.set(node, rec);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }

  fns.sort((a, b) => a.node.pos - b.node.pos);
  const interesting = new Set<string>();
  for (const fn of fns) {
    const text = fn.node.getText();
    if (text.includes(ADJUSTED) || text.includes('5. volume')) interesting.add(fn.id);
  }
  const byLocal = new Map<string, FnRec[]>();
  for (const fn of fns) {
    const key = `${fn.file}#${fn.name}`;
    const list = byLocal.get(key);
    if (list) list.push(fn);
    else byLocal.set(key, [fn]);
  }
  const paramTaint = new Map<string, boolean[]>();
  const envByNode = new Map<ts.Node, Map<string, boolean>>();

  function resolveCallee(file: string, name: string): FnRec[] {
    const local = byLocal.get(`${file}#${name}`);
    if (local?.length) return local;
    const imported = imports.get(file)?.get(name);
    if (!imported) return [];
    const exported = (byLocal.get(`${imported.file}#${imported.exportName}`) ?? []).filter((fn) => !fn.parent);
    return exported.length ? exported : (byLocal.get(`${imported.file}#${imported.exportName}`) ?? []);
  }

  function noteCall(file: string, name: string, argTaints: boolean[]): boolean {
    let grew = false;
    for (const target of resolveCallee(file, name)) {
      const prev = paramTaint.get(target.id) ?? Array.from({ length: target.paramCount }, () => false);
      const next = prev.slice();
      argTaints.forEach((tainted, index) => {
        if (tainted && index < next.length && !next[index]) {
          next[index] = true;
          grew = true;
        }
      });
      paramTaint.set(target.id, next);
    }
    return grew;
  }

  function analyze(fn: ts.FunctionLikeDeclaration, file: string, closure: Map<string, boolean> | undefined, paramTaints: boolean[]): { violations: Violation[]; grew: boolean } {
    const sf = fn.getSourceFile();
    const env = new Map(closure);
    const consts = new Map<string, Set<string> | null>();
    const declared = new Set<string>();
    const violations: Violation[] = [];
    let grew = false;
    const iifeStack = new Set<ts.Node>();
    let taintMemo = new Map<ts.Node, Taint>();

    function assign(name: string, tainted: boolean, isDecl: boolean) {
      if (isDecl && !declared.has(name)) {
        declared.add(name);
        env.set(name, tainted);
        return;
      }
      env.set(name, (env.get(name) ?? false) || tainted);
    }

    function setConst(name: string, expr: ts.Expression | undefined, isDecl: boolean) {
      const next = expr ? constSet(expr) : null;
      if (isDecl && !declared.has(name)) {
        consts.set(name, next);
        return;
      }
      const prev = consts.get(name);
      if (prev === undefined) consts.set(name, next);
      else if (prev === null || next === null) consts.set(name, null);
      else consts.set(name, new Set([...prev, ...next]));
    }

    function constSet(expr: ts.Expression): Set<string> | null {
      const node = unwrap(expr);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return new Set([node.text]);
      if (ts.isIdentifier(node)) return consts.get(node.text) ?? null;
      if (ts.isConditionalExpression(node)) {
        const left = constSet(node.whenTrue);
        const right = constSet(node.whenFalse);
        if (!left || !right) return null;
        return new Set([...left, ...right]);
      }
      return null;
    }

    function bindPattern(name: ts.BindingName, tainted: boolean, isDecl: boolean) {
      if (ts.isIdentifier(name)) {
        assign(name.text, tainted, isDecl);
        return;
      }
      if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) {
          if (ts.isOmittedExpression(element)) continue;
          bindPattern(element.name, tainted, isDecl);
        }
      }
    }

    function bindParams() {
      fn.parameters.forEach((param, index) => {
        bindPattern(param.name, paramTaints[index] ?? false, true);
      });
    }

    function exprTaint(expr: ts.Expression): Taint {
      const node = unwrap(expr);
      const cached = taintMemo.get(node);
      if (cached) return cached;
      const value = exprTaintRaw(node);
      taintMemo.set(node, value);
      return value;
    }

    function exprTaintRaw(node: ts.Expression): Taint {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return { tainted: node.text.includes(ADJUSTED) };
      }
      if (ts.isTemplateExpression(node)) {
        let tainted = node.head.text.includes(ADJUSTED);
        for (const span of node.templateSpans) {
          tainted = tainted || span.literal.text.includes(ADJUSTED) || exprTaint(span.expression).tainted;
        }
        return { tainted };
      }
      if (ts.isIdentifier(node)) return { tainted: env.get(node.text) ?? false };
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        return { tainted: exprTaint(node.expression).tainted };
      }
      if (ts.isAwaitExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isTypeAssertionExpression(node)) {
        return exprTaint(node.expression);
      }
      if (ts.isConditionalExpression(node)) {
        const whenTrue = exprTaint(node.whenTrue);
        const whenFalse = exprTaint(node.whenFalse);
        return { tainted: whenTrue.tainted || whenFalse.tainted, elements: whenTrue.elements ?? whenFalse.elements };
      }
      if (ts.isBinaryExpression(node)) {
        const kind = node.operatorToken.kind;
        if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.AmpersandAmpersandToken) {
          const left = exprTaint(node.left);
          const right = exprTaint(node.right);
          return { tainted: left.tainted || right.tainted, elements: left.elements ?? right.elements };
        }
        return { tainted: false };
      }
      if (ts.isObjectLiteralExpression(node)) {
        let tainted = false;
        for (const prop of node.properties) {
          if (ts.isSpreadAssignment(prop)) tainted = tainted || exprTaint(prop.expression).tainted;
          else if (ts.isPropertyAssignment(prop)) tainted = tainted || exprTaint(prop.initializer).tainted;
          else if (ts.isShorthandPropertyAssignment(prop)) tainted = tainted || (env.get(prop.name.text) ?? false);
        }
        return { tainted };
      }
      if (ts.isArrayLiteralExpression(node)) {
        const elements = node.elements.map((element) => ts.isSpreadElement(element) ? exprTaint(element.expression) : exprTaint(element));
        return { tainted: elements.some((element) => element.tainted), elements };
      }
      if (ts.isCallExpression(node)) return callTaint(node);
      if (ts.isTaggedTemplateExpression(node)) return exprTaint(node.template);
      return { tainted: false };
    }

    function callTaint(node: ts.CallExpression): Taint {
      const callee = unwrap(node.expression);
      if (isFn(callee)) return returnedTaint(callee);
      if (ts.isIdentifier(callee) && FETCH_NAMES.has(callee.text)) {
        return { tainted: node.arguments[0] ? exprTaint(node.arguments[0]).tainted : false };
      }
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'json') {
        return { tainted: exprTaint(callee.expression).tainted };
      }
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'Object' && (callee.name.text === 'entries' || callee.name.text === 'values')) {
        return { tainted: node.arguments[0] ? exprTaint(node.arguments[0]).tainted : false };
      }
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'all' && ts.isIdentifier(callee.expression) && callee.expression.text === 'Promise') {
        const arg = node.arguments[0];
        if (arg && ts.isArrayLiteralExpression(arg)) {
          const elements = arg.elements.map((element) => ts.isSpreadElement(element) ? exprTaint(element.expression) : exprTaint(element));
          return { tainted: elements.some((element) => element.tainted), elements };
        }
      }
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'JSON' && callee.name.text === 'parse') {
        return { tainted: node.arguments[0] ? exprTaint(node.arguments[0]).tainted : false };
      }
      if (ts.isIdentifier(callee)) {
        const targets = resolveCallee(file, callee.text);
        for (const target of targets) {
          const cached = envByNode.get(target.node);
          if (cached?.get('__return__')) return { tainted: true };
        }
      }
      if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
        const recv = exprTaint(callee.expression);
        if (recv.tainted) return { tainted: true, elements: recv.elements };
      }
      return { tainted: false };
    }

    function returnedTaint(target: ts.FunctionLikeDeclaration): Taint {
      if (!target.body || iifeStack.has(target)) return { tainted: false };
      iifeStack.add(target);
      let tainted = false;
      let elements: Taint[] | undefined;
      try {
        function walk(node: ts.Node) {
          if (node !== target && isFn(node)) return;
          if (ts.isReturnStatement(node) && node.expression) {
            const value = exprTaint(node.expression);
            tainted = tainted || value.tainted;
            elements = value.elements ?? elements;
          }
          ts.forEachChild(node, walk);
        }
        walk(target.body);
      } finally {
        iifeStack.delete(target);
      }
      return { tainted, elements };
    }

    function walkLocals(visit: (node: ts.Node) => void) {
      function rec(node: ts.Node) {
        if (node !== fn && isFn(node)) return;
        visit(node);
        ts.forEachChild(node, rec);
      }
      rec(fn);
    }

    function bindDeclarations() {
      walkLocals((node) => {
        if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
          const tainted = exprTaint(node.expression).tainted;
          if (ts.isVariableDeclarationList(node.initializer)) {
            for (const declaration of node.initializer.declarations) bindPattern(declaration.name, tainted, true);
          }
          return;
        }
        if (!ts.isVariableDeclaration(node)) return;
        const grand = node.parent?.parent;
        if (grand && (ts.isForOfStatement(grand) || ts.isForInStatement(grand))) return;
        if (node.initializer && isFn(unwrap(node.initializer))) {
          if (ts.isIdentifier(node.name)) assign(node.name.text, false, true);
          return;
        }
        const init = node.initializer ? exprTaint(node.initializer) : { tainted: false };
        if (init.elements && ts.isArrayBindingPattern(node.name)) {
          node.name.elements.forEach((element, index) => {
            if (ts.isOmittedExpression(element)) return;
            bindPattern(element.name, init.elements?.[index]?.tainted ?? init.tainted, true);
          });
          return;
        }
        bindPattern(node.name, init.tainted, true);
        if (ts.isIdentifier(node.name)) setConst(node.name.text, node.initializer, true);
      });
      walkLocals((node) => {
        if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
        if (!ts.isIdentifier(node.left)) return;
        const value = exprTaint(node.right);
        assign(node.left.text, value.tainted, false);
        setConst(node.left.text, node.right, false);
      });
    }

    bindParams();
    let guard = 0;
    let seenTrue = -1;
    do {
      taintMemo = new Map();
      const before = seenTrue;
      bindDeclarations();
      seenTrue = 0;
      for (const value of env.values()) if (value) seenTrue += 1;
      if (seenTrue === before) break;
      guard += 1;
    } while (guard < 8);

    function keyKind(expr: ts.Expression): 'five' | 'six' | 'other' | 'mixed' {
      const node = unwrap(expr);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (node.text === FIVE) return 'five';
        if (node.text === SIX) return 'six';
        return 'other';
      }
      if (ts.isIdentifier(node)) {
        const set = consts.get(node.text);
        if (!set) return 'other';
        const hasFive = set.has(FIVE);
        const hasSix = set.has(SIX);
        if (hasFive && hasSix) return 'mixed';
        if (hasFive) return 'five';
        if (hasSix) return 'six';
        return 'other';
      }
      if (ts.isConditionalExpression(node)) {
        const left = keyKind(node.whenTrue);
        const right = keyKind(node.whenFalse);
        if (left === 'other' || right === 'other') return 'other';
        if (left === right) return left;
        return 'mixed';
      }
      return 'other';
    }

    function coversSix(node: ts.Node): boolean {
      let cur = node;
      while (cur.parent) {
        const parent = cur.parent;
        if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent) || ts.isSatisfiesExpression(parent) || ts.isAwaitExpression(parent) || ts.isTypeAssertionExpression(parent) || ts.isPrefixUnaryExpression(parent) || ts.isCallExpression(parent)) {
          cur = parent;
          continue;
        }
        if (ts.isBinaryExpression(parent) && (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken || parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
          cur = parent;
          continue;
        }
        if (ts.isConditionalExpression(parent)) {
          cur = parent;
          continue;
        }
        break;
      }
      let found = false;
      function walk(child: ts.Node) {
        if (found) return;
        if ((ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) && child.text === SIX) found = true;
        ts.forEachChild(child, walk);
      }
      walk(cur);
      return found;
    }

    function recordReads(target: ts.FunctionLikeDeclaration) {
      function rec(node: ts.Node) {
        if (node !== target && isFn(node)) return;
        if (ts.isElementAccessExpression(node) && node.argumentExpression && keyKind(node.argumentExpression) === 'five') {
          if (exprTaint(node.expression).tainted && !coversSix(node) && !isAvVolumeFile(file)) {
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            const rel = relative(ROOT, file);
            violations.push({
              file: rel.startsWith('..') ? basename(file) : rel.split('\\').join('/'),
              line: pos.line + 1,
              text: node.getText(sf).slice(0, 160),
            });
          }
        }
        ts.forEachChild(node, rec);
      }
      if (target.body) rec(target.body);
    }

    recordReads(fn);
    const returnsTainted = returnedTaint(fn).tainted;
    env.set('__return__', returnsTainted);
    envByNode.set(fn, new Map(env));

    walkLocals((node) => {
      if (!ts.isCallExpression(node)) return;
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && !FETCH_NAMES.has(callee.text)) {
        const argTaints = node.arguments.map((arg) => exprTaint(arg).tainted);
        if (noteCall(file, callee.text, argTaints)) grew = true;
      }
      if (!ts.isPropertyAccessExpression(callee) || !CALLBACK_METHODS.has(callee.name.text)) return;
      const arg = node.arguments[0];
      if (arg && ts.isIdentifier(arg)) {
        const recv = exprTaint(callee.expression).tainted;
        if (noteCall(file, arg.text, [recv])) grew = true;
      }
    });

    function visitAnonymous(node: ts.Node) {
      ts.forEachChild(node, (child) => {
        if (!isFn(child) || fnByNode.has(child)) {
          if (!isFn(child)) visitAnonymous(child);
          return;
        }
        const paramFlags = callbackParamTaints(child);
        const nested = analyze(child, file, env, paramFlags);
        violations.push(...nested.violations);
        if (nested.grew) grew = true;
      });
    }
    if (fn.body) visitAnonymous(fn.body);

    function callbackParamTaints(child: ts.FunctionLikeDeclaration): boolean[] {
      const parent = child.parent;
      if (!ts.isCallExpression(parent) || parent.arguments[0] !== child || !ts.isPropertyAccessExpression(parent.expression)) {
        return child.parameters.map(() => false);
      }
      if (!CALLBACK_METHODS.has(parent.expression.name.text)) return child.parameters.map(() => false);
      const recv = exprTaint(parent.expression.expression).tainted;
      return child.parameters.map((_, index) => index === 0 && recv);
    }

    return { violations, grew };
  }

  let violations: Violation[] = [];
  for (let iter = 0; iter < 12; iter += 1) {
    violations = [];
    let grew = false;
    for (const rec of fns) {
      const params = paramTaint.get(rec.id) ?? Array.from({ length: rec.paramCount }, () => false);
      if (!interesting.has(rec.id) && !params.some(Boolean)) continue;
      const closure = rec.parent ? envByNode.get(rec.parent) : undefined;
      const result = analyze(rec.node, rec.file, closure, params);
      violations.push(...result.violations);
      if (result.grew) grew = true;
    }
    if (!grew) break;
  }

  const seen = new Set<string>();
  return violations.filter((item) => {
    const key = `${item.file}:${item.line}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function repoSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'dist' || entry === 'coverage' || entry === 'test' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      const info = statSync(path);
      if (info.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
        const text = readFileSync(path, 'utf8');
        // A reader can only index this field, or hand the adjusted payload to one, if the file mentions it.
        if (text.includes('TIME_SERIES_DAILY_ADJUSTED') || text.includes('5. volume')) out.push({ path, text });
      }
    }
  }
  walk(ROOT);
  return out;
}

const adjustedRow = {
  '1. open': '232.0',
  '2. high': '232.6168',
  '3. low': '226.01',
  '4. close': '227.06',
  '5. adjusted close': '227.06',
  '6. volume': '4149575',
  '7. dividend amount': '0.0000',
  '8. split coefficient': '1.0',
};

describe('adjusted daily volume field', () => {
  it('parseInt of the missing 5. volume key is NaN, while avRowVolume reads 6. volume', () => {
    expect(parseInt((adjustedRow as { '5. volume'?: string })['5. volume']!)).toBeNaN();
    expect(avRowVolume(adjustedRow)).toBe(4149575);
    expect(avRowVolume({ '1. open': '1', '4. close': '1', '5. volume': '1000' })).toBe(1000);
  });

  it('parseAlphaVantageTimeSeries keeps adjusted volume, intraday volume, and a plain volume field', () => {
    const adjusted = parseAlphaVantageTimeSeries({ '2026-09-24': adjustedRow });
    expect(adjusted[0].volume).toBe(4149575);
    const intraday = parseAlphaVantageTimeSeries({
      '2026-09-24 10:00:00': { '1. open': '10', '2. high': '11', '3. low': '9', '4. close': '10.5', '5. volume': '1234' },
    });
    expect(intraday[0].volume).toBe(1234);
    const plain = parseAlphaVantageTimeSeries({
      '2026-09-24': { open: 1, high: 2, low: 0.5, close: 1.5, volume: 50 },
    });
    expect(plain[0].volume).toBe(50);
  });

  it('flags a lone 5. volume read on an adjusted payload and ignores the safe shapes', () => {
    const bad = `
      async function load(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=\${symbol}\`;
        const json = await (await fetch(url)).json();
        const series = json['Time Series (Daily)'];
        return Object.entries(series).map(([date, values]) => values['5. volume']);
      }
    `;
    const shared = `
      async function fetchSeries(url: string) {
        const json = await (await fetch(url)).json();
        const series = json['Time Series (Daily)'];
        const rows = [];
        for (const [date, values] of Object.entries(series)) rows.push(values['5. volume']);
        return rows;
      }
      async function daily(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=\${symbol}\`;
        return fetchSeries(url);
      }
    `;
    const intradayOnly = `
      async function intra(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=\${symbol}\`;
        const json = await (await fetch(url)).json();
        return json['Time Series (60min)']['2026-01-01']['5. volume'];
      }
    `;
    const plainDaily = `
      async function plain(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=\${symbol}\`;
        const json = await (await fetch(url)).json();
        return json['Time Series (Daily)']['2026-01-01']['5. volume'];
      }
    `;
    const bothFields = `
      async function both(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=\${symbol}\`;
        const json = await (await fetch(url)).json();
        const row = json['Time Series (Daily)']['2026-01-01'];
        return row['6. volume'] ?? row['5. volume'];
      }
    `;
    const fiveThenSix = `
      async function either(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=\${symbol}\`;
        const json = await (await fetch(url)).json();
        const row = json['Time Series (Daily)']['2026-01-01'];
        return row['5. volume'] || row['6. volume'];
      }
    `;
    const mixedEndpoint = `
      async function flow(symbol: string) {
        const intradayUrl = \`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=\${symbol}\`;
        const dailyUrl = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=\${symbol}\`;
        const intraday = await (await fetch(intradayUrl)).json();
        const daily = await (await fetch(dailyUrl)).json();
        const bars = Object.entries(intraday['Time Series (60min)']).map(([ts, values]) => values['5. volume']);
        const close = daily['Time Series (Daily)']['2026-01-01']['4. close'];
        return { bars, close, synthetic: { '5. volume': '0' } };
      }
    `;
    const viaHelper = `
      function volumeOf(row: any) { return avRowVolume(row); }
      async function load(symbol: string) {
        const url = \`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=\${symbol}\`;
        const json = await (await fetch(url)).json();
        return volumeOf(json['Time Series (Daily)']['2026-01-01']);
      }
    `;
    const files = [
      { path: '/virtual/bad.ts', text: bad },
      { path: '/virtual/shared.ts', text: shared },
      { path: '/virtual/intraday.ts', text: intradayOnly },
      { path: '/virtual/plain.ts', text: plainDaily },
      { path: '/virtual/both.ts', text: bothFields },
      { path: '/virtual/either.ts', text: fiveThenSix },
      { path: '/virtual/flow.ts', text: mixedEndpoint },
      { path: '/virtual/helper.ts', text: viaHelper },
    ];
    const found = adjustedVolumeViolations(files).map((item) => `${item.file}:${item.line}`);
    expect(found.some((item) => item.startsWith('bad.ts'))).toBe(true);
    expect(found.some((item) => item.startsWith('shared.ts'))).toBe(true);
    expect(found.some((item) => item.startsWith('intraday.ts'))).toBe(false);
    expect(found.some((item) => item.startsWith('plain.ts'))).toBe(false);
    expect(found.some((item) => item.startsWith('both.ts'))).toBe(false);
    expect(found.some((item) => item.startsWith('either.ts'))).toBe(false);
    expect(found.some((item) => item.startsWith('flow.ts'))).toBe(false);
    expect(found.some((item) => item.startsWith('helper.ts'))).toBe(false);
  });

  it('no production reader indexes 5. volume on a TIME_SERIES_DAILY_ADJUSTED payload outside avVolume.ts', () => {
    const violations = adjustedVolumeViolations(repoSources());
    expect(violations).toEqual([]);
  }, 20000);
});

const { avFetch } = vi.hoisted(() => ({ avFetch: vi.fn() }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch }));

describe('priceService volume on both daily endpoints', () => {
  it('getDaily reads 6. volume from TIME_SERIES_DAILY_ADJUSTED and getBars still reads intraday 5. volume', async () => {
    avFetch.mockImplementation(async (url: string) => {
      if (url.includes('TIME_SERIES_DAILY_ADJUSTED')) {
        return { 'Time Series (Daily)': { '2026-09-24': adjustedRow } };
      }
      if (url.includes('TIME_SERIES_INTRADAY')) {
        return {
          'Time Series (60min)': {
            '2026-09-24 15:00:00': { '1. open': '10', '2. high': '11', '3. low': '9', '4. close': '10.5', '5. volume': '1234' },
          },
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const { getDaily, getBars } = await import('@/lib/catalyst/priceService');
    const start = new Date('2020-01-01T00:00:00Z');
    const end = new Date('2030-01-01T00:00:00Z');
    const daily = await getDaily('ZZADJVOL', start, end);
    const intra = await getBars('ZZADJVOL', '60min', start, end, false);
    expect(daily.map((bar) => bar.volume)).toEqual([4149575]);
    expect(intra.map((bar) => bar.volume)).toEqual([1234]);
    expect(String(avFetch.mock.calls[0][0])).toContain('function=TIME_SERIES_DAILY_ADJUSTED');
    expect(String(avFetch.mock.calls[1][0])).toContain('function=TIME_SERIES_INTRADAY');
  });
});
