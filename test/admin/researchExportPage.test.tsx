/**
 * Research Export page: reads only the research-key allowlist with GET using the admin's own session, and is linked
 * from the admin navigation. It must never send a write.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/admin/shared/SectionTitle', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('@/components/admin/shared/AdminCard', () => ({ default: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h3>{title}</h3>{children}</section> }));

import ResearchExportPage from '@/app/admin/research-export/page';
import { RESEARCH_READ_PATHS } from '@/lib/admin/researchReadKey';

const src = readFileSync('app/admin/research-export/page.tsx', 'utf8');

describe('Research Export page', () => {
  it('renders the download button, endpoint count and private-data warning', () => {
    const html = renderToStaticMarkup(<ResearchExportPage />);
    expect(html).toContain('Download research export');
    expect(html).toContain(`Reads ${RESEARCH_READ_PATHS.size} admin data endpoints`);
    expect(html).toContain('private admin data');
  });

  it('only issues GET requests to the allowlist and Symbol pages', () => {
    expect(src).toContain('RESEARCH_READ_PATHS');
    expect(src).toContain('method: "GET"');
    expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(src).toMatch(/\/api\/admin\/symbol\/\$\{encodeURIComponent/);
    expect(src).toContain('MAX_SYMBOLS = 5');
  });

  it('is linked from the admin navigation', () => {
    expect(readFileSync('app/admin/admin-client-layout.tsx', 'utf8')).toContain('{ href: "/admin/research-export", label: "Research Export"');
  });
});
