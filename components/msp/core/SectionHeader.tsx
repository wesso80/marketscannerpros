type SectionHeaderProps = {
  title: string;
  subtitle?: string;
};

export default function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-[var(--msp-text)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--msp-muted)]">{subtitle}</p>}
    </div>
  );
}
