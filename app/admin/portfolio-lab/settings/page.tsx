"use client";

/**
 * /admin/portfolio-lab/settings
 *
 * Edit ArcaPortfolioSettings: risk caps, asset-class exposure caps,
 * enabled asset classes, playbook allowlist, gate thresholds, fees and
 * slippage estimates, benchmark symbol. Every change writes a REVIEW
 * journal entry server-side.
 *
 * SIMULATED only — these are paper-portfolio knobs, never broker config.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

type AssetClass = "equity" | "crypto" | "commodity" | "options" | "futures";

interface Settings {
  riskPerTradePct: number;
  maxSingleTradeRiskPct: number;
  maxOpenPortfolioRiskPct: number;
  maxAssetClassExposurePct: Record<AssetClass, number>;
  maxCorrelatedThemeExposurePct: number;
  maxTradesPerDay: number;
  losingStreakWarn: number;
  dailyDrawdownWarnPct: number;
  hardDrawdownWarnPct: number;
  feesPctEstimate: number;
  slippagePctEstimate: number;
  enabledAssetClasses: AssetClass[];
  enabledPlaybooks: string[] | null;
  minEdgePacketRankScore: number;
  minEvidenceQualityScore: number;
  benchmarkSymbol: string;
}

const ALL_CLASSES: AssetClass[] = ["equity", "crypto", "commodity", "options", "futures"];

export default function PortfolioLabSettingsPage() {
  const [original, setOriginal] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [portfolioExists, setPortfolioExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [playbooksRaw, setPlaybooksRaw] = useState<string>(""); // comma-separated; empty = ALL

  const load = useCallback(async () => {
    setLoading(true); setError(null); setSavedNote(null); setViolations([]);
    try {
      const r = await fetch("/api/admin/portfolio-lab/settings", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const data = j?.data ?? {};
      setOriginal(data.settings);
      setDraft(data.settings);
      setDefaults(data.defaults);
      setPortfolioExists(!!data.portfolioExists);
      setPlaybooksRaw(data.settings?.enabledPlaybooks ? data.settings.enabledPlaybooks.join(", ") : "");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => {
    if (!original || !draft) return false;
    return JSON.stringify(original) !== JSON.stringify(draft) ||
      (original.enabledPlaybooks ? original.enabledPlaybooks.join(", ") : "") !== playbooksRaw;
  }, [original, draft, playbooksRaw]);

  const save = async () => {
    if (!draft) return;
    setSaving(true); setError(null); setViolations([]); setSavedNote(null);
    try {
      // Parse playbooks: empty string → null (allow all). Comma list → array.
      const parsedPlaybooks =
        playbooksRaw.trim() === "" ? null :
        playbooksRaw.split(",").map((p) => p.trim()).filter(Boolean);
      const payload: Partial<Settings> = { ...draft, enabledPlaybooks: parsedPlaybooks };
      const r = await fetch("/api/admin/portfolio-lab/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (Array.isArray(j?.violations)) setViolations(j.violations);
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      const data = j?.data ?? {};
      setOriginal(data.settings);
      setDraft(data.settings);
      setPlaybooksRaw(data.settings?.enabledPlaybooks ? data.settings.enabledPlaybooks.join(", ") : "");
      const changed = (data.changed as string[]) ?? [];
      setSavedNote(changed.length === 0 ? "No values changed." : `Saved: ${changed.length} field${changed.length === 1 ? "" : "s"} changed.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    if (!confirm("Reset all settings back to ARCA defaults? You still need to click Save to persist.")) return;
    setDraft({ ...defaults });
    setPlaybooksRaw(defaults.enabledPlaybooks ? defaults.enabledPlaybooks.join(", ") : "");
  };

  const revert = () => {
    if (!original) return;
    setDraft({ ...original });
    setPlaybooksRaw(original.enabledPlaybooks ? original.enabledPlaybooks.join(", ") : "");
    setViolations([]); setSavedNote(null);
  };

  const setN = (k: keyof Settings, v: number) => setDraft((d) => d ? { ...d, [k]: v } : d);
  const setS = (k: keyof Settings, v: string) => setDraft((d) => d ? { ...d, [k]: v } : d);
  const setCap = (cls: AssetClass, v: number) =>
    setDraft((d) => d ? { ...d, maxAssetClassExposurePct: { ...d.maxAssetClassExposurePct, [cls]: v } } : d);
  const toggleAsset = (cls: AssetClass) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.enabledAssetClasses.includes(cls);
      const next = has ? d.enabledAssetClasses.filter((x) => x !== cls) : [...d.enabledAssetClasses, cls];
      return { ...d, enabledAssetClasses: next };
    });

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={crumb}>SIMULATED · NO BROKER</div>
            <h1 style={h1}>ARCA Settings</h1>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {portfolioExists ? "Editing the active ARCA Internal Fund." : "No ARCA portfolio yet — defaults shown; save will fail until you initialise."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={revert} disabled={!dirty || saving} style={btnGhost}>Revert</button>
            <button onClick={resetToDefaults} disabled={saving} style={btnGhost}>Reset to Defaults</button>
            <button onClick={save} disabled={!dirty || saving || !portfolioExists} style={btnPrimary}>{saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}</button>
          </div>
        </div>

        {error && <div style={errBox}>Error: {error}</div>}
        {violations.length > 0 && (
          <div style={errBox}>
            <strong>Validation failed:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {violations.map((v, i) => (<li key={i}>{v}</li>))}
            </ul>
          </div>
        )}
        {savedNote && <div style={okBox}>{savedNote}</div>}

        {!draft || loading ? (
          <div style={emptyBox}>Loading settings…</div>
        ) : (
          <>
            <Section title="Risk Caps">
              <Grid cols={3}>
                <Num label="Risk per trade %" value={draft.riskPerTradePct} step={0.05} onChange={(v) => setN("riskPerTradePct", v)} help="default 0.75" />
                <Num label="Max single trade risk %" value={draft.maxSingleTradeRiskPct} step={0.05} onChange={(v) => setN("maxSingleTradeRiskPct", v)} help="hard cap, default 1.0" />
                <Num label="Max open portfolio risk %" value={draft.maxOpenPortfolioRiskPct} step={0.1} onChange={(v) => setN("maxOpenPortfolioRiskPct", v)} help="default 5.0" />
                <Num label="Max correlated theme exposure %" value={draft.maxCorrelatedThemeExposurePct} step={1} onChange={(v) => setN("maxCorrelatedThemeExposurePct", v)} help="default 20" />
                <Num label="Max trades per day" value={draft.maxTradesPerDay} step={1} onChange={(v) => setN("maxTradesPerDay", Math.round(v))} help="default 10" />
                <Num label="Losing streak warn (trades)" value={draft.losingStreakWarn} step={1} onChange={(v) => setN("losingStreakWarn", Math.round(v))} help="default 3" />
                <Num label="Daily drawdown warn %" value={draft.dailyDrawdownWarnPct} step={0.1} onChange={(v) => setN("dailyDrawdownWarnPct", v)} help="default 2" />
                <Num label="Hard drawdown warn %" value={draft.hardDrawdownWarnPct} step={0.1} onChange={(v) => setN("hardDrawdownWarnPct", v)} help="default 5" />
              </Grid>
            </Section>

            <Section title="Asset Class Exposure Caps (%)">
              <Grid cols={5}>
                {ALL_CLASSES.map((cls) => (
                  <Num
                    key={cls}
                    label={cls}
                    value={draft.maxAssetClassExposurePct[cls] ?? 0}
                    step={1}
                    onChange={(v) => setCap(cls, v)}
                  />
                ))}
              </Grid>
            </Section>

            <Section title="Enabled Asset Classes">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ALL_CLASSES.map((cls) => {
                  const on = draft.enabledAssetClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      onClick={() => toggleAsset(cls)}
                      style={{
                        ...pill,
                        background: on ? "#064E3B" : "#1F2937",
                        color: on ? "#A7F3D0" : "#94A3B8",
                        border: `1px solid ${on ? "#10B981" : "#334155"}`,
                      }}
                    >
                      {on ? "✓ " : ""}{cls}
                    </button>
                  );
                })}
              </div>
              <div style={hint}>At least one class must be enabled.</div>
            </Section>

            <Section title="Decision Gates">
              <Grid cols={3}>
                <Num label="Min Edge Packet rank score" value={draft.minEdgePacketRankScore} step={1} onChange={(v) => setN("minEdgePacketRankScore", v)} help="default 65" />
                <Num label="Min Evidence Quality score" value={draft.minEvidenceQualityScore} step={1} onChange={(v) => setN("minEvidenceQualityScore", v)} help="default 60" />
                <Txt label="Benchmark symbol" value={draft.benchmarkSymbol} onChange={(v) => setS("benchmarkSymbol", v)} help="default SPY" />
              </Grid>
            </Section>

            <Section title="Cost Model (sim)">
              <Grid cols={2}>
                <Num label="Fees estimate %" value={draft.feesPctEstimate} step={0.01} onChange={(v) => setN("feesPctEstimate", v)} help="applied per close" />
                <Num label="Slippage estimate %" value={draft.slippagePctEstimate} step={0.01} onChange={(v) => setN("slippagePctEstimate", v)} help="applied per fill/exit" />
              </Grid>
            </Section>

            <Section title="Enabled Playbooks (allowlist)">
              <textarea
                value={playbooksRaw}
                onChange={(e) => setPlaybooksRaw(e.target.value)}
                rows={3}
                placeholder="empty = allow all playbooks; otherwise comma-separated, e.g. TREND_CONTINUATION, BREAKOUT, MEAN_REVERSION"
                style={textarea}
              />
              <div style={hint}>Leave empty to allow all playbooks. Otherwise only listed setupTypes will pass the decision gate.</div>
            </Section>

            <div style={discBox}>
              These knobs only control the SIMULATED paper engine. There is no broker integration to misconfigure.
              Every save writes a REVIEW journal entry with a field-level diff.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
}
function Num({ label, value, step, onChange, help }: { label: string; value: number; step?: number; onChange: (v: number) => void; help?: string }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step ?? 0.01}
        onChange={(e) => onChange(Number(e.target.value))}
        style={fieldInput}
      />
      {help && <div style={hint}>{help}</div>}
    </div>
  );
}
function Txt({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: string }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={fieldInput}
      />
      {help && <div style={hint}>{help}</div>}
    </div>
  );
}

const crumb: React.CSSProperties = { fontSize: 11, color: "#64748B", letterSpacing: 1.5, textTransform: "uppercase" };
const h1: React.CSSProperties = { fontSize: 22, color: "#F8FAFC", margin: "4px 0" };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 };
const fieldInput: React.CSSProperties = { width: "100%", padding: "8px 10px", background: "#0B1220", color: "#F8FAFC", border: "1px solid #334155", borderRadius: 6, fontSize: 13 };
const textarea: React.CSSProperties = { ...fieldInput, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };
const hint: React.CSSProperties = { fontSize: 11, color: "#64748B", marginTop: 4 };
const pill: React.CSSProperties = { padding: "6px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", background: "#10B981", color: "#0B1220", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "transparent", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 6, cursor: "pointer", fontSize: 13 };
const errBox: React.CSSProperties = { background: "#7F1D1D", color: "#FCA5A5", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const okBox: React.CSSProperties = { background: "#064E3B", color: "#A7F3D0", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 };
const emptyBox: React.CSSProperties = { background: "#111827", border: "1px solid #1F2937", borderRadius: 8, padding: 24, color: "#64748B", textAlign: "center", fontSize: 13 };
const discBox: React.CSSProperties = { marginTop: 16, padding: 10, background: "#0B1220", border: "1px solid #1F2937", borderRadius: 6, fontSize: 11, color: "#64748B", lineHeight: 1.5 };
