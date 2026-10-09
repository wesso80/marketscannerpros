/**
 * Customer-rendered copy scanner.
 *
 * Walks app/ and components/ and extracts text a customer can see:
 * JSX text, JSX expression strings, user-facing attributes (label, title,
 * placeholder, alt, tooltip, summary, aria-*), metadata/email fields, and
 * tuple labels rendered as <dt> text.
 *
 * Internal identifiers, class names, routes, API field names, and single
 * uppercase engine codes are ignored. Title-case and sentence copy is scanned.
 * Admin pages stay out of the failing scan. Homepage copy is included.
 * components/home is scanned. Customer-facing lib modules (guides, presentation,
 * display helpers, alert email text) are scanned, including plain string
 * constants and variables. Phrase allowlist entries are exact substrings;
 * only the allowlisted span is exempt. A banned word after not/no/never is allowed.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

export const BANNED_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'score', re: /\bscores?\b/gi },
  { id: 'grade', re: /\bgrades?\b/gi },
  { id: 'verdict', re: /\bverdicts?\b/gi },
  { id: 'rating', re: /\bratings?\b/gi },
  { id: 'confidence-percent', re: /\bconfidence\b/gi },
  { id: 'a-plus', re: /\bA\+/g },
  { id: 'tradable', re: /\btradable\b/gi },
  { id: 'picks', re: /\bpicks\b/gi },
  { id: 'signal', re: /\bsignals?\b/gi },
  { id: 'edge', re: /\bedges?\b/gi },
  { id: 'win-rate', re: /\bwin[\s-]?rates?\b/gi },
  { id: 'guaranteed', re: /\bguaranteed\b/gi },
  { id: 'confluence', re: /\bconfluence\b/gi },
  { id: 'rank', re: /\brank(?:ed|ing|s)?\b/gi },
  { id: 'aligned', re: /\baligned\b/gi },
  { id: 'favorable', re: /\b(?:un)?favorable\b/gi },
  { id: 'conviction', re: /\bconvictions?\b/gi },
  { id: 'scoring', re: /\bscor(?:ing|ed)\b/gi },
  { id: 'graded', re: /\bgraded\b/gi },
  { id: 'probability-of-profit', re: /\bprobability of profit\b/gi },
  { id: 'expected-r', re: /\bexpected\s+r\b/gi },
];

/** Path prefixes and files left out of the failing scan, with reasons. */
export const SCAN_EXCLUSIONS: { test: (file: string) => boolean; reason: string }[] = [
  { test: (file) => file.startsWith('app/admin/') || file.includes('/admin/') || file.startsWith('app/operator/'), reason: 'Admin pages and admin-only components are out of scope.' },
  { test: (file) => file.startsWith('app/api/') && !file.startsWith('app/api/alerts/'), reason: 'API handlers are not customer-rendered, except alert emails.' },
  { test: (file) => file === 'lib/alerts/email.ts' || file === 'lib/alerts/discord.ts', reason: 'Admin research-alert payloads are not customer email. Customer alert text is scanned in app/api/alerts and lib/email.ts.' },
  { test: (file) => file.startsWith('lib/') && !isCustomerLib(file), reason: 'Engine, database, and worker modules are not customer-rendered.' },
];

/** Lib modules whose string constants are shown to customers. */
export function isCustomerLib(file: string): boolean {
  if (file.includes('/admin/')) return false;
  return file.startsWith('lib/guides/')
    || file.startsWith('lib/presentation/')
    || file.startsWith('lib/alerts/')
    || file.startsWith('lib/goldenEgg/')
    || /(?:^|\/)[^/]*Presentation\.tsx?$/.test(file)
    || file === 'lib/scoring/canonical/display.ts'
    || file === 'lib/scanner/rankExplanation.ts'
    || file === 'lib/toolWorkflows.ts'
    || file === 'lib/toolCatalog.ts'
    || file === 'lib/email.ts';
}

/**
 * Legitimate customer text that must keep a banned word.
 * Keep this list small. Each phrase is the exact span that may contain the word.
 */
