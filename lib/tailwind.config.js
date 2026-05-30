/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        msp: {
          // surfaces
          bg: "var(--msp-bg)",
          panel: "var(--msp-panel)",
          card: "var(--msp-card)",
          "card-2": "var(--msp-card-2)",
          // borders
          border: "var(--msp-border)",
          borderStrong: "var(--msp-border-strong)",
          // text
          text: "var(--msp-text)",
          "text-muted": "var(--msp-text-muted)",
          "text-faint": "var(--msp-text-faint)",
          muted: "var(--msp-text-muted)",
          // accent (NOT bullish)
          accent: "var(--msp-accent)",
          accentDim: "var(--msp-accent-dim)",
          accentHover: "var(--msp-accent-dim)",
          accentGlow: "var(--msp-accent-glow)",
          // semantic
          bull: "var(--msp-bull)",
          bear: "var(--msp-bear)",
          warn: "var(--msp-warn)",
          info: "var(--msp-info)",
          flat: "var(--msp-flat)",
          neutral: "var(--msp-flat)",
          // tints
          bullTint: "var(--msp-bull-tint)",
          bearTint: "var(--msp-bear-tint)",
          warnTint: "var(--msp-warn-tint)",
          infoTint: "var(--msp-info-tint)",
          accentTint: "var(--msp-accent-tint)",
        },
      },
      fontSize: {
        "msp-caption": ["var(--msp-text-caption)", { lineHeight: "1.4" }],
        "msp-label":   ["var(--msp-text-label)",   { lineHeight: "1.4" }],
        "msp-body-sm": ["var(--msp-text-body-sm)", { lineHeight: "1.5" }],
        "msp-body":    ["var(--msp-text-body)",    { lineHeight: "1.5" }],
        "msp-h2":      ["var(--msp-text-h2)",      { lineHeight: "1.4", fontWeight: "500" }],
        "msp-h1":      ["var(--msp-text-h1)",      { lineHeight: "1.3", fontWeight: "500" }],
        "msp-display": ["var(--msp-text-display)", { lineHeight: "1.2", fontWeight: "500" }],
      },
      spacing: {
        "msp-1": "var(--msp-space-1)",
        "msp-2": "var(--msp-space-2)",
        "msp-3": "var(--msp-space-3)",
        "msp-4": "var(--msp-space-4)",
        "msp-6": "var(--msp-space-6)",
        "msp-8": "var(--msp-space-8)",
      },
      boxShadow: {
        "msp-glow": "0 0 0 3px var(--msp-accent-glow)",
        "msp-soft": "0 10px 30px rgba(0,0,0,0.28)",
        msp: "var(--msp-shadow)",
      },
      borderRadius: {
        "msp-pill":    "var(--msp-radius-pill)",
        "msp-control": "var(--msp-radius-control)",
        "msp-card":    "var(--msp-radius-card)",
        // legacy aliases
        panel:    "var(--msp-radius-card)",
        "msp-md": "var(--msp-radius-control)",
        "msp-lg": "var(--msp-radius-card)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
