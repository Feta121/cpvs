import { useEffect, useRef, useState, Children, isValidElement } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface OptionElement {
  value: string;
  label: React.ReactNode;
}

/**
 * Drop-in themed replacement for a native <select>. Deliberately mirrors
 * the native API as closely as possible — value / onChange(value) /
 * children as <option value="..">Label</option> — so every existing call
 * site only needs its tag renamed and its onChange signature simplified
 * (native passes an event; this passes the value directly), rather than
 * restructuring each page's option-list logic.
 *
 * WHY THIS EXISTS: a native <select>'s closed-state trigger can be styled
 * with CSS same as any element, but the open dropdown *panel* is rendered
 * entirely by the OS/browser (especially obvious on Android Chrome, which
 * shows its own plain gray/blue bottom sheet) — no CSS reaches it at all.
 * The only way to get a themed dropdown is to not use a native <select>
 * for the open panel in the first place.
 */
export default function Select({
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  placeholder,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Smaller trigger (used for inline per-row dropdowns in tables, e.g.
   * the attendance status corrector) instead of the standard form-field
   * sizing used everywhere else. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const options: OptionElement[] = Children.toArray(children)
    .filter((child): child is React.ReactElement<{ value: string | number; children?: React.ReactNode }> => isValidElement(child))
    // String(...) here matters: some call sites pass a number as the
    // option value (e.g. a Year selector), but `value` (the controlled
    // prop) is always a string — without coercing both sides to the same
    // type, "1" === 1 is false and nothing would ever show as selected.
    .map((child) => ({ value: String(child.props.value), label: child.props.children }));

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? 'rounded-lg border border-surface-line bg-surface px-2 py-1 text-xs text-ink-900' : 'input-field'
        }`}
      >
        <span className={`truncate ${!selected ? 'text-ink-400' : ''}`}>{selected?.label ?? placeholder ?? ''}</span>
        <ChevronDown size={compact ? 12 : 15} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-surface-line bg-surface p-1 shadow-lift">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  isSelected ? 'bg-clinical-50 text-clinical-700' : 'text-ink-700 hover:bg-surface-muted'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={14} className="shrink-0 text-clinical-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
