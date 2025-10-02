// components/SocialProof.tsx
export default function SocialProof() {
  return (
    <section className="border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-xl font-semibold text-neutral-300">Trusted & Featured</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-8 opacity-70">
          <img src="/logos/reddit.svg" alt="Reddit" className="h-8" />
          <img src="/logos/indiehackers.svg" alt="IndieHackers" className="h-8" />
          <img src="/logos/producthunt.svg" alt="ProductHunt" className="h-8" />
          <img src="/logos/appstore.svg" alt="App Store" className="h-10" />
          <img src="/logos/googleplay.svg" alt="Google Play" className="h-10" />
        </div>
        <p className="mt-6 text-sm text-neutral-500">
          No ads • No spam • Cancel anytime
        </p>
      </div>
    </section>
  );
}
