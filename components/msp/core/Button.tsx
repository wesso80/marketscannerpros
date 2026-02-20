import type { ReactNode } from 'react';

type ButtonTone = 'primary' | 'secondary' | 'danger';

type ButtonProps = {
  children: ReactNode;
  tone?: ButtonTone;
  disabled?: boolean;
};

const toneClass: Record<ButtonTone, string> = {
  primary: 'border-[var(--msp-accent)] bg-[var(--msp-accent)]/15 text-[var(--msp-accent)]',
  secondary: 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text)]',
  danger: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export default function Button({ children, tone = 'secondary', disabled = false }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`h-10 rounded-lg border px-4 text-sm font-semibold ${toneClass[tone]} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {children}
    </button>
  );
}
