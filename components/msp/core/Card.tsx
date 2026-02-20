import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
};

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl border border-[var(--msp-border)] bg-[var(--msp-panel)] p-5 ${className}`}>
      {children}
    </div>
  );
}
