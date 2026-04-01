import { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
};

export default function AdminCard({ title, children, className = "", actions }: Props) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#101826] p-4 shadow-sm ${className}`}>
      {title ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-white/90">{title}</div>
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}
