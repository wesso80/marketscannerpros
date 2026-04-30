/** Versatile loading skeleton set. */

export function SkeletonLine({ w = 'w-full', h = 'h-4', className = '' }: { w?: string; h?: string; className?: string }) {
  return <div className={`${h} ${w} animate-pulse rounded bg-slate-700/50 ${className}`} />;
}

export function SkeletonCard({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-950/40 p-4 ${className}`}>
      <SkeletonLine w="w-32" h="h-3" className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonLine key={i} h="h-5" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ cols = 5, rows = 6, className = '' }: { cols?: number; rows?: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-slate-800 ${className}`}>
      <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonLine key={i} w="w-16" h="h-3" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-slate-800/60 px-4 py-2.5 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <SkeletonLine key={j} w="w-16" h="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Inline metric tile skeleton */
export function SkeletonMetric({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-md border border-white/10 bg-slate-950/45 px-3 py-2 ${className}`}>
      <SkeletonLine w="w-20" h="h-2.5" className="mb-2" />
      <SkeletonLine w="w-16" h="h-5" className="mb-1" />
      <SkeletonLine w="w-24" h="h-2.5" />
    </div>
  );
}

/** Default export: a simple line skeleton */
export default SkeletonCard;
