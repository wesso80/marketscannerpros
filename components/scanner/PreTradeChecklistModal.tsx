'use client';

import React from 'react';

export interface PreTradeChecklistState {
  thesis: boolean;
  risk: boolean;
  eventWindow: boolean;
}

interface Props {
  visible: boolean;
  symbol?: string;
  checklist: PreTradeChecklistState;
  onChange: (update: Partial<PreTradeChecklistState>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PreTradeChecklistModal({ visible, symbol, checklist, onChange, onConfirm, onCancel }: Props) {
  if (!visible) return null;

  const items: { key: keyof PreTradeChecklistState; label: string }[] = [
    { key: 'thesis', label: 'Thesis is clear and setup aligns with current regime.' },
    { key: 'risk', label: 'Stop/invalidation and risk budget are defined before entry.' },
    { key: 'eventWindow', label: 'High-impact event window reviewed and throttle accepted.' },
  ];

  const allChecked = items.every(i => checklist[i.key]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pretrade-checklist-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-4">
        <div id="pretrade-checklist-title" className="mb-2 text-[0.84rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text)]">
          Pre-Trade Checklist
        </div>
        <div className="mb-3 text-[0.74rem] text-[var(--msp-text-muted)]">
          Confirm discipline checks before creating a plan{symbol ? ` for ${symbol.toUpperCase()}` : ''}.
        </div>
        <div className="grid gap-2 text-[0.78rem] text-[var(--msp-text)]">
          {items.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-start gap-2 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-2"
            >
              <input
                type="checkbox"
                checked={checklist[key]}
                onChange={(e) => onChange({ [key]: e.target.checked })}
                className="mt-0.5"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onCancel}
            className="h-9 flex-1 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 text-[0.7rem] font-extrabold uppercase text-[var(--msp-text-muted)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className="msp-btn-elite-primary h-9 flex-1 px-3 text-[0.7rem] font-extrabold uppercase disabled:opacity-50"
          >
            Confirm & Create Plan
          </button>
        </div>
      </div>
    </div>
  );
}
