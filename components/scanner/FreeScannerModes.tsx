'use client';
import { useState } from 'react';
import TabBar from '@/components/visual/TabBar';
import FreeScanner from '@/components/free/FreeScanner';
import LockedPreview from '@/components/free/LockedPreview';
import PresetCards from './PresetCards';

/** Free Scanner: Quick scan keeps the demo counter. Pro is a teaser, not the controls. */
export default function FreeScannerModes() {
  const [tab, setTab] = useState('quick');
  return (
    <div data-scanner-modes className="mx-auto max-w-4xl space-y-4 p-4">
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
