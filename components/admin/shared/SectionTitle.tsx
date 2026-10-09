type Props = {
  title: string;
  subtitle?: string;
};

export default function SectionTitle({ title, subtitle }: Props) {
  return (
    <div className="admin-design-title mb-3">
      <div className="text-sm font-semibold text-white/90">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-white/45">{subtitle}</div> : null}
    </div>
  );
}
