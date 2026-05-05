/**
 * test/brain/publicLeakage.test.ts
 *
 * CI guard: scan every public API route under app/api (excluding admin
 * surfaces and brain/admin internals) for references to admin-only fields
 * that must NEVER be returned in a response shape.
 *
 * Runs as a static-text test — no DB, no network. Fails the build the
 * moment a regression introduces an admin field on a public route.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const PUBLIC_API_ROOT = join(ROOT, 'app', 'api');

// Folders that are admin / internal and exempt from the leakage check.
const ADMIN_PATH_FRAGMENTS = [
  `${sep}admin${sep}`,
  `${sep}cron${sep}`,
  `${sep}internal${sep}`,
  `${sep}msp-analyst${sep}`, // ai-only admin assistant
];

// Tokens that must never appear in a public response body. We grep for
// patterns that strongly suggest the field is being SET on a response
// (e.g. "score_snapshot:" inside a NextResponse.json({...})).
//
// We allow the same tokens to appear in *imports*, *type names*, and
// *comments* — only object-key usages trip the guard.
const FORBIDDEN_RESPONSE_KEYS = [
  'score_snapshot',
  'scoreSnapshot',
  'rawScore',
  'admin_only',
  'adminOnly',
  'prompt_version',
  'promptVersion',
  'input_snapshot_hash',
  'inputSnapshotHash',
  'rules_hash',
  'rulesHash',
];

function* walk(dir: string): IterableIterator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (s.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      yield full;
    }
  }
}

function isAdminPath(filePath: string): boolean {
  return ADMIN_PATH_FRAGMENTS.some((frag) => filePath.includes(frag));
}

/**
 * True when the line is a comment, an import, a type/interface declaration,
 * or a SELECT clause inside a SQL string. Those are not response leakages.
 */
function isLineExempt(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*')) return true;
  if (trimmed.startsWith('/*')) return true;
  if (/^\s*import\b/.test(line)) return true;
  if (/^\s*(export\s+)?(interface|type)\b/.test(line)) return true;
  // SELECT col FROM brain_events ... — admin tables only ever queried inside admin routes
  if (/\bSELECT\b/i.test(line) || /\bFROM\b/i.test(line)) return true;
  return false;
}

/**
 * Extract every substring that lives inside a `NextResponse.json(...)`
 * call (or `Response.json(...)`). We track paren depth so nested objects
 * don't trip us up. Returns an array of `{ start, end, text }` slices,
 * each with the byte offset in the source so we can map back to a line.
 */
function extractResponseBodies(src: string): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  const re = /\b(?:NextResponse|Response)\s*\.\s*json\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1; // position of '('
    let depth = 1;
    let i = open + 1;
    let inStr: string | null = null;
    let esc = false;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === '\\') {
          esc = true;
        } else if (ch === inStr) {
          inStr = null;
        }
      } else {
        if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      i++;
    }
    out.push({ start: open + 1, end: i - 1, text: src.slice(open + 1, i - 1) });
  }
  return out;
}

function offsetToLine(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') line++;
  }
  return line;
}

describe('public-leakage CI guard', () => {
  const publicFiles: string[] = [];
  for (const f of walk(PUBLIC_API_ROOT)) {
    if (!isAdminPath(f)) publicFiles.push(f);
  }

  it('finds public API route files to scan', () => {
    expect(publicFiles.length).toBeGreaterThan(0);
  });

  for (const key of FORBIDDEN_RESPONSE_KEYS) {
    it(`no public API route exposes "${key}" inside NextResponse.json(...)`, () => {
      const offenders: Array<{ file: string; line: number; text: string }> = [];
      const re = new RegExp(`\\b${key}\\s*:`);
      for (const file of publicFiles) {
        let body: string;
        try {
          body = readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        const bodies = extractResponseBodies(body);
        for (const b of bodies) {
          // Search the slice line-by-line so we can show context, but skip
          // exempt lines (comments / type names that happen to be embedded).
          const sliceLines = b.text.split(/\r?\n/);
          let cursor = b.start;
          for (let i = 0; i < sliceLines.length; i++) {
            const line = sliceLines[i];
            if (!isLineExempt(line) && re.test(line)) {
              offenders.push({
                file: relative(ROOT, file),
                line: offsetToLine(body, cursor),
                text: line.trim(),
              });
            }
            cursor += line.length + 1;
          }
        }
      }
      if (offenders.length > 0) {
        const summary = offenders
          .slice(0, 10)
          .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
          .join('\n');
        throw new Error(
          `Public API leakage: "${key}" appears inside a NextResponse.json(...) body in ${offenders.length} location(s):\n${summary}`,
        );
      }
      expect(offenders.length).toBe(0);
    });
  }

  it('no public route imports recordBrainEvent directly (must go through engineBridge)', () => {
    const offenders: string[] = [];
    for (const file of publicFiles) {
      const body = readFileSync(file, 'utf8');
      // engineBridge re-exports recordBrainEvent transitively — the import we
      // forbid is the direct one from eventRecorder, which would bypass the
      // adminOnly default + snapshot hashing.
      if (/from\s+['"]@\/lib\/brain\/eventRecorder['"]/.test(body)) {
        offenders.push(relative(ROOT, file));
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `Public API routes must not import lib/brain/eventRecorder directly. Use lib/brain/engineBridge. Offenders:\n  ${offenders.join('\n  ')}`,
      );
    }
    expect(offenders.length).toBe(0);
  });
});
