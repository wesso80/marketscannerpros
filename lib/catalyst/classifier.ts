/**
 * Catalyst Classifier
 *
 * Deterministic rule-based classification of SEC filings and news items
 * into CatalystSubtype with confidence and reason.
 *
 * Every classification must produce:
 *  - subtype (CatalystSubtype enum)
 *  - confidence (0–1)
 *  - reason (human-readable, auditable)
 *  - severity (LOW/MED/HIGH)
 */

import {
  CatalystSubtype,
  Severity,
  type EdgarFiling,
  type NewsItem,
} from './types';

export interface ClassificationResult {
  subtype: CatalystSubtype;
  confidence: number;
  reason: string;
  severity: Severity;
}

// ─── SEC Filing Classification ──────────────────────────────────────

/**
 * 8-K Item code → subtype mapping.
 * SEC 8-K items: https://www.sec.gov/fast-answers/answersform8khtm.html
 */
const ITEM_MAP: Record<string, { subtype: CatalystSubtype; severity: Severity; desc: string }> = {
  '1.01': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.HIGH, desc: 'Entry into Material Definitive Agreement' },
  '1.02': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.HIGH, desc: 'Termination of Material Definitive Agreement' },
  '1.03': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.MED,  desc: 'Bankruptcy or Receivership' },
  '2.01': { subtype: CatalystSubtype.MNA_DEFINITIVE, severity: Severity.HIGH, desc: 'Completion of Acquisition or Disposition' },
  '2.04': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.MED,  desc: 'Triggering Events Involving Credit Enhancement' },
  '2.05': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.MED,  desc: 'Costs from Exit Activities' },
  '2.06': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.MED,  desc: 'Material Impairments' },
  '5.01': { subtype: CatalystSubtype.LEADERSHIP_CHANGE,         severity: Severity.MED,  desc: 'Changes in Control of Registrant' },
  '5.02': { subtype: CatalystSubtype.SEC_8K_LEADERSHIP,         severity: Severity.HIGH, desc: 'Departure/Appointment of Directors or Officers' },
  '5.03': { subtype: CatalystSubtype.DIVIDEND_CHANGE,           severity: Severity.MED,  desc: 'Amendments to Articles of Incorporation or Bylaws' },
  '8.01': { subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT, severity: Severity.MED,  desc: 'Other Events' },
};

/**
 * Classify a SEC filing into a CatalystSubtype.
 * Returns null if the filing doesn't map to a known catalyst.
 */
export function classifyFiling(filing: EdgarFiling): ClassificationResult | null {
  const formUpper = filing.formType.toUpperCase().trim();

  // ── 13D / SC 13D filings → activist stake ───────────────────────
  if (formUpper.includes('13D')) {
    return {
      subtype: CatalystSubtype.SEC_13D_STAKE,
      confidence: 0.90,
      reason: `${filing.formType} filed by ${filing.companyName}. 13D indicates >5% beneficial ownership stake.`,
      severity: Severity.HIGH,
    };
  }

  // ── 10-K / 10-Q → periodic filing (lower immediate impact) ─────
  if (formUpper === '10-K' || formUpper === '10-Q') {
    return {
      subtype: CatalystSubtype.SEC_10K_10Q,
      confidence: 0.95,
      reason: `${filing.formType} periodic filing by ${filing.companyName}.`,
      severity: Severity.LOW,
    };
  }

  // ── 8-K: classify by item codes ─────────────────────────────────
  if (formUpper.startsWith('8-K')) {
    if (filing.items.length === 0) {
      return {
        subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT,
        confidence: 0.40,
        reason: `8-K filed by ${filing.companyName} but no item codes parsed. Low-confidence generic classification.`,
        severity: Severity.LOW,
      };
    }

    // Pick highest-severity item
    let best: ClassificationResult | null = null;
    const severityRank: Record<string, number> = { HIGH: 3, MED: 2, LOW: 1 };

    for (const item of filing.items) {
      const mapped = ITEM_MAP[item];
      if (!mapped) continue;

      const candidate: ClassificationResult = {
        subtype: mapped.subtype,
        confidence: 0.85,
        reason: `8-K Item ${item}: ${mapped.desc} — ${filing.companyName}`,
        severity: mapped.severity,
      };

      if (!best || severityRank[candidate.severity] > severityRank[best.severity]) {
        best = candidate;
      }
    }

    if (best) return best;

    // Items present but none mapped
    return {
      subtype: CatalystSubtype.SEC_8K_MATERIAL_AGREEMENT,
      confidence: 0.30,
      reason: `8-K filed by ${filing.companyName} with items [${filing.items.join(', ')}] — no high-impact items recognized.`,
      severity: Severity.LOW,
    };
  }

  return null;
}

