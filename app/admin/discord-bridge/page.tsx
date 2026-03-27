"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../layout";

interface BridgeChannel {
  id: number;
  channel_key: string;
  label: string;
  category: string;
  webhook_url: string | null;
  enabled: boolean;
  cooldown_minutes: number;
  last_posted_at: string | null;
  post_count: number;
}

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  core: { label: "📊 CORE MSP PAGES", emoji: "📊" },
  engine: { label: "⚙️ ADVANCED ENGINES", emoji: "⚙️" },
  signal: { label: "🚨 SIGNAL / ALERT FLOW", emoji: "🚨" },
  education: { label: "📚 EDUCATION", emoji: "📚" },
};

const CATEGORY_ORDER = ["core", "engine", "signal", "education"];

export default function DiscordBridgePage() {
  const { secret, isAuthed } = useAdmin();
  const [channels, setChannels] = useState<BridgeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<BridgeChannel>>>({});

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/discord-bridge", {
        headers: { "x-admin-secret": secret },
      });
      if (!res.ok) return;
      const data = await res.json();
      setChannels(data.channels || []);
    } catch {
      setMessage({ text: "Failed to load channels", type: "err" });
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    if (isAuthed) void fetchChannels();
  }, [isAuthed, fetchChannels]);

  const getEdited = (ch: BridgeChannel) => ({
    ...ch,
    ...edits[ch.channel_key],
  });

  const setEdit = (key: string, field: string, value: unknown) => {
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const hasChanges = Object.keys(edits).length > 0;

  const saveAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updates = Object.entries(edits).map(([channelKey, edit]) => ({
        channelKey,
        webhookUrl: edit.webhook_url ?? undefined,
        enabled: edit.enabled ?? undefined,
        cooldownMinutes: edit.cooldown_minutes ?? undefined,
      }));

      const res = await fetch("/api/admin/discord-bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify({ action: "bulk-update", channels: updates }),
      });

      if (res.ok) {
        setEdits({});
        setMessage({ text: "All channels saved", type: "ok" });
        void fetchChannels();
      } else {
        setMessage({ text: "Save failed", type: "err" });
      }
    } catch {
      setMessage({ text: "Save failed", type: "err" });
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channelKey: string) => {
    setTesting(channelKey);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/discord-bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify({ action: "test", channelKey }),
      });
      const data = await res.json();
      setMessage({
        text: data.sent ? `✅ Test sent to ${channelKey}` : `❌ Test failed for ${channelKey} — check webhook URL`,
        type: data.sent ? "ok" : "err",
      });
    } catch {
      setMessage({ text: `Test failed for ${channelKey}`, type: "err" });
    } finally {
      setTesting(null);
    }
  };

  if (!isAuthed) return null;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    ...CATEGORY_LABELS[cat],
    channels: channels.filter((ch) => ch.category === cat),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">📡</span> Discord Bridge
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure MSP → Discord channel webhooks. Each channel maps to a Discord webhook URL.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-xs ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {message.text}
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={!hasChanges || saving}
            className="px-4 py-2 text-sm rounded-lg font-medium transition-all
              bg-emerald-500/20 text-emerald-300 border border-emerald-500/30
              hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : `Save Changes${hasChanges ? " •" : ""}`}
          </button>
        </div>
      </div>

      {/* Setup Guide */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">Setup Guide</h3>
        <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
          <li>In Discord, create a category called <strong className="text-slate-200">— MSP COMMAND CENTER —</strong></li>
          <li>Create text channels matching each row below (e.g. #msp-scanner, #golden-egg)</li>
          <li>For each channel: <strong className="text-slate-200">Edit Channel → Integrations → Webhooks → New Webhook</strong></li>
          <li>Copy the webhook URL and paste it below, then enable the channel</li>
          <li>Hit <strong className="text-slate-200">&quot;Test&quot;</strong> to verify the connection</li>
        </ol>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">Loading channels…</div>
      ) : (
        grouped.map((group) => (
          <div key={group.category} className="space-y-2">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.channels.map((ch) => {
                const edited = getEdited(ch);
                const isEdited = Boolean(edits[ch.channel_key]);

                return (
                  <div
                    key={ch.channel_key}
                    className={`bg-slate-900/50 border rounded-lg p-4 transition-colors ${
                      isEdited ? "border-amber-500/40" : "border-slate-700/50"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Toggle */}
                      <button
                        onClick={() => setEdit(ch.channel_key, "enabled", !edited.enabled)}
                        className={`mt-1 w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${
                          edited.enabled ? "bg-emerald-500" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            edited.enabled ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            #{ch.channel_key}
                          </span>
                          <span className="text-xs text-slate-500">{ch.label}</span>
                          {ch.post_count > 0 && (
                            <span className="text-[10px] text-slate-600">
                              {ch.post_count} posts
                            </span>
                          )}
                          {ch.last_posted_at && (
                            <span className="text-[10px] text-slate-600">
                              Last: {new Date(ch.last_posted_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        {/* Webhook URL input */}
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="url"
                            value={edited.webhook_url || ""}
                            onChange={(e) =>
                              setEdit(ch.channel_key, "webhook_url", e.target.value || null)
                            }
                            placeholder="https://discord.com/api/webhooks/..."
                            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 font-mono"
                          />
                          <select
                            value={edited.cooldown_minutes}
                            onChange={(e) =>
                              setEdit(ch.channel_key, "cooldown_minutes", Number(e.target.value))
                            }
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300"
                          >
                            <option value={5}>5m</option>
                            <option value={10}>10m</option>
                            <option value={15}>15m</option>
                            <option value={30}>30m</option>
                            <option value={60}>1h</option>
                            <option value={120}>2h</option>
                          </select>
                          <button
                            onClick={() => void testChannel(ch.channel_key)}
                            disabled={!edited.webhook_url || !edited.enabled || testing === ch.channel_key}
                            className="px-3 py-1.5 text-xs rounded border border-cyan-500/30 text-cyan-300
                              hover:bg-cyan-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {testing === ch.channel_key ? "…" : "Test"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Discord Server Structure Reference */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mt-8">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">
          Recommended Discord Server Structure
        </h3>
        <pre className="text-xs text-slate-400 font-mono whitespace-pre leading-relaxed">{`── VERIFY ──
  #verification

── SERVER INFO ──
  #rules
  #channel-guides
  #faq

── MSP COMMAND CENTER ──        ← NEW
  📊 Core Pages
    #msp-dashboard          → Market regime, daily briefing
    #msp-scanner            → Top scanner setups
    #golden-egg             → Institutional verdict (TRADE/WATCH/NO TRADE)
    #trade-terminal         → Execution environment links
    #market-explorer        → Cross-market intel
    #research               → Macro, news, catalysts
    #workspace              → Personal environment links

  ⚙️ Advanced Engines
    #volatility-engine      → DVE compression/expansion/exhaustion alerts
    #time-confluence        → Macro pivot timing windows
    #market-pressure        → MPE buy/sell imbalance
    #confluence-engine      → Composite score (0-100) alerts

  🚨 Signals
    #msp-alerts             → Multi-system alignment only
    #breakout-watch         → Approaching key levels
    #trap-detection         → Fakeouts, liquidity traps

  📚 Education
    #how-to-use-msp         → Platform guides (manual)
    #disclaimer-read        → Legal disclaimers (manual)
    #ai-analyst             → AI breakdowns (why, not what)
    #trade-reviews          → Post-trade analysis

── COMMUNITY CHAT ──
── VOICE CHANNEL ──
── TEAM / PRIVATE ──`}</pre>
      </div>

      {/* Legal reminder */}
      <div className="bg-red-950/30 border border-red-800/30 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-red-300 mb-2">⚠️ Compliance Reminder</h3>
        <p className="text-xs text-red-300/70">
          All Discord posts include &quot;Educational analysis only&quot; footers automatically.
          Never use language like &quot;take this trade&quot;, &quot;buy/sell now&quot;, or &quot;this will go up&quot;.
          Use: &quot;high confluence setup&quot;, &quot;conditions align&quot;, &quot;educational analysis&quot;.
        </p>
      </div>
    </div>
  );
}
