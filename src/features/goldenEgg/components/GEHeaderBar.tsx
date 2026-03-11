export default function GEHeaderBar() {
  return (
    <div className="border-b border-amber-500/10 bg-slate-950/80">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-8 text-center">
        <div className="mx-auto mb-3 h-16 w-16">
          <img src="/assets/scanners/golden-egg.png" alt="Golden Egg" className="h-full w-full object-contain" />
        </div>
        <h1 className="text-2xl font-bold">
          <span className="bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">The Golden Egg</span>
        </h1>
        <p className="mt-2 text-sm text-slate-400">Complete market analysis &bull; Any asset &bull; One search</p>
      </div>
    </div>
  );
}
