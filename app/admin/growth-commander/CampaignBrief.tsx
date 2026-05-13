"use client";

import { useState } from "react";

export interface BriefFormState {
  goal: string;
  audience: string;
  platform: "x" | "instagram";
  postType:
    | "x_post"
    | "ig_caption"
    | "reel_script"
    | "carousel"
    | "launch_announcement"
    | "feature_explainer"
    | "trader_education"
    | "platform_update"
    | "founder_post"
    | "conversion"
    | "referral";
  tone:
    | "founder_led"
    | "institutional_analyst"
    | "educational"
    | "sharp_practical"
    | "community_builder";
  feature?: string;
  offer?: string;
  count: number;
  extraContext?: string;
}

const LAUNCH_DEFAULT: BriefFormState = {
  goal: "Get beta / trial signups",
  audience:
    "Active retail traders who want better structure, scanner tools, volatility context, and educational analytics — frustrated by single-indicator tools and tipster newsletters.",
  platform: "x",
  postType: "founder_post",
  tone: "founder_led",
  offer: "Full Pro Access trial",
  count: 3,
  extraContext: "",
};

export default function CampaignBrief({
  onSubmit,
  loading,
}: {
  onSubmit: (brief: BriefFormState) => void | Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<BriefFormState>(LAUNCH_DEFAULT);

  const set = <K extends keyof BriefFormState>(k: K, v: BriefFormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(form);
      }}
      style={{ display: "grid", gap: "0.85rem" }}
    >
      <div style={twoCol()}>
        <Field label="Campaign goal">
          <input
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
            style={inputStyle()}
            required
          />
        </Field>
        <Field label="Offer (optional)">
          <input
            value={form.offer ?? ""}
            onChange={(e) => set("offer", e.target.value)}
            style={inputStyle()}
            placeholder="e.g. Full Pro Access trial"
          />
        </Field>
      </div>

      <Field label="Audience">
        <textarea
          value={form.audience}
          onChange={(e) => set("audience", e.target.value)}
          rows={3}
          style={{ ...inputStyle(), resize: "vertical" }}
          required
        />
      </Field>

      <div style={twoCol()}>
        <Field label="Platform">
          <select value={form.platform} onChange={(e) => set("platform", e.target.value as BriefFormState["platform"])} style={inputStyle()}>
            <option value="x">X / Twitter</option>
            <option value="instagram">Instagram</option>
          </select>
        </Field>
        <Field label="Post type">
          <select value={form.postType} onChange={(e) => set("postType", e.target.value as BriefFormState["postType"])} style={inputStyle()}>
            {form.platform === "x" ? (
              <>
                <option value="x_post">X post</option>
                <option value="launch_announcement">Launch announcement</option>
                <option value="feature_explainer">Feature explainer</option>
                <option value="trader_education">Trader education</option>
                <option value="platform_update">Platform update</option>
                <option value="founder_post">Founder post</option>
                <option value="conversion">Conversion</option>
                <option value="referral">Referral</option>
              </>
            ) : (
              <>
                <option value="ig_caption">IG caption</option>
                <option value="reel_script">Reel script</option>
                <option value="carousel">Carousel</option>
                <option value="launch_announcement">Launch announcement</option>
                <option value="feature_explainer">Feature explainer</option>
                <option value="trader_education">Trader education</option>
                <option value="founder_post">Founder post</option>
                <option value="conversion">Conversion</option>
                <option value="referral">Referral</option>
              </>
            )}
          </select>
        </Field>
      </div>

      <div style={twoCol()}>
        <Field label="Tone">
          <select value={form.tone} onChange={(e) => set("tone", e.target.value as BriefFormState["tone"])} style={inputStyle()}>
            <option value="founder_led">Founder-led</option>
            <option value="institutional_analyst">Institutional analyst</option>
            <option value="educational">Educational</option>
            <option value="sharp_practical">Sharp / practical</option>
            <option value="community_builder">Community builder</option>
          </select>
        </Field>
        <Field label="Focus feature (optional)">
          <select value={form.feature ?? ""} onChange={(e) => set("feature", e.target.value || undefined)} style={inputStyle()}>
            <option value="">— none —</option>
            <option value="scanner">Live Scanner</option>
            <option value="volatility-compression">Volatility Compression</option>
            <option value="opportunity-board">Opportunity Board</option>
            <option value="morning-brief">Morning Brief</option>
            <option value="learning-engine">Learning Engine</option>
            <option value="time-clustering">Time Confluence</option>
            <option value="journal">Trade Journal</option>
            <option value="operator-terminal">Operator Terminal</option>
          </select>
        </Field>
      </div>

      <Field label="Extra context (optional)">
        <textarea
          value={form.extraContext ?? ""}
          onChange={(e) => set("extraContext", e.target.value)}
          rows={2}
          style={{ ...inputStyle(), resize: "vertical" }}
          placeholder="Anything Claude should know that isn't in the standard brief…"
        />
      </Field>

      <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", flexWrap: "wrap" }}>
        <Field label="Drafts to generate">
          <input
            type="number"
            min={1}
            max={5}
            value={form.count}
            onChange={(e) => set("count", Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
            style={{ ...inputStyle(), width: "5rem" }}
          />
        </Field>
        <button type="submit" disabled={loading} style={primaryBtn(loading)}>
          {loading ? "Generating…" : "Generate drafts"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "0.3rem" }}>
      <span style={{ color: "#94A3B8", fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "0.6rem 0.75rem",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0.5rem",
    color: "#E5E7EB",
    fontSize: "0.88rem",
    width: "100%",
  };
}

function twoCol(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.85rem",
  };
}

function primaryBtn(loading: boolean): React.CSSProperties {
  return {
    padding: "0.65rem 1.25rem",
    background: loading ? "rgba(16, 185, 129, 0.35)" : "var(--msp-accent)",
    border: "none",
    borderRadius: "0.5rem",
    color: "white",
    fontWeight: 700,
    cursor: loading ? "default" : "pointer",
    fontSize: "0.88rem",
  };
}
