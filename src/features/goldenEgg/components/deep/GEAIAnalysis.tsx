type Props = { analysis: string };

export default function GEAIAnalysis({ analysis }: Props) {
  // Split by known section headers to apply styling
  const sections = analysis.split(/(?=📊|📈|📰|🎯|⚠️|💡)/g).filter(Boolean);

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-white/5 pb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-400">AI Deep Analysis</h2>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">GPT-4o</span>
      </div>

      <div className="space-y-4">
        {sections.map((section, i) => {
          const lines = section.trim().split('\n');
          const heading = lines[0];
          const body = lines.slice(1).join('\n').trim();

          // Check if the section starts with an emoji header
          const isHeader = /^[📊📈📰🎯⚠️💡]/.test(heading);

          if (isHeader) {
            // Detect verdict section for special styling
            const isVerdict = heading.includes('GOLDEN EGG VERDICT') || heading.includes('💡');
            return (
              <div key={i}>
                <h3 className={`text-sm font-bold ${isVerdict ? 'text-amber-400' : 'text-slate-100'}`}>{heading}</h3>
                {body && (
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">{body}</p>
                )}
              </div>
            );
          }

          return (
            <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{section.trim()}</p>
          );
        })}
      </div>
    </div>
  );
}
