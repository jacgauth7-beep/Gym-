import { estimateDayMinutes } from '../../lib/engine';
import { lastSessionOfDay } from '../../lib/session';
import { WEEKDAYS_FR, ago, plural } from '../../lib/util';
import type { Exercise, ProgramDay, Session, Settings } from '../../types';
import { ChevronRight } from '../../ui/icons';
import { cx } from '../../ui/kit';
import { Sheet } from '../../ui/overlay';

/** Choix d'un jour du programme, avec la date de sa dernière séance. */
export function DayPicker({
  open,
  onClose,
  onPick,
  days,
  sessions,
  exMap,
  settings,
  currentId,
  title = 'Choisir une séance'
}: {
  open: boolean;
  onClose: () => void;
  onPick: (day: ProgramDay) => void;
  days: ProgramDay[];
  sessions: Session[];
  exMap: Map<string, Exercise>;
  settings: Settings;
  currentId?: string | null;
  title?: string;
}) {
  const dow = new Date().getDay();
  return (
    <Sheet open={open} onClose={onClose} title={title} closeLabel="Annuler">
      <ul className="space-y-2">
        {days.map((d) => {
          const last = lastSessionOfDay(sessions, d.id);
          const today = d.weekdays.includes(dow);
          return (
            <li key={d.id}>
              <button
                className={cx('flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left active:opacity-80', d.id === currentId ? 'bg-accent/15 ring-1 ring-accent/50' : 'bg-raised/70')}
                onClick={() => onPick(d)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[16px] font-semibold">{d.name}</span>
                    {today && <span className="chip tone-accent">Aujourd’hui</span>}
                  </span>
                  <span className="block truncate text-xs text-faint">
                    {d.weekdays.length > 0 && `${[...d.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((w) => WEEKDAYS_FR[w]).join(', ')} · `}
                    {d.items.length} {plural(d.items.length, 'exercice')} · ≈ {estimateDayMinutes(d, exMap, settings.defaultRestSec)} min
                    {last ? ` · faite ${ago(last.startedAt)}` : ' · jamais faite'}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
