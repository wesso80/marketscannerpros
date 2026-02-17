'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getGuideByPath } from '@/lib/guides/toolGuides';

interface PageHowItWorksProps {
  route: string;
}

export default function PageHowItWorks({ route }: PageHowItWorksProps) {
  const guide = getGuideByPath(route);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'steps' | 'tips'>('overview');

  if (!guide) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          border: '1px solid rgba(20,184,166,0.4)',
          background: 'rgba(20,184,166,0.08)',
          color: '#2dd4bf',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {open ? 'Hide How It Works' : 'How It Works'}
      </button>

      {open ? (
        <div
          style={{
            marginTop: 10,
            border: '1px solid rgba(51,65,85,0.8)',
            borderRadius: 14,
            background: 'rgba(15,23,42,0.75)',
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 11,
                borderRadius: 999,
                border: '1px solid rgba(45,212,191,0.4)',
                padding: '2px 8px',
                color: '#2dd4bf',
              }}
            >
              {guide.badge}
            </span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>{guide.title}</span>
            <Link href="/guide" style={{ marginLeft: 'auto', color: '#2dd4bf', fontSize: 12, textDecoration: 'none' }}>
              Full Guide →
            </Link>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'steps', label: 'Steps' },
              { key: 'tips', label: 'Pro Tips' },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: tab === item.key ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(51,65,85,0.9)',
                  background: tab === item.key ? 'rgba(20,184,166,0.12)' : 'rgba(15,23,42,0.85)',
                  color: tab === item.key ? '#2dd4bf' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{guide.summary}</p>
          ) : tab === 'steps' ? (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#94a3b8', fontSize: 13 }}>
              {guide.steps.map((step, index) => (
                <li key={index} style={{ marginBottom: 4 }}>{step}</li>
              ))}
            </ul>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: '#94a3b8', fontSize: 13 }}>
              {guide.tips.map((tip, index) => (
                <li key={index} style={{ marginBottom: 4 }}>{tip}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}