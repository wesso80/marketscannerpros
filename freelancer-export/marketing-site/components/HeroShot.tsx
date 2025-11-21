// components/HeroShot.tsx
"use client";
import Image from "next/image";

export default function HeroShot() {
  return (
    <div
      className="relative rounded-lg md:rounded-xl border border-neutral-800 bg-neutral-900 p-2 w-full overflow-hidden mx-auto"
      style={{
        maxWidth: "250px",
        boxShadow:
          "0 0 0 1px rgba(16,185,129,.08), 0 20px 60px -15px rgba(0,0,0,.5), 0 10px 30px -10px rgba(0,0,0,.4)",
      }}
    >
      <Image
        src="/hero-image.png"
        alt="MarketScanner dashboard preview"
        width={1024}
        height={720}
        className="rounded-md w-full h-auto mx-auto"
        priority
      />
    </div>
  );
}
