import GETag from '@/src/features/goldenEgg/components/shared/GETag';
import { GoldenEggPayload } from '@/src/features/goldenEgg/types';

type GEFlipConditionsProps = {
  items: GoldenEggPayload['layer1']['flipConditions'];
};

export default function GEFlipConditions({ items }: GEFlipConditionsProps) {
  const toneOf = (severity: 'must' | 'should' | 'nice') =>
    severity === 'must' ? 'red' : severity === 'should' ? 'amber' : 'slate';

  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="text-slate-100">{item.text}</span>
            <GETag tone={toneOf(item.severity)} text={item.severity.toUpperCase()} />
          </div>
        </li>
      ))}
    </ul>
  );
}
