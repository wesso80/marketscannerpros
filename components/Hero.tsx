'use client';

import Image from 'next/image';

export default function HeroShot() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-2 md:rounded-2xl md:p-3"
      style={{
        boxShadow:
          '0 0 0 1px rgba(16,185,129,.08), 0 20px 60px -15px rgba(0,0,0,.5), 0 10px 30px -10px rgba(0,0,0,.4)',
      }}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md md:rounded-xl">
        <Image
          src="/marketing/hero-dashboard.png"
          alt="MarketScannerPros dashboard preview"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1200px"
          className="object-cover"
        />
      </div>
    </div>
  );
}

}
