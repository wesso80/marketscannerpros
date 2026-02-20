type GETagProps = {
  tone: 'green' | 'red' | 'amber' | 'slate';
  text: string;
};

export default function GETag({ tone, text }: GETagProps) {
  const cls =
    tone === 'green'
      ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/25'
      : tone === 'red'
      ? 'bg-rose-500/15 text-rose-200 ring-rose-500/25'
      : tone === 'amber'
      ? 'bg-amber-500/15 text-amber-200 ring-amber-500/25'
      : 'bg-slate-500/20 text-slate-200 ring-slate-500/25';

  return <span className={`rounded-full px-2 py-1 text-xs ring-1 ${cls}`}>{text}</span>;
}
