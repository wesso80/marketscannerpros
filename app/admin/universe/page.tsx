"use client";

/**
 * /admin/universe — operator's personal watch universe + global kill switch.
 *
 * Universe: CRUD over personal_universe (symbol, asset class, thesis,
 * tags, position caps). Pre-trade checklist + alert routing should
 * respect the personal caps and active flag.
 *
 * Kill switch: when ON, alert dispatchers and notification senders
 * MUST skip emission. Toggling appends to kill_switch_log.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface UniverseEntry {
  id: number;
  symbol: string;
  assetClass: string;
  thesis: string | null;
  tags: string[];
  maxPositionUsd: number | null;
  maxPositionPctEquity: number | null;
  active: boolean;
  updatedAt: string;
}

interface KillSwitchState {
  enabled: boolean;
  reason: string | null;
  setAt: string | null;
  updatedAt: string;
}

interface KillSwitchLogEntry {
  id: number;
  enabled: boolean;
  reason: string | null;
  actor: string | null;
  createdAt: string;
}

export default function UniversePage() {
  const [entries, setEntries] = useState<UniverseEntry[]>([]);
  const [killState, setKillState] = useState<KillSwitchState | null>(null);
  const [killLog, setKillLog] = useState<KillSwitchLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [fSymbol, setFSymbol] = useState('');
  const [fAssetClass, setFAssetClass] = useState('equity');
  const [fThesis, setFThesis] = useState('');
  const [fTags, setFTags] = useState('');
  const [fMaxUsd, setFMaxUsd] = useState('');
  const [fMaxPct, setFMaxPct] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [u, k] = await Promise.all([
        fetch(`/api/admin/universe${includeInactive ? '?includeInactive=1' : ''}`, { cache: 'no-store' }),
        fetch('/api/admin/kill-switch', { cache: 'no-store' }),
      ]);
      const uj = await u.json();
      const kj = await k.json();
      if (!u.ok || !uj.ok) throw new Error(uj?.error ?? `universe HTTP ${u.status}`);
      if (!k.ok || !kj.ok) throw new Error(kj?.error ?? `kill-switch HTTP ${k.status}`);
      setEntries(uj.entries as UniverseEntry[]);
      setKillState(kj.state as KillSwitchState);
      setKillLog(kj.log as KillSwitchLogEntry[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [includeInactive]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      const res = await fetch('/api/admin/universe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: fSymbol.trim(),
          assetClass: fAssetClass,
          thesis: fThesis.trim() || null,
          tags: fTags.split(',').map((t) => t.trim()).filter(Boolean),
          maxPositionUsd: fMaxUsd ? Number(fMaxUsd) : null,
          maxPositionPctEquity: fMaxPct ? Number(fMaxPct) : null,
          active: true,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setFSymbol(''); setFThesis(''); setFTags(''); setFMaxUsd(''); setFMaxPct('');
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (symbol: string) => {
    if (!confirm(`Remove ${symbol} from your personal universe?`)) return;
    try {
      const res = await fetch(`/api/admin/universe?symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleActive = async (entry: UniverseEntry) => {
    try {
      const res = await fetch('/api/admin/universe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: entry.symbol,
          assetClass: entry.assetClass,
          thesis: entry.thesis,
          tags: entry.tags,
          maxPositionUsd: entry.maxPositionUsd,
          maxPositionPctEquity: entry.maxPositionPctEquity,
          active: !entry.active,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleKill = async () => {
    if (!killState) return;
    const newEnabled = !killState.enabled;
    const reason = newEnabled
      ? (prompt('Reason for enabling kill switch (alerts + notifications will be suppressed):') ?? '').trim() || 'No reason given'
      : (prompt('Reason for disabling kill switch:') ?? '').trim() || 'Resuming';
    try {
      const res = await fetch('/api/admin/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled, reason }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#E5E7EB' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#F9FAFB' }}>Personal Universe & Kill Switch</h1>
        <p style={{ margin: '8px 0 0', color: '#9CA3AF', fontSize: 14, maxWidth: 760 }}>
          Curate the symbols you actively track and set personal exposure caps. Use the kill switch
          to suspend alerts and outbound notifications when stepping away or during periods of
          impaired discipline.
        </p>
      </div>

      {error && (
        <div style={{ background: '#7F1D1D', border: '1px solid #B91C1C', color: '#FECACA', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Kill switch */}
      <section style={{
        border: '1px solid ' + (killState?.enabled ? '#B91C1C' : '#374151'),
        background: killState?.enabled ? '#3F0D0D' : '#0B1220',
        borderRadius: 10, padding: 18, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: killState?.enabled ? '#FCA5A5' : '#10B981' }}>
              Kill switch: {killState?.enabled ? 'ON — alerts & notifications suppressed' : 'OFF — alerts active'}
            </div>
            {killState?.enabled && killState.reason && (
              <div style={{ marginTop: 4, color: '#FECACA', fontSize: 13 }}>
                Reason: {killState.reason}
              </div>
            )}
            {killState?.setAt && (
              <div style={{ marginTop: 4, color: '#9CA3AF', fontSize: 12 }}>
                Set at: {new Date(killState.setAt).toLocaleString()}
              </div>
            )}
          </div>
          <button onClick={toggleKill} disabled={!killState}
            style={{
              background: killState?.enabled ? '#10B981' : '#B91C1C',
              color: killState?.enabled ? '#0F172A' : '#FECACA',
              border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer',
            }}>
            {killState?.enabled ? 'Disable kill switch' : 'Enable kill switch'}
          </button>
        </div>
        {killLog.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ color: '#9CA3AF', fontSize: 12, cursor: 'pointer' }}>Recent kill switch log ({killLog.length})</summary>
            <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: '#9CA3AF' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>When</th>
                <th style={{ textAlign: 'left', padding: 4 }}>State</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Actor</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Reason</th>
              </tr></thead>
              <tbody>
                {killLog.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid #1F2937' }}>
                    <td style={{ padding: 4 }}>{new Date(l.createdAt).toLocaleString()}</td>
                    <td style={{ padding: 4, color: l.enabled ? '#FCA5A5' : '#10B981' }}>{l.enabled ? 'ON' : 'OFF'}</td>
                    <td style={{ padding: 4 }}>{l.actor ?? '—'}</td>
                    <td style={{ padding: 4, color: '#9CA3AF' }}>{l.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      {/* Add form */}
      <section style={{ border: '1px solid #374151', background: '#0B1220', borderRadius: 10, padding: 18, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Add / update symbol</h2>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="Symbol *">
            <input value={fSymbol} onChange={(e) => setFSymbol(e.target.value.toUpperCase())} required maxLength={16} style={inp} />
          </Field>
          <Field label="Asset class">
            <select value={fAssetClass} onChange={(e) => setFAssetClass(e.target.value)} style={inp}>
              <option value="equity">Equity</option>
              <option value="etf">ETF</option>
              <option value="crypto">Crypto</option>
              <option value="fx">FX</option>
              <option value="commodity">Commodity</option>
            </select>
          </Field>
          <Field label="Max position ($)">
            <input type="number" step="1" min="0" value={fMaxUsd} onChange={(e) => setFMaxUsd(e.target.value)} style={inp} />
          </Field>
          <Field label="Max position (% equity)">
            <input type="number" step="0.1" min="0" max="100" value={fMaxPct} onChange={(e) => setFMaxPct(e.target.value)} style={inp} />
          </Field>
          <Field label="Tags (comma separated)">
            <input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="ai, semis, core" style={inp} />
          </Field>
          <Field label="Thesis">
            <input value={fThesis} onChange={(e) => setFThesis(e.target.value)} placeholder="Short one-liner" style={inp} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="submit" style={{ background: '#10B981', color: '#0F172A', border: 'none', borderRadius: 6, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
              Save
            </button>
          </div>
        </form>
      </section>

      {/* Universe table */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Universe ({entries.length})</h2>
          <label style={{ fontSize: 12, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Include inactive
          </label>
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid #1F2937', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#0B1220' }}>
              <tr>
                <Th>Symbol</Th><Th>Class</Th><Th>Thesis</Th><Th>Tags</Th>
                <Th align="right">Cap ($)</Th><Th align="right">Cap (%)</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 18, textAlign: 'center', color: '#6B7280' }}>
                  {loading ? 'Loading…' : 'No symbols yet. Add one above.'}
                </td></tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid #1F2937', opacity: e.active ? 1 : 0.5 }}>
                  <Td><strong>{e.symbol}</strong></Td>
                  <Td>{e.assetClass}</Td>
                  <Td><span style={{ color: '#9CA3AF' }}>{e.thesis ?? '—'}</span></Td>
                  <Td>{e.tags.length === 0 ? <span style={{ color: '#6B7280' }}>—</span> :
                    e.tags.map((t) => <span key={t} style={{ background: '#1F2937', borderRadius: 4, padding: '2px 6px', fontSize: 11, marginRight: 4 }}>{t}</span>)}</Td>
                  <Td align="right">{e.maxPositionUsd === null ? '—' : `$${e.maxPositionUsd.toLocaleString()}`}</Td>
                  <Td align="right">{e.maxPositionPctEquity === null ? '—' : `${e.maxPositionPctEquity}%`}</Td>
                  <Td><span style={{ color: e.active ? '#10B981' : '#9CA3AF', fontWeight: 600 }}>{e.active ? 'Active' : 'Inactive'}</span></Td>
                  <Td>
                    <button onClick={() => toggleActive(e)} style={btnSmall}>{e.active ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => remove(e.symbol)} style={{ ...btnSmall, color: '#FCA5A5', marginLeft: 6 }}>Remove</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ marginTop: 24, fontSize: 11, color: '#6B7280', textAlign: 'center' }}>
        <Link href="/admin" style={{ color: '#10B981' }}>Back to admin</Link>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', background: '#0F172A', border: '1px solid #374151',
  borderRadius: 6, padding: '8px 10px', color: '#E5E7EB', fontSize: 13,
};
const btnSmall: React.CSSProperties = {
  background: 'transparent', border: '1px solid #374151', color: '#E5E7EB',
  borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {children}
    </label>
  );
}
function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '8px 10px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}
function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ textAlign: align ?? 'left', padding: '8px 10px', color: '#E5E7EB' }}>{children}</td>;
}
