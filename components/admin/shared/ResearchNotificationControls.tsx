"use client";

import { useEffect, useState } from 'react';
import AdminCard from './AdminCard';

type Settings = { paused: boolean; channels: { discord: { available: boolean; status: string }; email: { available: boolean; status: string } } };
export default function ResearchNotificationControls() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/admin/research-alerts/settings', { credentials: 'include' })
      .then(async response => { if (!response.ok) throw new Error('Notification settings unavailable'); return response.json(); })
      .then(data => { if (active) setSettings(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const toggle = async () => {
    if (!settings || saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/research-alerts/settings', {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !settings.paused }),
      });
      if (!response.ok) throw new Error('Notification setting could not be saved');
      setSettings(await response.json());
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  };
  return <AdminCard title="Research Notifications">
    <div className="space-y-2 text-sm text-white/70">
      <p>Independent of account sizing. Data quality, setup quality and duplicate checks still apply.</p>
      {settings ? <>
        <p>Discord: <strong>{settings.channels.discord.status}</strong></p>
        <p>Email: <strong>{settings.channels.email.status}</strong></p>
        <button onClick={toggle} disabled={saving} className="rounded border border-white/20 px-3 py-2 disabled:opacity-50">
          {saving ? 'Saving…' : settings.paused ? 'Resume research notifications' : 'Pause research notifications'}
        </button>
        <p className="text-xs text-white/45">Applies to future admin research-alert dispatches for this workspace. Existing in-flight deliveries and other alert products are separate. Resuming does not send a test alert.</p>
      </> : <p>{error || 'Loading notification settings…'}</p>}
      {settings && error && <p role="alert" className="text-amber-300">{error}</p>}
    </div>
  </AdminCard>;
}