export const PHRASE_ALLOWLIST: { file: string; phrase: string; reason: string }[] = [
  {
    file: 'app/tools/workspace/LearningTab.tsx',
    phrase: 'Win rate · your own trades',
    reason: 'The user\'s own journal statistic, labelled as their own trades.',
  },
  {
    file: 'app/tools/workspace/LearningTab.tsx',
    phrase: 'Recorded win rate by framework · your own trades',
    reason: 'The user\'s own journal statistic, labelled as their own trades.',
  },
  {
    file: 'components/intelligence/EdgeInsightCards.tsx',
    phrase: 'Win rate · your own trades',
    reason: 'The user\'s own journal statistic, labelled as their own trades.',
  },
  {
    file: 'components/journal/layer1/JournalKpiRow.tsx',
    phrase: 'Win rate · your own trades',
    reason: 'The user\'s own journal statistic, labelled as their own trades.',
  },
  {
    file: 'components/journal/JournalPage.tsx',
    phrase: 'win rate · your own trades',
    reason: 'The user\'s own journal statistic, labelled as their own trades.',
  },
  {
    file: 'components/journal/layer3/modules/ReviewModule.tsx',
    phrase: 'Win rate · your own trades',
    reason: 'The user\'s own journal statistic, labelled as their own trades.',
  },
  {
    file: 'app/tools/portfolio/page.tsx',
    phrase: 'Win rate · your own trades',
    reason: 'The user\'s own recorded simulation trades, labelled as their own.',
  },
  {
    file: 'app/tools/workspace/PortfolioV2.tsx',
    phrase: 'Win rate · your own trades',
    reason: 'The user\'s own recorded trades, labelled as their own.',
  },
  {
    file: 'app/cookie-policy/page.tsx',
    phrase: 'We currently do not respond to "Do Not Track" browser signals',
    reason: 'Legal description of the Do Not Track browser feature, not a market signal.',
  },
  // Temporary. Remove this entry after #578 merges the Hero wording change.
  {
    file: 'components/home/Hero.tsx',
    phrase: 'a clear Symbol verdict with reasons, and data you can check.',
    reason: 'Temporary. Hero.tsx is owned by PR #578. Remove this entry after #578 merges.',
  },
];

const COPY_KEYS = new Set([
  'label', 'title', 'summary', 'tooltip', 'placeholder', 'alt', 'footer', 'heading',
  'subtitle', 'question', 'caption', 'eyebrow', 'note', 'message', 'description',
  'subject', 'text', 'html', 'excerpt', 'content', 'preheader', 'aria-label',
  'aria-description', 'aria-roledescription', 'aria-placeholder', 'aria-valuetext',
  'ariaLabel', 'ariaDescription',
]);

const SKIP_ATTRS = new Set([
  'className', 'class', 'style', 'href', 'src', 'id', 'key', 'htmlFor', 'role',
  'type', 'name', 'method', 'action', 'target', 'rel', 'xmlns', 'd', 'viewBox',
  'fill', 'stroke', 'width', 'height', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2',
  'y1', 'y2', 'points', 'transform', 'preserveAspectRatio', 'crossOrigin',
  'as', 'sizes', 'media', 'integrity', 'nonce', 'fetchPriority', 'decoding',
  'loading', 'referrerPolicy', 'sandbox', 'allow', 'srcSet', 'srcset',
]);

export type CopyHit = { file: string; line: number; kind: string; word: string; text: string };

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'admin') continue;
      walkFiles(full, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function propName(name: ts.PropertyName | ts.JsxAttributeName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return '';
}

const SKIP_VALUE_KEYS = new Set(['key', 'id', 'href', 'src', 'route', 'type', 'name', 'field', 'code', 'path', 'icon']);

function isCodeToken(text: string): boolean {
  return /^[a-z0-9]+(?:[_./:-][a-z0-9]+)+$/i.test(text)
    || /^[A-Z][A-Z0-9_]*$/.test(text)
    || text.startsWith('/')
    || text.startsWith('http://')
    || text.startsWith('https://')
    || text.includes('?')
    || text.includes('://');
}

function pushText(hits: { file: string; line: number; kind: string; text: string }[], file: string, node: ts.Node, text: string, kind: string) {
  const raw = text.replace(/\s+/g, ' ').trim();
  if (raw.length < 2 || isCodeToken(raw)) return;
  const sf = node.getSourceFile();
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  hits.push({ file, line: pos.line + 1, kind, text: raw });
}

function stringsIn(node: ts.Node | undefined, file: string, kind: string, hits: { file: string; line: number; kind: string; text: string }[], depth = 0) {
  if (!node || depth > 12) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    pushText(hits, file, node, node.text, kind);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    pushText(hits, file, node.head, node.head.text, kind);
    for (const span of node.templateSpans) pushText(hits, file, span.literal, span.literal.text, kind);
    for (const span of node.templateSpans) stringsIn(span.expression, file, kind, hits, depth + 1);
    return;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    stringsIn(node.expression, file, kind, hits, depth + 1);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    stringsIn(node.whenTrue, file, kind, hits, depth + 1);
    stringsIn(node.whenFalse, file, kind, hits, depth + 1);
    return;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    stringsIn(node.left, file, kind, hits, depth + 1);
    stringsIn(node.right, file, kind, hits, depth + 1);
    return;
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    for (const arg of node.arguments ?? []) stringsIn(arg, file, kind, hits, depth + 1);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) stringsIn(el, file, kind, hits, depth + 1);
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = propName(prop.name);
      if (!SKIP_VALUE_KEYS.has(name) && (kind === 'const' || kind === 'return' || kind.startsWith('prop:') || COPY_KEYS.has(name))) {
        stringsIn(prop.initializer, file, `prop:${name}`, hits, depth + 1);
      }
    }
  }
}

