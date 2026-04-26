import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const root = process.cwd();
const apiRoot = join(root, 'app', 'api');
const tenantTables = [
  'portfolio_positions',
  'portfolio_closed',
  'portfolio_performance',
  'journal_entries',
  'watchlists',
  'watchlist_items',
  'user_settings',
  'favorites',
];

const globalRouteAllowlist = [
  '/app/api/admin/',
  '/app/api/cron/',
  '/app/api/jobs/',
  '/app/api/ai-scanner/',
];

type Finding = {
  file: string;
  table: string;
  line: number;
  snippet: string;
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) return walk(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

function lineFor(content: string, index: number) {
  return content.slice(0, index).split('\n').length;
}

function hasWorkspaceFilter(query: string) {
  return /workspace_id\s*=|workspaceId|getSessionFromCookie\(|session\?\.workspaceId|session\.workspaceId|tenant-audit:\s*allow-global-migration/i.test(query);
}

function shouldSkipFile(file: string) {
  const normalized = file.replaceAll('\\', '/');
  return globalRouteAllowlist.some((part) => normalized.includes(part));
}

const findings: Finding[] = [];

for (const file of walk(apiRoot)) {
  if (shouldSkipFile(file)) continue;
  const content = readFileSync(file, 'utf8');
  for (const table of tenantTables) {
    const tableClause = new RegExp(`\\b(?:FROM|JOIN|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = tableClause.exec(content))) {
      const index = match.index;
      const start = Math.max(0, index - 600);
      const end = Math.min(content.length, index + 1_600);
      const snippet = content.slice(start, end);
      if (!hasWorkspaceFilter(snippet)) {
        findings.push({
          file: relative(root, file),
          table,
          line: lineFor(content, index),
          snippet: snippet.replace(/\s+/g, ' ').slice(0, 240),
        });
      }
    }
  }
}

if (findings.length === 0) {
  console.log('Tenant isolation audit passed: no obvious unscoped tenant-table API queries found.');
  process.exit(0);
}

console.warn(`Tenant isolation audit found ${findings.length} potential issue(s):`);
for (const finding of findings) {
  console.warn(`- ${finding.file}:${finding.line} table=${finding.table}`);
  console.warn(`  ${finding.snippet}`);
}

process.exit(1);
