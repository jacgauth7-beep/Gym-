import { isDone } from '../../lib/engine';
import { DAY_MS, startOfDay, weekStart } from '../../lib/util';
import type { ProgramDay, Session } from '../../types';
import { Check } from '../../ui/icons';
import { cx } from '../../ui/kit';

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** La semaine en un coup d'œil : jours faits, jours prévus, aujourd'hui. */
export function WeekStrip({ sessions, days, now = Date.now() }: { sessions: Session[]; days: ProgramDay[]; now?: number }) {
  const start = weekStart(now);
  const today = startOfDay(now);
  const cells = LETTERS.map((letter, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const t = d.getTime();
    const dow = d.getDay();
    const done = sessions.some((s) => startOfDay(s.startedAt) === t && s.exercises.some((e) => e.sets.some(isDone)));
    const planned = days.some((p) => p.weekdays.includes(dow));
    return { letter, t, done, planned, isToday: t === today, past: t < today, num: d.getDate() };
  });
  const doneCount = cells.filter((c) => c.done).length;
  const plannedCount = cells.filter((c) => c.planned).length;
  return (
    <div className="flex items-center gap-3" aria-label={`${doneCount} séance(s) cette semaine${plannedCount ? ` sur ${plannedCount} prévues` : ''}`}>
      <div className="flex flex-1 justify-between">
        {cells.map((c) => (
          <div key={c.t} className="flex flex-col items-center gap-1.5">
            <span className={cx('text-[10px] font-semibold', c.isToday ? 'text-accent' : 'text-faint')}>{c.letter}</span>
            <span
              className={cx(
                'num flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                c.done ? 'bg-good text-black' : c.isToday ? 'bg-accent/15 text-accent ring-2 ring-accent' : c.planned ? (c.past ? 'bg-raised text-faint line-through' : 'bg-raised text-mute') : 'text-faint/60'
              )}
            >
              {c.done ? <Check size={15} strokeWidth={3} /> : c.num}
            </span>
          </div>
        ))}
      </div>
      {plannedCount > 0 && (
        <div className="shrink-0 pl-1 text-right">
          <div className="num text-[22px] font-bold leading-none">
            {doneCount}
            <span className="text-sm font-semibold text-faint">/{plannedCount}</span>
          </div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-faint">cette sem.</div>
        </div>
      )}
    </div>
  );
}

export const daysSince = (ts: number, now = Date.now()) => Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
