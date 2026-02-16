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
          panel2: "var(--msp-panel-2)",
          border: "var(--msp-border)",
          borderStrong: "var(--msp-border-strong)",
          divider: "var(--msp-divider)",
          text: "var(--msp-text)",
          muted: "var(--msp-text-muted)",
          faint: "var(--msp-text-faint)",
          accent: "var(--msp-accent)",
          accentHover: "var(--msp-accent-hover)",
          bull: "var(--msp-bull)",
          bullTint: "var(--msp-bull-tint)",
          bear: "var(--msp-bear)",
          bearTint: "var(--msp-bear-tint)",
          warn: "var(--msp-warn)",
          warnTint: "var(--msp-warn-tint)",
          neutral: "var(--msp-neutral)",
        },
      },
      boxShadow: {
        msp: "var(--msp-shadow)",
      },
      borderRadius: {
        msp: "14px",
        panel: "12px",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"), // <<— ENABLE TYPOGRAPHY
  ],
};
