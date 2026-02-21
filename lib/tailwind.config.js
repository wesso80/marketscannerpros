/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        msp: {
          bg: "var(--msp-bg)",
          card: "var(--msp-card)",
          panel: "var(--msp-panel)",
          border: "var(--msp-border)",
          borderStrong: "var(--msp-border-strong)",
          text: "var(--msp-text)",
          "text-muted": "var(--msp-text-muted)",
          muted: "var(--msp-text-muted)",
          accent: "var(--msp-accent)",
          accentHover: "var(--msp-accent-hover)",
          accentGlow: "var(--msp-accent-glow)",
          bull: "var(--msp-bull)",
          bear: "var(--msp-bear)",
          warn: "var(--msp-warn)",
          warnTint: "var(--msp-warn-tint)",
          neutral: "var(--msp-neutral)",
        },
      },
      boxShadow: {
        "msp-glow": "0 0 0 3px var(--msp-accent-glow)",
        "msp-soft": "0 10px 30px rgba(0,0,0,0.28)",
        msp: "var(--msp-shadow)",
      },
      borderRadius: {
        panel: "12px",
        "msp-md": "12px",
        "msp-lg": "14px",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
