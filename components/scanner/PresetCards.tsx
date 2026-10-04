'use client';
import { SCAN_TEMPLATES, type ScanTemplate } from './ScanTemplatesBar';

/** One-tap presets. Colour stays neutral until a preset is selected. */
export default function PresetCards({ activeId, onSelect }: { activeId?: string; onSelect: (template: ScanTemplate) => void }) {
  return (
    <div data-preset-cards className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {SCAN_TEMPLATES.map((template) => {
        const active = activeId === template.id;
        return (
          <button
            key={template.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(template)}
            className="min-h-10 rounded-lg border px-3 py-2 text-left text-sm hover:border-[var(--msp-accent)]"
            style={{ borderColor: active ? 'var(--msp-warn)' : 'var(--msp-border)', color: active ? 'var(--msp-warn)' : 'inherit' }}
          >
            <span className="font-semibold">{template.label}</span>
          </button>
        );
      })}
    </div>
  );
}
