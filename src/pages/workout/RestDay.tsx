import { useBodyweights } from '../../hooks';
import { proteinTarget, toKg } from '../../lib/body';
import { estimateDayMinutes } from '../../lib/engine';
import type { TodayPlan } from '../../lib/session';
import { WEEKDAYS_LONG_FR, fmtDate, plural } from '../../lib/util';
import type { Exercise, ProgramDay, Session, Settings } from '../../types';
import { BedDouble, BookOpen, Dumbbell, Moon, Utensils } from '../../ui/icons';
import { ListRow, PageHeader, SectionHeader } from '../../ui/kit';
import { DailyCheckin } from './DailyCheckin';
import { WeekStrip } from './WeekStrip';

/** Écran des jours sans séance prévue. */
export function RestDay({
  plan,
  sessions,
  days,
  exMap,
  settings,
  onPick
}: {
  plan: Extract<TodayPlan, { kind: 'rest' }>;
  sessions: Session[];
  days: ProgramDay[];
  exMap: Map<string, Exercise>;
  settings: Settings;
  onPick: () => void;
}) {
  const bodyweights = useBodyweights() ?? [];
  const last = bodyweights[bodyweights.length - 1];
  const protein = last ? proteinTarget(toKg(last), settings.goal, settings.engine) : null;
  const next = plan.next;
  const when = next ? (next.inDays === 1 ? 'demain' : WEEKDAYS_LONG_FR[(new Date().getDay() + next.inDays) % 7]) : null;

  return (
    <div>
      <PageHeader eyebrow={fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })} title="Jour de repos" />

      <div className="card mb-3 p-4">
        <WeekStrip sessions={sessions} days={days} />
      </div>
      {settings.dailyCheckin && (
        <div className="mb-3">
          <DailyCheckin settings={settings} />
        </div>
      )}

      <div className="card hero-glow p-5">
        <span className="tone-accent flex h-12 w-12 items-center justify-center rounded-2xl">
          <Moon size={24} />
        </span>
        <h2 className="title-lg mt-4">Aujourd’hui, tu construis.</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-mute">Le muscle se répare et grossit entre les séances. Dors, mange tes protéines, et reviens frais.</p>
        {next && (
          <div className="inset mt-4 flex items-center gap-3 px-3.5 py-3">
            <Dumbbell size={18} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Prochaine séance · {when}</div>
              <div className="truncate text-[15px] font-semibold">{next.day.name}</div>
            </div>
            <span className="num shrink-0 text-xs text-faint">
              {next.day.items.length} {plural(next.day.items.length, 'exo')} · ≈ {estimateDayMinutes(next.day, exMap, settings.defaultRestSec)} min
            </span>
          </div>
        )}
      </div>

      <SectionHeader title="Pour récupérer au mieux" />
      <div className="card divide-y divide-line/60 overflow-hidden">
        <ListRow icon={<BedDouble size={18} />} title={`${settings.engine.sleepTarget} h de sommeil ou plus`} subtitle="Les nuits courtes font baisser la force" href="#/reglages/guide/sommeil" />
        <ListRow
          icon={<Utensils size={18} />}
          iconTone="good"
          title={protein ? `${protein[0]} à ${protein[1]} g de protéines` : 'Assez de protéines'}
          subtitle={protein ? 'Ta cible du jour, répartie sur tes repas' : 'Ajoute une pesée pour voir ta cible en grammes'}
          href="#/progres/corps"
        />
        <ListRow icon={<BookOpen size={18} />} iconTone="mute" title="Guide scientifique" subtitle="Ce que l’app applique, et pourquoi" href="#/reglages/guide" />
      </div>

      <button className="btn btn-secondary btn-lg mt-5 w-full" onClick={onPick}>
        <Dumbbell size={20} /> M’entraîner aujourd’hui
      </button>
    </div>
  );
}
