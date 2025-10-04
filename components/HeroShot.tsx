'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function HeroShot() {
  const [imgError, setImgError] = useState(false);
  const src = imgError ? '/marketing/hero-top.svg' : '/marketing/hero-dashboard.png';

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-2 md:rounded-2xl md:p-3 mx-auto"
      style={{
        maxWidth: '100%',
        boxShadow:
          '0 0 0 1px rgba(16,185,129,.08), 0 20px 60px -15px rgba(0,0,0,.5), 0 10px 30px -10px rgba(0,0,0,.4)',
      }}
    >
      {/* Lock aspect so it doesn't get too tall and push content */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md md:rounded-xl">
        <Image
          src={src}
          alt="MarketScannerPros dashboard preview"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1200px"
          className="object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    </div>
  );
}
