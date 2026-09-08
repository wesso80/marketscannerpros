import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Launch plan §4 — /api/intelligence/status now returns the launch state map.
// Only the three approved modules (Global M2, Fragility, Liquidity) are LIVE;
// everything else is UNDER_CONSTRUCTION. No mock scores are returned.
export interface IntelligenceModuleStatus {
  key: 'global-m2' | 'fragility' | 'liquidity' | 'lead-lag' | 'nq-pressure' | 'auction' | 'master';
  label: string;
  href: string;
  status: 'LIVE' | 'LIVE_PARTIAL' | 'UNDER_CONSTRUCTION';
  available: boolean;
}

const MODULES: IntelligenceModuleStatus[] = [
  { key: 'global-m2',  label: 'Global M2',              href: '/intelligence/global-m2', status: 'LIVE_PARTIAL',        available: true  },
  { key: 'fragility',  label: 'Market Fragility',       href: '/intelligence/fragility', status: 'LIVE',                available: true  },
  { key: 'liquidity',  label: 'Liquidity Transmission', href: '/intelligence/liquidity', status: 'LIVE_PARTIAL',        available: true  },
  { key: 'lead-lag',   label: 'Cross-Asset Lead/Lag',   href: '/intelligence/lead-lag',   status: 'UNDER_CONSTRUCTION', available: false },
  { key: 'nq-pressure',label: 'NQ Institutional Pressure', href: '/intelligence/nq-pressure', status: 'UNDER_CONSTRUCTION', available: false },
  { key: 'auction',    label: 'NQ Auction',             href: '/intelligence/auction',   status: 'UNDER_CONSTRUCTION',  available: false },
  { key: 'master',     label: 'Master Command Centre',  href: '/intelligence/master',    status: 'UNDER_CONSTRUCTION',  available: false },
];

export async function GET() {
  return NextResponse.json({
    data: MODULES,
    liveCount: MODULES.filter((m) => m.available).length,
    underConstructionCount: MODULES.filter((m) => !m.available).length,
  });
}
