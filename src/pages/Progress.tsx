import { useMemo, useState } from 'react';
import { Coach } from '../components/Coach';
import { MuscleBars } from '../components/MuscleBars';
import { StatusBadge } from '../components/StatusBadge';
import { useBodyweights, useCheckins, useDays, useExercises, useSessions } from '../hooks';
import { bodySeries, bodyweightTrend } from '../lib/body';
import { STATUS_TONE, isDone, weeklyMuscleStats } from '../lib/engine';
import { analyzeExercises, buildInsights, weekSummary, type AnalysisInput } from '../lib/insights';
import { DAY_MS, WEEK_MS, fmt, fmtDay, fmtDuration, fmtSigned, plural, weekStart } from '../lib/util';
import type { Settings } from '../types';
import { ChevronLeft, ChevronRight, Flame, Scale, TrendingUp, Trophy } from '../ui/icons';
import { EmptyState, PageHeader, ProgressRing, SectionHeader, Segmented, Sparkline, cx } from '../ui/kit';

export function Progress({ settings }: { settings: Settings }) {
  const sessions = useSessions();
  const bodyweights = useBodyweights();
  const checkins = useCheckins();
  const days = useDays();
  const { map: exMap, loaded } = useExercises();
  const [volMode, setVolMode] = useState<'week' | 'avg'>('week');
  const [offset, setOffset] = useState(0);

  const now = Date.now();
  const input = useMemo<AnalysisInput | null>(() => {
    if (!sessions || !bodyweights || !days || !checkins || !loaded) return null;
    return {
      sessions: sessions.filter((s) => s.exercises.some((e) => e.sets.some(isDone))),
      exercises: exMap,
      days,
      bodyweights,
      checkins,
      settings,
      now: Date.now()
    };
  }, [sessions, bodyweights, days, checkins, exMap, loaded, settings]);
  const analyses = useMemo(() => (input ? analyzeExercises(input) : []), [input]);
  const insights = useMemo(() => (input ? buildInsights(input, analyses) : []), [input, analyses]);
  const stats = useMemo(() => (input ? weeklyMuscleStats(input.sessions, input.exercises, settings.engine) : new Map()), [input, settings.engine]);

  if (!input) return null;
  const p = settings.engine;
  const week = weekSummary(input, analyses);

  if (!input.sessions.length) {
    return (
      <div>
        <PageHeader title="Progrès" />
        <EmptyState
          icon={<TrendingUp size={26} />}
          title="Tes progrès apparaîtront ici"
          action={
            <a className="btn btn-primary w-full" href="#/seance">
              Aller à la séance du jour
            </a>
          }
        >
          Termine une première séance : tu verras tes courbes, ton volume par muscle, tes records et les conseils du coach.
        </EmptyState>
      </div>
    );
  }

  // ---------- volume
  const thisWeek = weekStart(now);
  const wk = weekStart(thisWeek - offset * WEEK_MS + DAY_MS);
  let volRows: { muscle: string; sets: number; freq?: number }[];
  if (volMode === 'week') {
    volRows = [...(stats.get(wk)?.entries() ?? [])].map(([muscle, v]) => ({ muscle, sets: v.sets, freq: v.days.size }));
  } else {
    const weeks = [1, 2, 3, 4].map((k) => weekStart(thisWeek - (k * 7 - 1) * DAY_MS)).filter((w) => stats.has(w));
    const acc = new Map<string, number>();
    for (const w of weeks) for (const [m, v] of stats.get(w)!) acc.set(m, (acc.get(m) ?? 0) + v.sets / weeks.length);
    volRows = [...acc.entries()].map(([muscle, sets]) => ({ muscle, sets }));
  }

  // ---------- poids de corps
  const unit = bodyweights!.length ? bodyweights![bodyweights!.length - 1].unit : settings.defaultUnit;
  const series = bodySeries(bodyweights!, unit);
  const lastBw = series[series.length - 1];
  const trend = bodyweightTrend(bodyweights!, now, p);

  // ---------- records récents (30 jours)
  const prs = analyses
    .flatMap((a) => a.history.filter((h) => (h.isE1rmPR || h.isWeightPR) && h.date >= now - 30 * DAY_MS).map((h) => ({ ex: a.ex, h })))
    .sort((a, b) => b.h.date - a.h.date);

  const ringValue = week.planned ? week.done / week.planned : week.done > 0 ? 1 : 0;

  return (
    <div>
      <PageHeader title="Progrès" />

      <div className="card hero-glow p-5">
        <div className="flex items-center gap-4">
          <ProgressRing value={ringValue} size={84} stroke={9} tone={week.planned && week.done >= week.planned ? 'good' : 'accent'}>
            <div className="text-center leading-none">
              <div className="num text-[26px] font-bold">
                {week.done}
                {week.planned ? <span className="text-sm font-semibold text-faint">/{week.planned}</span> : null}
              </div>
            </div>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Cette semaine</div>
            <div className="headline mt-0.5">
              {week.done} {plural(week.done, 'séance')}
              {week.planned ? ` sur ${week.planned}` : ''}
            </div>
            <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mute">
              <span>{week.hardSets} sets durs</span>
              {week.minutes > 0 && <span>{fmtDuration(week.minutes * 60000)}</span>}
              {week.prs > 0 && (
                <span className="text-gold">
                  {week.prs} {plural(week.prs, 'record')}
                </span>
              )}
            </div>
          </div>
        </div>
        {week.streak >= 2 && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
            <Flame size={16} className="shrink-0" />
            <span>
              <b>{week.streak} semaines</b> d’affilée dans l’objectif.
            </span>
          </div>
        )}
      </div>

      <SectionHeader title="Coach" action={<a className="text-xs font-semibold text-accent" href="#/reglages/guide">Guide scientifique</a>} />
      <Coach insights={insights} />

      <SectionHeader title="Volume par muscle" />
      <div className="card p-4">
        <Segmented
          value={volMode}
          onChange={setVolMode}
          tone="neutral"
          options={[
            { value: 'week', label: 'Par semaine' },
            { value: 'avg', label: 'Moyenne 4 sem.' }
          ]}
        />
        {volMode === 'week' && (
          <div className="mt-3 flex items-center justify-between">
            <button className="btn btn-icon btn-secondary rounded-full" onClick={() => setOffset(offset + 1)} aria-label="Semaine précédente">
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-semibold">{offset === 0 ? 'Cette semaine' : offset === 1 ? 'Semaine dernière' : `Semaine du ${fmtDay(wk)}`}</span>
            <button className="btn btn-icon btn-secondary rounded-full" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label="Semaine suivante">
              <ChevronRight size={20} />
            </button>
          </div>
        )}
        <div className="mt-4">
          {volRows.length ? (
            <MuscleBars rows={volRows} low={p.volumeLow} high={p.volumeHigh} unit="sets durs" />
          ) : (
            <p className="py-6 text-center text-sm text-mute">{volMode === 'week' ? 'Aucun set dur cette semaine-là.' : 'Pas encore de semaine complète à moyenner.'}</p>
          )}
        </div>
        <p className="mt-1 text-[11px] text-faint">
          Set dur : {p.hardSetRir} RIR ou moins. Muscle secondaire : {fmt(p.secondaryWeight, 2)} set.{volMode === 'week' && offset === 0 ? ' La semaine en cours n’est pas finie.' : ''}
        </p>
      </div>

      <SectionHeader title="Poids de corps" />
      <a className="card flex min-h-[76px] items-center gap-3 p-4 active:bg-raised/60" href="#/progres/corps">
        <span className="tone-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <Scale size={20} />
        </span>
        <span className="min-w-0 flex-1">
          {lastBw ? (
            <>
              <span className="num block text-[20px] font-bold leading-tight">
                {fmt(lastBw.weight)} <span className="text-xs font-medium text-faint">{unit}</span>
              </span>
              <span className="block truncate text-xs text-faint">{trend != null ? `${fmtSigned(trend, 2)} % par semaine` : 'Tendance pas encore mesurable'}</span>
            </>
          ) : (
            <>
              <span className="block text-[15px] font-semibold">Ajouter une pesée</span>
              <span className="block text-xs text-faint">Tendance, vitesse de prise ou de perte, protéines</span>
            </>
          )}
        </span>
        {series.length >= 2 && <Sparkline values={series.slice(-20).map((s) => s.trend)} width={72} height={30} tone="accent" />}
        <ChevronRight size={18} className="shrink-0 text-faint" />
      </a>

      {prs.length > 0 && (
        <>
          <SectionHeader title="Records des 30 derniers jours" />
          <ul className="card divide-y divide-line/60 overflow-hidden">
            {prs.slice(0, 6).map(({ ex, h }) => (
              <li key={ex.id + h.sessionId}>
                <a className="flex min-h-[56px] items-center gap-3 px-4 py-2 active:bg-raised/60" href={`#/progres/ex/${ex.id}`}>
                  <span className="tone-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    <Trophy size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{ex.name}</span>
                    <span className="num block truncate text-xs text-faint">
                      {fmt(h.bestSet.weight)} {ex.unit} × {fmt(h.bestSet.reps)} · {h.isE1rmPR ? `1RM estimé ${fmt(h.bestE1rm)}` : 'charge max'}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-faint">{fmtDay(h.date)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionHeader title={`Exercices (${analyses.length})`} />
      <ul className="card divide-y divide-line/60 overflow-hidden">
        {analyses.map(({ ex, history, status, rate }) => {
          const last = history[history.length - 1];
          return (
            <li key={ex.id}>
              <a className="flex min-h-[66px] items-center gap-3 px-4 py-2.5 active:bg-raised/60" href={`#/progres/ex/${ex.id}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{ex.name}</span>
                  <span className="num block truncate text-xs text-faint">
                    1RM est. {fmt(last.bestE1rm)} {ex.unit}
                    {status.observed != null ? ` · ${fmtSigned(status.observed, 2)} %/sem` : ` · visé +${fmt(rate.rate, 2)} %/sem`}
                  </span>
                </span>
                <Sparkline values={history.slice(-10).map((h) => h.bestE1rm)} tone={STATUS_TONE[status.kind] === 'mute' ? 'mute' : STATUS_TONE[status.kind]} />
                <span className={cx(status.kind === 'insufficient' && 'hidden')}>
                  <StatusBadge kind={status.kind} compact />
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
