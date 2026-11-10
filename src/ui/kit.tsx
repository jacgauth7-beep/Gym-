/** Composants de base du design de l'app. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, CircleHelp, Minus, Plus } from './icons';
import { Sheet } from './overlay';
import { fmt, fmtClock } from '../lib/util';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---------------------------------------------------------------- en-têtes

export function PageHeader({ eyebrow, title, right, children }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-4 pt-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h1 className="title-xl break-words">{title}</h1>
        </div>
        {right && <div className="flex shrink-0 items-center gap-2 pt-1">{right}</div>}
      </div>
      {children}
    </header>
  );
}

export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-end justify-between gap-2 px-1">
      <h2 className="eyebrow">{title}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- boutons

export function IconButton({
  label,
  onClick,
  children,
  className,
  disabled
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button className={cx('btn btn-icon btn-secondary rounded-full', className)} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- sélecteurs

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  tone = 'accent',
  ariaLabel
}: {
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'accent' | 'neutral';
  ariaLabel?: string;
}) {
  const h = size === 'lg' ? 'min-h-[46px] text-[15px]' : size === 'sm' ? 'min-h-[32px] text-xs' : 'min-h-[38px] text-sm';
  return (
    <div className="flex gap-1 rounded-2xl bg-raised p-1" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex-1 rounded-xl px-2 font-semibold transition duration-150',
              h,
              on ? (tone === 'accent' ? 'bg-accent text-white shadow-sm shadow-black/30' : 'bg-hover text-ink shadow-sm shadow-black/20') : 'text-mute active:bg-hover/60'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button className="flex min-h-[52px] w-full items-center justify-between gap-3 text-left" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span className={cx('relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-good' : 'bg-hover')}>
        <span className={cx('absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-all duration-200', checked ? 'left-[23px]' : 'left-[3px]')} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- champs

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export const parseNum = (s: string): number | null => {
  const v = parseFloat(s.replace(',', '.'));
  return isFinite(v) ? v : null;
};

export function NumInput({
  value,
  onChange,
  placeholder,
  className = '',
  ariaLabel
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => {
    if (parseNum(txt) !== value) setTxt(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={cx('input num', className)}
      inputMode="decimal"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        onChange(parseNum(e.target.value));
      }}
    />
  );
}

/** Maintenir le bouton répète l'action (utile pour monter vite une charge). */
function useHoldRepeat(fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const delay = useRef<number>();
  const loop = useRef<number>();
  const repeated = useRef(false);
  const stop = () => {
    window.clearTimeout(delay.current);
    window.clearInterval(loop.current);
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: () => {
      repeated.current = false;
      stop();
      delay.current = window.setTimeout(() => {
        repeated.current = true;
        loop.current = window.setInterval(() => fnRef.current(), 85);
      }, 450);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // Le clic simple fait un pas ; après une répétition on ignore le clic de relâchement.
    onClick: () => {
      if (!repeated.current) fnRef.current();
      repeated.current = false;
    }
  };
}

const snap = (x: number) => Math.round(x * 100) / 100;

/** [−] valeur [+] : ajuster sans clavier. Toucher la valeur permet de la taper. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 99999,
  label,
  unit,
  format = (v: number) => fmt(v, 2),
  placeholder = '–',
  ariaLabel,
  size = 'lg'
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: ReactNode;
  unit?: ReactNode;
  format?: (v: number) => string;
  placeholder?: string;
  ariaLabel: string;
  size?: 'md' | 'lg';
}) {
  const [editing, setEditing] = useState(false);
  const [txt, setTxt] = useState('');
  const bump = (dir: 1 | -1) => onChange(Math.min(max, Math.max(min, snap((value ?? 0) + dir * step))));
  const minus = useHoldRepeat(() => bump(-1));
  const plus = useHoldRepeat(() => bump(1));
  const commit = () => {
    setEditing(false);
    const v = parseNum(txt);
    if (txt.trim() === '') onChange(null);
    else if (v != null) onChange(Math.min(max, Math.max(min, v)));
  };
  const big = size === 'lg';
  return (
    <div>
      {label && <div className="eyebrow mb-1.5">{label}</div>}
      <div className={cx('flex items-stretch rounded-2xl bg-raised', big ? 'h-[56px]' : 'h-[46px]')}>
        <button className="flex w-12 shrink-0 items-center justify-center rounded-l-2xl text-mute active:bg-hover" aria-label={`${ariaLabel} : moins`} {...minus}>
          <Minus size={20} />
        </button>
        {editing ? (
          <input
            className={cx('num min-w-0 flex-1 bg-transparent text-center font-bold text-ink outline-none', big ? 'text-[24px]' : 'text-lg')}
            style={{ fontSize: big ? 24 : 18 }}
            inputMode="decimal"
            autoFocus
            aria-label={ariaLabel}
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button
            className="flex min-w-0 flex-1 flex-col items-center justify-center leading-none"
            aria-label={`${ariaLabel} : ${value == null ? 'vide' : format(value)}. Toucher pour saisir.`}
            onClick={() => {
              setTxt(value == null ? '' : String(value));
              setEditing(true);
            }}
          >
            <span className={cx('num font-bold', big ? 'text-[24px]' : 'text-lg', value == null && 'text-faint')}>{value == null ? placeholder : format(value)}</span>
            {unit && <span className="mt-0.5 text-[11px] font-medium text-faint">{unit}</span>}
          </button>
        )}
        <button className="flex w-12 shrink-0 items-center justify-center rounded-r-2xl text-mute active:bg-hover" aria-label={`${ariaLabel} : plus`} {...plus}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- indicateurs

export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  children,
  tone = 'accent'
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  tone?: 'accent' | 'good' | 'gold';
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  const color = tone === 'good' ? 'rgb(var(--good))' : tone === 'gold' ? 'rgb(var(--gold))' : 'rgb(var(--accent))';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--hover))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'good'; className?: string }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-hover', className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', tone === 'good' ? 'bg-good' : 'bg-brand')} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Petite courbe sans axes pour les listes. */
export function Sparkline({ values, width = 64, height = 26, tone = 'accent' }: { values: number[]; width?: number; height?: number; tone?: 'accent' | 'good' | 'warn' | 'bad' | 'mute' }) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 3;
  const pts = values.map((v, i) => [pad + (i * (width - 2 * pad)) / (values.length - 1), height - pad - ((v - lo) / span) * (height - 2 * pad)] as const);
  const color = `rgb(var(--${tone === 'mute' ? 'faint' : tone}))`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}

