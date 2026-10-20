import { useEffect, useState, type ReactNode } from 'react';

/** Panneau qui monte du bas de l'écran (zone du pouce). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[88vh] overflow-y-auto rounded-t-3xl bg-card border-t border-line pb-safe">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
            Fermer
          </button>
        </div>
        <div className="px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}

/** Bloc « Pourquoi ? » dépliable. */
export function Why({ lines, label = 'Pourquoi ?', defaultOpen = false }: { lines: string[]; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!lines.length) return null;
  return (
    <div className="mt-1">
      <button className="text-xs font-medium text-accent py-1" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        <ul className="mt-1 space-y-1 text-xs text-mute list-disc pl-4">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md'
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'md' | 'lg';
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-bg p-1 border border-line">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg font-semibold transition ${size === 'lg' ? 'min-h-[48px] text-base' : 'min-h-[40px] text-sm'} ${
            value === o.value ? 'bg-accent text-white' : 'text-mute active:bg-line/50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function NumInput({
  value,
  onChange,
  step,
  placeholder,
  className = ''
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = parseFloat(txt.replace(',', '.'));
    if ((value == null && txt !== '') || (value != null && parsed !== value)) setTxt(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={`input ${className}`}
      inputMode="decimal"
      step={step}
      placeholder={placeholder}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        const v = parseFloat(e.target.value.replace(',', '.'));
        onChange(isFinite(v) ? v : null);
      }}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="flex w-full items-center justify-between min-h-[48px]" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span>{label}</span>
      <span className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Confirm(message: string) {
  return window.confirm(message);
}
