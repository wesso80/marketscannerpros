// components/HeroShot.tsx
"use client";
import Image from "next/image";
import { useState } from "react";

export default function HeroShot() {
  const [imgError, setImgError] = useState(false);
  const src = imgError ? "/marketing/hero-top.svg" : "/marketing/hero-dashboard.png";

  return (
    <div
      className="relative rounded-lg md:rounded-2xl border border-neutral-800 bg-neutral-900 p-2 md:p-3 w-full overflow-hidden"
      style={{
        maxWidth: "100%",
        boxShadow:
          "0 0 0 1px rgba(16,185,129,.08), 0 20px 60px -15px rgba(0,0,0,.5), 0 10px 30px -10px rgba(0,0,0,.4)",
      }}
    >
      <Image
        src={src}
        alt="MarketScanner dashboard preview"
        width={960}
        height={540}
        className="w-full h-auto rounded-md md:rounded-xl"
        style={{ display: 'block', maxWidth: '100%' }}
        sizes="(min-width: 768px) 640px, 100vw"
        onError={() => setImgError(true)}
        priority
      />
    </div>
  );
}