/** Points de progression des sets d'un exercice. */
export function SetDots({ done, total }: { done: number; total: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${done} set(s) sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('h-2 w-2 rounded-full', i < done ? 'bg-good' : 'bg-hover')} />
      ))}
    </span>
  );
}

export function Stat({ label, value, unit, tone }: { label: ReactNode; value: ReactNode; unit?: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'gold' | 'accent' }) {
  return (
    <div className="inset min-w-0 px-3 py-2.5">
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cx('num text-[22px] font-bold leading-7', tone && `text-${tone}`)}>{value}</span>
        {unit && <span className="truncate text-xs text-faint">{unit}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- listes

export function ListGroup({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section>
      {title && <SectionHeader title={title} />}
      <div className="card divide-y divide-line/60 overflow-hidden">{children}</div>
      {footer && <p className="mt-2 px-1 text-xs leading-relaxed text-faint">{footer}</p>}
    </section>
  );
}

export function ListRow({
  icon,
  iconTone = 'accent',
  title,
  subtitle,
  value,
  onClick,
  href,
  chevron,
  danger,
  right
}: {
  icon?: ReactNode;
  iconTone?: 'accent' | 'good' | 'warn' | 'bad' | 'gold' | 'mute';
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
  danger?: boolean;
  right?: ReactNode;
}) {
  const body = (
    <>
      {icon && <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', `tone-${iconTone}`)}>{icon}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className={cx('block truncate text-[15px] font-medium', danger && 'text-bad')}>{title}</span>
        {subtitle && <span className="block truncate text-xs text-faint">{subtitle}</span>}
      </span>
      {value != null && <span className="num shrink-0 text-sm text-mute">{value}</span>}
      {right}
      {(chevron ?? !!(onClick || href)) && !right && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </>
  );
  const cls = 'flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 active:bg-raised/60';
  if (href)
    return (
      <a className={cls} href={href}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button className={cls} onClick={onClick}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="tone-accent mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">{icon}</div>
      <h3 className="headline">{title}</h3>
      {children && <p className="mt-1.5 text-sm leading-relaxed text-mute">{children}</p>}
      {action && <div className="mt-5 w-full">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- pourquoi ?

/** Ouvre un panneau qui explique un calcul en langage simple. */
export function WhyButton({
  title = 'Pourquoi ?',
  lines,
  label,
  className,
  children
}: {
  title?: string;
  lines: string[];
  label?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!lines.length && !children) return null;
  return (
    <>
      <button className={cx('inline-flex items-center gap-1 text-xs font-semibold text-accent', className)} onClick={() => setOpen(true)} aria-label={title}>
        <CircleHelp size={14} />
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} closeLabel="Compris">
        <WhyList lines={lines} />
        {children}
      </Sheet>
    </>
  );
}

export function WhyList({ lines }: { lines: string[] }) {
  return (
    <ol className="space-y-2.5">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-mute">
          <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-bold text-faint">{i + 1}</span>
          <span>{l}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- repos

const REST_PRESETS = [60, 90, 120, 150, 180, 210, 240, 300];

/** Choix du temps de repos : préréglages en un tap + ajustement à 15 s. `null` = valeur par défaut. */
export function RestPicker({ value, onChange, defaultSec, defaultLabel }: { value: number | null; onChange: (v: number | null) => void; defaultSec: number; defaultLabel: string }) {
  const cur = value ?? defaultSec;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button className="btn btn-secondary w-16" onClick={() => onChange(Math.max(15, cur - 15))} aria-label="Moins 15 secondes">
          −15
        </button>
        <div className="flex-1 text-center">
          <div className="num text-4xl font-bold">{fmtClock(cur)}</div>
          <div className="text-xs text-faint">{value == null ? defaultLabel : 'personnalisé'}</div>
        </div>
        <button className="btn btn-secondary w-16" onClick={() => onChange(cur + 15)} aria-label="Plus 15 secondes">
          +15
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {REST_PRESETS.map((s) => (
          <button key={s} onClick={() => onChange(s)} className={cx('btn btn-sm num px-0', value === s ? 'bg-accent text-white' : 'btn-secondary')}>
            {fmtClock(s)}
          </button>
        ))}
      </div>
      {value != null && (
        <button className="btn btn-ghost btn-sm w-full" onClick={() => onChange(null)}>
          Revenir au {defaultLabel} ({fmtClock(defaultSec)})
        </button>
      )}
    </div>
  );
}
