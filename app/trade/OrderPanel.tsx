'use client';

import { useState } from 'react';

interface Props {
  symbol: string;
  estPrice: number | null;
}

type Side = 'BUY' | 'SELL';
type OType = 'MKT' | 'LMT' | 'STP' | 'BRACKET';

export default function OrderPanel({ symbol, estPrice }: Props) {
  const [side, setSide] = useState<Side>('BUY');
  const [type, setType] = useState<OType>('MKT');
  const [qty, setQty] = useState(1);
  const [limit, setLimit] = useState<string>('');
  const [tp, setTp] = useState<string>('');
  const [sl, setSl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        symbol,
        side,
        type,
        qty,
        estPrice: limit ? Number(limit) : estPrice,
      };
      if (limit) body.limitPrice = Number(limit);
      if (tp) body.tpPrice = Number(tp);
      if (sl) body.slPrice = Number(sl);

      const res = await fetch('/api/trade/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(`✗ ${json.error}${json.reason ? ` (${json.reason})` : ''}`);
      } else {
        setMsg(`✓ ${json.order.status} #${json.order.id} @ ${json.order.avgFillPrice ?? '—'}`);
      }
    } catch (e) {
      setMsg(`✗ ${e instanceof Error ? e.message : 'failed'}`);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    background: '#0F172A',
    color: '#E2E8F0',
    border: '1px solid #334155',
    borderRadius: 4,
    padding: '4px 6px',
    fontSize: 12,
    width: 80,
    fontFamily: 'monospace',
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#1E293B', borderLeft: '1px solid #334155', minWidth: 240 }}>
      <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>Order Ticket · paper</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => setSide('BUY')} style={{ flex: 1, padding: 6, background: side === 'BUY' ? '#10B981' : '#0F172A', color: side === 'BUY' ? '#0F172A' : '#E2E8F0', border: '1px solid #334155', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>BUY</button>
        <button onClick={() => setSide('SELL')} style={{ flex: 1, padding: 6, background: side === 'SELL' ? '#EF4444' : '#0F172A', color: side === 'SELL' ? '#0F172A' : '#E2E8F0', border: '1px solid #334155', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>SELL</button>
      </div>
      <label style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as OType)} style={inputStyle}>
          <option>MKT</option>
          <option>LMT</option>
          <option>STP</option>
          <option>BRACKET</option>
        </select>
      </label>
      <label style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Qty
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} style={inputStyle} />
      </label>
      {(type === 'LMT' || type === 'BRACKET') && (
        <label style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Limit
          <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={estPrice?.toFixed(2) ?? ''} style={inputStyle} />
        </label>
      )}
      <label style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        TP
        <input value={tp} onChange={(e) => setTp(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        SL
        <input value={sl} onChange={(e) => setSl(e.target.value)} style={inputStyle} />
      </label>
      <button
        disabled={busy || !estPrice}
        onClick={submit}
        style={{
          padding: 8,
          background: busy ? '#475569' : side === 'BUY' ? '#10B981' : '#EF4444',
          color: '#0F172A',
          border: 'none',
          borderRadius: 4,
          fontWeight: 700,
          cursor: busy ? 'wait' : 'pointer',
          fontSize: 12,
        }}
      >
        {busy ? '…' : `Submit ${side} ${qty} ${symbol}`}
      </button>
      {msg && <div style={{ fontSize: 11, padding: 6, background: msg.startsWith('✓') ? '#064E3B' : '#7F1D1D', borderRadius: 4 }}>{msg}</div>}
      <div style={{ fontSize: 10, opacity: 0.5, marginTop: 'auto' }}>
        Paper broker · pre-trade risk gate active · all orders audited
      </div>
    </div>
  );
}
