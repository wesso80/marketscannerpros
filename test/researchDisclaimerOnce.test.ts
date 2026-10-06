import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps a single disclaimer on News Intelligence inside Research', () => {
  const research = readFileSync('app/tools/research/page.tsx', 'utf8');
  const compact = readFileSync('components/research/NewsIntelligenceCompact.tsx', 'utf8');
  const layout = readFileSync('app/tools/ToolsLayoutClient.tsx', 'utf8');
  expect(layout).toContain("'/tools/research'");
  expect(layout).toContain('<ComplianceDisclaimer collapsible />');
  expect(research).toContain("{tab !== 'News Intelligence' && <ComplianceDisclaimer compact />}");
  expect(compact).not.toContain('ComplianceDisclaimer');
  expect(readFileSync('app/tools/news/page.tsx', 'utf8').match(/<ComplianceDisclaimer compact \/>/g)?.length).toBe(2);
});
