import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = process.cwd();
const roots = ['app', 'components', 'hooks', 'lib', 'src'];
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

function filesIn(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) filesIn(file, out);
    else if (extensions.includes(path.extname(name))) out.push(file);
  }
  return out;
}

function resolveImport(spec: string, fromFile: string): string | null {
  const target = spec.startsWith('@/')
    ? path.join(root, spec.slice(2))
    : spec.startsWith('.')
      ? path.resolve(path.dirname(fromFile), spec)
      : null;
  if (!target) return null;
  const candidates = [
    target,
    ...extensions.map((ext) => target + ext),
    ...extensions.map((ext) => path.join(target, `index${ext}`)),
  ];
  return candidates.find((candidate) => {
    try { return statSync(candidate).isFile(); } catch { return false; }
  }) ?? null;
}

function valueImports(source: string): string[] {
  const specs: string[] = [];
  const statement = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\sfrom\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(statement)) {
    const clause = match[1].trim();
    if (/^type\b/.test(clause)) continue;
    const brace = clause.match(/\{([^}]*)\}/);
    const before = (brace ? clause.slice(0, clause.indexOf('{')) : clause).trim();
    const named = brace?.[1].split(',').map((part) => part.trim()).filter(Boolean) ?? [];
    const hasValueName = named.some((part) => !part.startsWith('type '));
    if (before || hasValueName || !brace) specs.push(match[2]);
  }
  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(match[1]);
  return specs;
}

function isClientModule(source: string): boolean {
  return /^['"]use client['"]/.test(source.replace(/\/\*[\s\S]*?\*\//, '').trimStart());
}

function serverOnly(file: string, source: string): boolean {
  const rel = path.relative(root, file);
  return rel === 'lib/auth.ts' || rel === 'lib/adminAuth.ts' || /from\s+['"]next\/headers['"]/.test(source);
}

it('keeps the guide page on the server so session reads stay out of the client bundle', () => {
  const page = readFileSync('app/guide/page.tsx', 'utf8');
  expect(isClientModule(page)).toBe(false);
  expect(page).toContain('PlatformGuide');
  expect(page).toContain("section === 'platform-guide'");
  expect(page).toContain("section === 'research-guides'");
  expect(readFileSync('components/guide/PlatformGuide.tsx', 'utf8')).toContain('getSessionFromCookie');
  expect(isClientModule(readFileSync('components/guide/GuideSectionTarget.tsx', 'utf8'))).toBe(true);
});

it('no client module reaches next/headers or lib/auth', () => {
  const sources = new Map<string, string>();
  const read = (file: string) => {
    const cached = sources.get(file);
    if (cached !== undefined) return cached;
    const source = readFileSync(file, 'utf8');
    sources.set(file, source);
    return source;
  };
  const hits: string[] = [];
  for (const start of roots.flatMap((dir) => filesIn(path.join(root, dir)))) {
    if (!isClientModule(read(start))) continue;
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = read(file);
      if (file !== start && serverOnly(file, source)) {
        hits.push(`${path.relative(root, start)} -> ${path.relative(root, file)}`);
        continue;
      }
      for (const spec of valueImports(source)) {
        const next = resolveImport(spec, file);
        if (next) stack.push(next);
      }
    }
  }
  expect(hits).toEqual([]);
});
