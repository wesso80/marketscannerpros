type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export default function ErrorState({ title = 'Failed to load', message, onRetry, className = '' }: ErrorStateProps) {
  return (
    <div className={`rounded-lg border border-red-500/25 bg-red-500/[0.06] px-4 py-5 ${className}`} role="alert">
      <div className="mb-1 text-sm font-bold text-red-300">{title}</div>
      {message && <p className="text-xs leading-5 text-slate-400">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-red-300 transition hover:bg-red-500/15"
        >
          Retry
        </button>
      )}
    </div>
  );
}
