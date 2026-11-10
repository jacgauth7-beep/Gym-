import { MAJOR_MUSCLES } from '../types';
import { fmt } from '../lib/util';
import { cx } from '../ui/kit';

export interface MuscleRow {
  muscle: string;
  sets: number;
  /** Séances par semaine (facultatif). */
  freq?: number;
}

/**
 * Sets durs par muscle, avec la zone conseillée en fond.
 * Les muscles suivis par le coach sont en couleur ; les autres (travail surtout indirect) sont en gris.
 */
export function MuscleBars({ rows, low, high, unit = 'sets' }: { rows: MuscleRow[]; low: number; high: number; unit?: string }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => Number(MAJOR_MUSCLES.has(b.muscle)) - Number(MAJOR_MUSCLES.has(a.muscle)) || b.sets - a.sets);
  const max = Math.max(high * 1.2, ...sorted.map((r) => r.sets));
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div role="table" aria-label={`Sets durs par muscle, zone conseillée ${low} à ${high}`}>
      <div className="mb-1 flex text-[10px] font-semibold uppercase tracking-wide text-faint" aria-hidden>
        <span className="w-[120px] shrink-0" />
        <span className="relative h-4 flex-1">
          <span className="absolute -translate-x-1/2" style={{ left: pct(low) }}>
            {low}
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: pct(high) }}>
            {high}
          </span>
        </span>
        <span className="w-[70px] shrink-0" />
      </div>
      <ul className="space-y-1.5">
        {sorted.map((r) => {
          const major = MAJOR_MUSCLES.has(r.muscle);
          const under = major && r.sets < low - 0.25;
          return (
            <li key={r.muscle} className="flex items-center" role="row">
              <span className={cx('w-[120px] shrink-0 truncate pr-2 text-[13px]', major ? 'text-ink' : 'text-faint')} role="cell">
                {r.muscle}
              </span>
              <span className="relative h-[22px] flex-1 overflow-hidden rounded-md bg-raised/70" role="cell">
                <span className="absolute inset-y-0 border-x border-good/40 bg-good/10" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
                <span
                  className={cx('absolute inset-y-[3px] left-0 rounded-r-[5px] transition-all duration-500', major ? 'bg-accent' : 'bg-faint/50')}
                  style={{ width: r.sets > 0 ? `max(4px, ${pct(r.sets)})` : 0 }}
                />
              </span>
              <span className="num w-[70px] shrink-0 whitespace-nowrap pl-2 text-right text-[13px]" role="cell">
                <span className={cx('font-bold', under ? 'text-warn' : major ? 'text-ink' : 'text-mute')}>{fmt(r.sets)}</span>
                {r.freq != null && <span className="text-faint"> · {r.freq}×</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
        Bande verte : zone conseillée de {low} à {high} {unit} par semaine. En gris : muscles surtout travaillés indirectement, que le coach ne surveille pas.
      </p>
    </div>
  );
}
