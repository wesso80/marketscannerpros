// components/SocialProof.tsx
import Image from "next/image";

const logos = [
  { src: "/logos/reddit.svg",        alt: "Reddit" },
  { src: "/logos/indiehackers.svg",  alt: "Indie Hackers" },
  { src: "/logos/producthunt.svg",   alt: "Product Hunt" },
  { src: "/logos/appstore.svg",      alt: "App Store" },
  { src: "/logos/googleplay.svg",    alt: "Google Play" },
];

export default function SocialProof() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <p className="mb-8 text-center text-xs uppercase tracking-wide text-neutral-500">
          As seen on
        </p>

        <div className="grid grid-cols-2 items-center justify-items-center gap-8 sm:grid-cols-3 md:grid-cols-5">
          {logos.map((l) => (
            <Image
              key={l.alt}
              src={l.src}
              alt={l.alt}
              width={160}
              height={32}
              className="opacity-70 hover:opacity-100 transition"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
