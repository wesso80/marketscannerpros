import Image from "next/image";

export default function HeroShot() {
  return (
    <div className="grid gap-3">
      <div className="relative h-40 md:h-48 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_20px_50px_-20px_rgba(0,0,0,0.6)]">
        <Image src="/marketing/hero-top.png" alt="Scanner" fill className="rounded-xl object-cover" priority sizes="(min-width:768px) 560px, 100vw" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="relative h-56 md:h-64 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_20px_50px_-20px_rgba(0,0,0,0.6)]">
          <Image src="/marketing/hero-left.png" alt="Chart left" fill className="rounded-xl object-cover" sizes="(min-width:768px) 270px, 48vw" />
        </div>
        <div className="relative h-56 md:h-64 rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_20px_50px_-20px_rgba(0,0,0,0.6)]">
          <Image src="/marketing/hero-right.png" alt="Chart right" fill className="rounded-xl object-cover" sizes="(min-width:768px) 270px, 48vw" />
        </div>
      </div>
    </div>
  );
}
