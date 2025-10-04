// components/HeroShot.tsx
"use client";

export default function HeroShot() {
  return (
    <div
      className="relative rounded-lg md:rounded-2xl border border-neutral-800 bg-neutral-900 p-2 md:p-3 w-full overflow-hidden"
      style={{
        maxWidth: "100%",
        boxShadow:
          "0 0 0 1px rgba(16,185,129,.08), 0 20px 60px -15px rgba(0,0,0,.5), 0 10px 30px -10px rgba(0,0,0,.4)",
      }}
    >
      <img
        src="/marketing/hero-dashboard.png"
        alt="MarketScanner dashboard preview"
        className="rounded-md md:rounded-xl w-full h-auto"
        style={{ display: 'block' }}
      />
    </div>
  );
}
