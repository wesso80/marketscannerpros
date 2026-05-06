// Append-only audit log helper. Use for every signal, risk decision, order, fill.
import { q } from '@/lib/db';

export interface AuditEntry {
  category: 'signal' | 'risk' | 'order' | 'fill' | 'manual' | 'system';
  actor: string;
  action: string;
  symbol?: string;
  refTable?: string;
  refId?: number | bigint | null;
  payload?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await q(
      `INSERT INTO trade_audit_log (category, actor, action, symbol, ref_table, ref_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.category,
        entry.actor,
        entry.action,
        entry.symbol ?? null,
        entry.refTable ?? null,
        entry.refId == null ? null : Number(entry.refId),
        JSON.stringify(entry.payload ?? {}),
      ]
    );
  } catch (err) {
    // Never let audit failures break the main flow, but log loudly.
    console.error('[trade.audit] failed to write audit entry', err, entry);
  }
}
