"use client";
import Image from "next/image";
import { useState } from "react";

export default function HeroShot() {
  const [err, setErr] = useState(false);

  return (
    <div className="mx-auto">
      <div
        className={[
          "mx-auto",
          "max-w-[420px] sm:max-w-[520px] md:max-w-[620px] lg:max-w-[720px] xl:max-w-[820px]",
          "aspect-[16/10] sm:aspect-[16/9] md:aspect-[16/9] lg:aspect-[16/9]",
          "relative",
        ].join(" ")}
      >
        <div className="absolute inset-0 rounded-2xl bg-white/95 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-black/10 overflow-hidden" />
        {!err ? (
          <Image
            src="/marketing/hero-top.png"
            alt="MarketScanner Pros — product preview"
            fill
            priority
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 60vw, 800px"
            className="object-contain p-2"
            onError={() => setErr(true)}
          />
        ) : (
          <svg className="w-full h-full p-6" viewBox="0 0 600 360" role="img" aria-label="Preview placeholder">
            <defs>
              <linearGradient id="g" x1="0" x2="1">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" rx="16" fill="url(#g)" opacity="0.15" />
            <g textAnchor="middle" fill="#fff" opacity="0.9">
              <text x="300" y="180" fontSize="22" fontWeight="700">MarketScanner Pros</text>
              <text x="300" y="210" fontSize="14" opacity="0.8">Preview placeholder</text>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
