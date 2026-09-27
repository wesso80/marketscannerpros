import { mentionsCompany } from '@/lib/equityNewsRelevance';
import { classifyNews } from './classifier';

/** Reassess stored news on read, preserving original database records and SEC classifications. */
export function reviewStoredCatalyst<T extends { ticker: string; catalyst_type?: string; source?: string; headline?: string; raw_payload?: unknown }>(row: T): T | null {
  if (row.catalyst_type !== 'NEWS') return row;
  let payload: { body?: string; relevanceVerified?: boolean } = {};
  try { payload = typeof row.raw_payload === 'string' ? JSON.parse(row.raw_payload) : (row.raw_payload ?? {}) as typeof payload; } catch { return null; }
  if (!payload?.relevanceVerified && !mentionsCompany(`${row.headline ?? ''} ${payload?.body ?? ''}`, row.ticker)) return null;
  const classification = classifyNews({ headline: row.headline ?? '', body: payload?.body, tickers: [row.ticker], timestamp: new Date(0), url: '', source: row.source ?? '' });
  if (!classification) return null;
  return { ...row, catalyst_subtype: classification.subtype, severity: classification.severity, confidence: classification.confidence, classification_reason: classification.reason };
}