// ─── News Classification ────────────────────────────────────────────

/**
 * Keyword-based news headline classifier.
 * Order matters — first match wins (most specific first).
 */
const NEWS_RULES: { pattern: RegExp; subtype: CatalystSubtype; severity: Severity; tag: string }[] = [
  // M&A
  { pattern: /\b(definitive.?agreement|merger.?agreement|acquir(e|es|ed|ing)|buyout)\b/i,
    subtype: CatalystSubtype.MNA_DEFINITIVE, severity: Severity.HIGH, tag: 'M&A Definitive' },
  { pattern: /\bletter.?of.?intent|LOI\b/i,
    subtype: CatalystSubtype.MNA_LOI, severity: Severity.HIGH, tag: 'M&A LOI' },
  { pattern: /\b(takeover.?rumor\w*|merger.?talk\w*|merger.?rumor\w*|acquisition.?rumor\w*|deal.?speculation)\b/i,
    subtype: CatalystSubtype.MNA_RUMOR, severity: Severity.MED, tag: 'M&A Rumor' },
  // Offerings
  { pattern: /\b(secondary.?offering|follow.?on.?offering|stock.?offering|equity.?offering|share.?sale)\b/i,
    subtype: CatalystSubtype.SECONDARY_OFFERING, severity: Severity.HIGH, tag: 'Secondary Offering' },
  // Buyback
  { pattern: /\b(buyback|share.?repurchase|stock.?repurchase)\b/i,
    subtype: CatalystSubtype.BUYBACK_AUTH, severity: Severity.MED, tag: 'Buyback Authorization' },
  // Dividend
  { pattern: /\b(dividend.?cut|dividend.?increase|special.?dividend|dividend.?suspend|dividend.?hike)\b/i,
    subtype: CatalystSubtype.DIVIDEND_CHANGE, severity: Severity.MED, tag: 'Dividend Change' },
  // Leadership
  { pattern: /\b(CEO.?resign\w*|CEO.?appoint\w*|CFO.?resign\w*|CFO.?appoint\w*|CEO.?fired|CEO.?step\w*|new.?CEO|new.?CFO|executive.?departure\w*)\b/i,
    subtype: CatalystSubtype.LEADERSHIP_CHANGE, severity: Severity.HIGH, tag: 'Leadership Change' },
  // 13D stake (from news angle)
  { pattern: /\b(activist.?stake|13D|beneficial.?owner|large.?stake|stake.?increase)\b/i,
    subtype: CatalystSubtype.SEC_13D_STAKE, severity: Severity.HIGH, tag: 'Large Stake / 13D' },
];

/**
 * Classify a news headline into a CatalystSubtype.
 * Returns null if no rules match.
 */
export function classifyNews(item: NewsItem): ClassificationResult | null {
  const text = `${item.headline} ${item.body || ''}`;

  for (const rule of NEWS_RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      return {
        subtype: rule.subtype,
        confidence: 0.65,
        reason: `News keyword match: "${match[0]}" → ${rule.tag}. Source: ${item.source}. Headline: "${item.headline.slice(0, 120)}"`,
        severity: rule.severity,
      };
    }
  }

  return null;
}
