import type { ReactNode } from 'react';

type ToolPageLayoutProps = {
  identity: ReactNode;
  context?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  footer?: ReactNode;
};

export default function ToolPageLayout({ identity, context, primary, secondary, footer }: ToolPageLayoutProps) {
  return (
    <main className="py-6">
      <div className="msp-container" style={{ display: 'grid', gap: 'var(--msp-section-gap)' }}>
        <section>{identity}</section>
        {context ? <section>{context}</section> : null}
        <section>{primary}</section>
        {secondary ? <section>{secondary}</section> : null}
        {footer ? <section>{footer}</section> : null}
      </div>
    </main>
  );
}
