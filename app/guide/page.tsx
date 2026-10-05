import ToolGuideSearch from '@/components/guide/ToolGuideSearch';
import PlatformGuide from '@/components/guide/PlatformGuide';
import GuideSectionTarget from '@/components/guide/GuideSectionTarget';
import TradingGuides from '@/components/guide/TradingGuides';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import { TOOL_GUIDES } from '@/lib/guides/toolGuides';

export default async function UserGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.section) ? params.section[0] : params.section;
  const section = requested === 'platform-guide' || requested === 'research-guides' ? requested : '';
  return (
    <div className="min-h-screen bg-msp-bg text-msp-text">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="mb-4 rounded-panel border border-msp-border bg-msp-card p-4 shadow-msp">
          <h1 className="text-3xl font-extrabold tracking-tight">Guide</h1>
          <p data-learn-verdict className="mt-2 text-sm text-msp-text-muted">
            Search the guides or choose a menu group. Open a tool for its instructions and tips.
          </p>
        </div>

        <GuideSectionTarget />
        <div id="platform-guide" className="mb-3 scroll-mt-20"><CollapsibleSection title="Platform walkthrough" open={section === 'platform-guide'}><PlatformGuide /></CollapsibleSection></div>
        <div id="research-guides" className="mb-3 scroll-mt-20"><CollapsibleSection title="Research guides" open={section === 'research-guides'}><TradingGuides /></CollapsibleSection></div>
        <ToolGuideSearch guides={TOOL_GUIDES} />
        <p data-source-line className="mt-4 text-xs text-msp-text-muted">Source · MarketScanner Pros documentation</p>
      </div>
    </div>
  );
}
