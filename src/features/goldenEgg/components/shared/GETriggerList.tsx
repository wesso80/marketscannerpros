type GETriggerListProps = {
  title: string;
  items: string[];
};

export default function GETriggerList({ title, items }: GETriggerListProps) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-100">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
