import { q } from '@/lib/db';

/** Inspect optional research tables without creating them or changing writer readiness. */
export async function readPaperSchema() {
  try {
    const [row] = await q<{ excursions: boolean; marks: boolean; signals: boolean }>(
      `SELECT to_regclass('crypto_trade_excursions') IS NOT NULL AS excursions,
              to_regclass('crypto_book_marks') IS NOT NULL AS marks,
              to_regclass('crypto_signal_ledger') IS NOT NULL AS signals`);
    return { excursions: row?.excursions === true, marks: row?.marks === true, signals: row?.signals === true };
  } catch {
    return { excursions: false, marks: false, signals: false };
  }
}
