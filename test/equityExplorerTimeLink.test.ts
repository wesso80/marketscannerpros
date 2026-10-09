import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('names the Equity Explorer action for Time Confluence, which is where the link goes', () => {
  const page = readFileSync('app/tools/equity-explorer/page.tsx', 'utf8');
  const link = page.match(/<Link\s+href=\{`([^`]+)`\}[\s\S]*?<\/Link>/);
  expect(link, 'action link').not.toBeNull();
  expect(link![0]).toContain('Open Close timing');
  expect(link![0]).not.toContain('Open Scanner');
  expect(link![1]).toContain('/tools/terminal?tab=time-confluence&symbol=');
  expect(link![1]).toContain('eligibility=');
  expect(link![1]).toContain('crcs=');
  // Scanner reads `type` only. A symbol query would not prefill, so the link stays on Time Confluence.
  const scanner = readFileSync('app/tools/scanner/page.tsx', 'utf8');
  expect(scanner).toContain("searchParams.get('type')");
  expect(scanner).not.toContain("searchParams.get('symbol')");
});
