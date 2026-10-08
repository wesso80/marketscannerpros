'use client';
import { useState } from 'react';
import studio from '@/components/public-design/FindSymbolsStudio.module.css';
import TabBar from '@/components/visual/TabBar';
import FreeScanner from '@/components/free/FreeScanner';
import LockedPreview from '@/components/free/LockedPreview';
import PresetCards from './PresetCards';

/** Free Scanner: Quick scan keeps the demo counter. Pro is a teaser, not the controls. */
export default function FreeScannerModes() {
  const [tab, setTab] = useState('quick');
  return (
    <div data-scanner-modes className={studio.page}>
      <header className={studio.hero}><div><p className={studio.kicker}>SYMBOL RESEARCH / DISCOVERY</p><h1>Find symbols</h1><p className={studio.lead}>Explore a reading.<br/>Understand its limits.</p></div><p className={studio.introduction}>Try a sample observation, then open a Symbol report. Sources and dates stay visible; your available allowance is shown before you run a scan.</p></header>
      <PresetCards onSelect={() => setTab('pro')} />
      <TabBar
        label="Scanner mode"
        activeId={tab}
        onChange={setTab}
        items={[
          { id: 'quick', label: 'Quick scan', content: <FreeScanner /> },
          {
            id: 'pro',
            label: 'Pro scanner',
            content: (
              <div data-pro-teaser>
                <LockedPreview tool="Pro scanner" description="Presets and manual filters for a research scan across the universe. The controls are part of Pro." />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
