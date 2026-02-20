import { ReactNode } from 'react';

type LayerSectionProps = {
  title: string;
  tone: 'context' | 'setup' | 'execution';
  right?: ReactNode;
  children: ReactNode;
};

export default function LayerSection(props: LayerSectionProps) {
  const toneRing =
    props.tone === 'context' ? 'ring-sky-500/20' : props.tone === 'setup' ? 'ring-teal-500/20' : 'ring-fuchsia-500/20';

  const toneTitle =
    props.tone === 'context' ? 'text-sky-200' : props.tone === 'setup' ? 'text-teal-200' : 'text-fuchsia-200';

  return (
    <section className={`rounded-2xl border border-white/5 bg-white/3 p-5 ring-1 ${toneRing}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`text-sm font-semibold uppercase tracking-wide ${toneTitle}`}>{props.title}</h2>
        <div>{props.right}</div>
      </div>
      {props.children}
    </section>
  );
}
