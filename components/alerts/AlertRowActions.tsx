"use client";
export default function AlertRowActions({
  label,
  active,
  onEdit,
  onToggle,
  onDelete,
}: {
  label: string;
  active: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <details className="relative">
      <summary
        aria-label={`Actions for ${label}`}
        className="flex min-h-10 min-w-10 cursor-pointer list-none items-center justify-center rounded border border-slate-600 text-lg [&::-webkit-details-marker]:hidden"
      >
        …
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-lg border border-slate-600 bg-slate-950 p-1 shadow-xl">
        {[
          { name: "Edit", action: onEdit },
          { name: active ? "Pause" : "Arm", action: onToggle },
          { name: "Delete", action: onDelete },
        ].map((item) => (
          <button
            key={item.name}
            type="button"
            className="block min-h-10 w-full rounded px-3 text-left text-sm hover:bg-white/10"
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              item.action();
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
    </details>
  );
}