function visit(sf: ts.SourceFile, file: string, bag: { file: string; line: number; kind: string; text: string }[]) {
  function rec(node: ts.Node) {
    if (ts.isJsxText(node)) pushText(bag, file, node, node.text, 'jsx-text');
    if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent) || ts.isJsxAttribute(node.parent))) {
      const attr = ts.isJsxAttribute(node.parent) ? propName(node.parent.name) : '';
      if (!attr || COPY_KEYS.has(attr) || attr.startsWith('aria-')) stringsIn(node.expression, file, attr ? `attr:${attr}` : 'jsx-expr', bag);
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = propName(node.name);
      if ((COPY_KEYS.has(name) || name.startsWith('aria-')) && !SKIP_ATTRS.has(name)) {
        pushText(bag, file, node.initializer, node.initializer.text, `attr:${name}`);
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name);
      if (!SKIP_VALUE_KEYS.has(name) && (COPY_KEYS.has(name) || ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isTemplateExpression(node.initializer))) {
        stringsIn(node.initializer, file, `prop:${name || 'value'}`, bag);
      }
    }
    if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && node.initializer) {
      stringsIn(node.initializer, file, 'const', bag);
    }
    if (ts.isReturnStatement(node) && node.expression) stringsIn(node.expression, file, 'return', bag);
    if (ts.isArrayLiteralExpression(node) && node.elements.length >= 2 && node.elements.length <= 4 && ts.isStringLiteral(node.elements[0]) && ts.isArrayLiteralExpression(node.parent)) {
      pushText(bag, file, node.elements[0], node.elements[0].text, 'tuple-label');
    }
    ts.forEachChild(node, rec);
  }
  rec(sf);
}

export function isExcluded(file: string): boolean {
  return SCAN_EXCLUSIONS.some((entry) => entry.test(file));
}

function allowed(file: string, text: string, index: number, length: number): boolean {
  if (PHRASE_ALLOWLIST.some((entry) => {
    if (entry.file !== file) return false;
    const at = text.indexOf(entry.phrase);
    return at >= 0 && index >= at && index + length <= at + entry.phrase.length;
  })) return true;
  const before = text.slice(Math.max(0, index - 48), index);
  return /\b(?:not|no|never|without|isn['’]t|aren['’]t|don['’]t|doesn['’]t|cannot|can['’]t|non-)\b(?:\s+\w+){0,4}\s*$/i.test(before);
}

export function scanCustomerCopy(root = process.cwd(), options?: { includeExcluded?: boolean }): CopyHit[] {
  const files = [
    ...walkFiles(join(root, 'app')),
    ...walkFiles(join(root, 'components')),
    ...walkFiles(join(root, 'lib')),
  ];
  const hits: CopyHit[] = [];
  const seen = new Set<string>();
  for (const full of files) {
    const file = relative(root, full).replaceAll('\\', '/');
    if (!options?.includeExcluded && isExcluded(file)) continue;
    const source = readFileSync(full, 'utf8');
    const sf = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, full.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const bag: { file: string; line: number; kind: string; text: string }[] = [];
    visit(sf, file, bag);
    for (const item of bag) {
      for (const pattern of BANNED_PATTERNS) {
        pattern.re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.re.exec(item.text)) !== null) {
          if (!allowed(file, item.text, match.index, match[0].length)) {
            const key = `${file}:${item.line}:${pattern.id}:${item.text}`;
            if (!seen.has(key)) {
              seen.add(key);
              hits.push({ ...item, word: pattern.id });
            }
          }
          if (match[0].length === 0) break;
        }
      }
    }
  }
  return hits;
}

const HOMEPAGE_FILES = new Set([
  'app/page.tsx',
  'components/public-design/ResearchHome.tsx',
]);

/** Homepage surfaces excluded from the failing scan, reported for the other PR. */
export function scanHomepageHits(root = process.cwd()): CopyHit[] {
  return scanCustomerCopy(root, { includeExcluded: true }).filter((hit) => HOMEPAGE_FILES.has(hit.file) || hit.file.startsWith('components/home/'));
}
