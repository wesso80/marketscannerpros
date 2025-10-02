// components/HeroShot.tsx
"use client";
import Image from "next/image";
import { useState } from "react";

export default function HeroShot() {
  const [imgError, setImgError] = useState(false);
  const src = imgError ? "/marketing/hero-top.svg" : "/marketing/hero-top.png";

  return (
    <div
      className="relative rounded-2xl border border-neutral-800 bg-white p-3 md:justify-self-end"
      style={{
        width: "100%",
        maxWidth: "100%",
        aspectRatio: "16 / 9",
        boxShadow:
          "0 0 0 1px rgba(16,185,129,.08), 0 30px 80px -20px rgba(0,0,0,.6)",
      }}
    >
      <Image
        src={src}
        alt="MarketScanner dashboard preview"
        width={960}
        height={540}
        className="w-full h-full rounded-xl object-cover"
        sizes="(min-width: 768px) 640px, 100vw"
        onError={() => setImgError(true)}
        priority
      />
    </div>
  );
}
