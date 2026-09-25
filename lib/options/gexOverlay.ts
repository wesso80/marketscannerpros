/** Intraday Charts GEX overlay: maps /api/options/gex to what the chart shows. */

export interface DealerStructure {
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  topNodes: Array<{ strike: number; netGexUsd: number }>;
}

export interface DealerOverlayData {
  regime: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
  structure: DealerStructure;
  attentionTriggered: boolean;
  /** Always true today: open-interest estimate under the standard convention, not verified dealer positions. */
  estimate: boolean;
  expirationDate: string | null;
  asOf: string | null;
}

/**
 * /api/options/gex → overlay. Only a computed estimate (available + dealerGamma present) is shown;
 * anything else is "unavailable" — never a default NEUTRAL regime.
 */
export function dealerOverlayFromGexPayload(payload: any): DealerOverlayData | null {
  const data = payload?.success ? payload.data : null;
  const regime = data?.dealerGamma?.regime;
  if (!data?.available || !data?.estimate || !['LONG_GAMMA', 'SHORT_GAMMA', 'NEUTRAL'].includes(regime)) return null;
  const structure = data.dealerIntelligence?.dealerStructure;
  return {
    regime,
    structure: {
      callWall: Number.isFinite(structure?.callWall) ? structure.callWall : null,
      putWall: Number.isFinite(structure?.putWall) ? structure.putWall : null,
      gammaFlip: Number.isFinite(structure?.gammaFlip) ? structure.gammaFlip : null,
      topNodes: Array.isArray(structure?.topNodes) ? structure.topNodes : [],
    },
    attentionTriggered: Boolean(data.dealerIntelligence?.attention?.triggered),
    estimate: true,
    expirationDate: data.expirationDate ?? null,
    asOf: data.asOf ?? null,
  };
}

