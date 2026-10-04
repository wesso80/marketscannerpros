'use client';

import { useEffect } from 'react';

const SECTIONS = ['platform-guide', 'research-guides'];

/** Opens and scrolls to a guide block named by ?section= or #hash. */
export default function GuideSectionTarget() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('section') || '';
    const hash = window.location.hash.replace(/^#/, '');
    const id = SECTIONS.includes(query) ? query : hash;
    if (!SECTIONS.includes(id)) return;
    const root = document.getElementById(id);
    const details = root?.querySelector('details');
    if (details instanceof HTMLDetailsElement) details.open = true;
    root?.scrollIntoView({ block: 'start' });
  }, []);
  return null;
}
