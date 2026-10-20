import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useBodyweights, useExercises, useSessions } from '../hooks';
import { Segmented, Why } from '../components/ui';
import {
  STATUS_STYLE,
  exerciseHistory,
  exerciseStatus,
  expectedCurve,
  expectedRate,
  projections,
  weeklyHardSets,
  type EngineContext,
  type ExerciseSession
} from '../lib/engine';
import { DAY_MS, WEEK_MS, fmt, fmtDate, weekStart } from '../lib/util';
import type { Exercise, ProgramDay, Session, Settings } from '../types';
import { useDays } from '../hooks';

type Period = '4w' | '3m' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: '4w', label: '4 sem.' },
  { value: '3m', label: '3 mois' },
  { value: 'all', label: 'Tout' }
];
const periodStart = (p: Period, now: number) => (p === '4w' ? now - 28 * DAY_MS : p === '3m' ? now - 91 * DAY_MS : 0);

const css = (v: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(v).trim()})`;
const PR_COLOR = '#c98500';
const EXPECTED_COLOR = '#d95926';

function usePalette() {
  return { good: css('--good'), accent: css('--accent'), mute: css('--mute'), line: css('--line'), ink: css('--ink'), card: css('--card') };
}

/** Plan (fourchette, RIR) de l'exercice : celui du programme s'il y figure. */
function planFor(exId: string, days: ProgramDay[]) {
  for (const d of days) for (const it of d.items) if (it.exerciseId === exId) return it;
  return { repMin: 8, repMax: 12, rirTarget: 1 };
}

export function Progress({ settings, exerciseId, go }: { settings: Settings; exerciseId?: string; go: (p: string) => void }) {
  const sessions = useSessions();
  const bodyweights = useBodyweights();
  const days = useDays();
  const { map: exMap } = useExercises();
  const [period, setPeriod] = useState<Period>('3m');
  if (!sessions || !bodyweights || !days) return null;
  const done = sessions.filter((s) => s.endedAt != null || s.exercises.some((e) => e.sets.some((x) => x.done)));
  const ctx: EngineContext = { settings, bodyweights, now: Date.now() };
  const ex = exerciseId ? exMap.get(exerciseId) : undefined;

  return (
    <div className="space-y-3">
      {ex && (
        <button className="btn-ghost btn-sm" onClick={() => go('progres')}>
          ← Tous les exercices
        </button>
      )}
      <Segmented value={period} onChange={setPeriod} options={PERIODS} size="lg" />
      {ex ? (
        <ExerciseDetail ex={ex} sessions={done} ctx={ctx} period={period} plan={planFor(ex.id, days)} />
      ) : (
        <Overview sessions={done} exMap={exMap} ctx={ctx} period={period} days={days} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- vue d'ensemble

function Overview({
  sessions,
  exMap,
  ctx,
  period,
  days
}: {
  sessions: Session[];
  exMap: Map<string, Exercise>;
  ctx: EngineContext;
  period: Period;
  days: ProgramDay[];
}) {
  const ids = [...new Set(sessions.flatMap((s) => s.exercises.filter((e) => e.sets.some((x) => x.done)).map((e) => e.exerciseId)))];
  const rows = ids
    .map((id) => {
      const ex = exMap.get(id);
      if (!ex) return null;
      const h = exerciseHistory(sessions, id);
      const plan = planFor(id, days);
      const rate = expectedRate(ex, h, ctx).rate;
      const st = exerciseStatus(h, rate, plan.rirTarget, ctx.settings.engine);
      return { ex, h, st, rate };
    })
    .filter(Boolean)
    .sort((a, b) => a!.ex.name.localeCompare(b!.ex.name, 'fr')) as { ex: Exercise; h: ExerciseSession[]; st: ReturnType<typeof exerciseStatus>; rate: number }[];

  const since = periodStart(period, ctx.now);
  const prs = rows.flatMap((r) => r.h.filter((x) => x.isE1rmPR && x.date >= since).map((x) => ({ ex: r.ex, x }))).sort((a, b) => b.x.date - a.x.date);

  return (
    <div className="space-y-3">
      <WeeklyVolume sessions={sessions} exMap={exMap} ctx={ctx} period={period} />
      {prs.length > 0 && (
        <div className="card">
          <h3 className="mb-2 font-bold">🏆 Records sur la période</h3>
          <ul className="space-y-1 text-sm">
            {prs.slice(0, 8).map(({ ex, x }) => (
              <li key={ex.id + x.sessionId} className="flex justify-between gap-2">
                <a href={`#/progres/${ex.id}`} className="truncate">
                  {ex.name}
                </a>
                <span className="whitespace-nowrap text-mute">
                  {fmt(x.bestSet.weight)} × {fmt(x.bestSet.reps)} · {fmtDate(x.date, { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card p-0">
        <h3 className="px-4 pt-4 font-bold">Exercices</h3>
        {!rows.length && <p className="px-4 pb-4 text-sm text-mute">Termine une première séance pour voir ta progression.</p>}
        <ul className="divide-y divide-line/60">
          {rows.map(({ ex, h, st, rate }) => (
            <li key={ex.id}>
              <a href={`#/progres/${ex.id}`} className="flex items-center justify-between gap-2 px-4 py-3 min-h-[60px]">
                <div className="min-w-0">
                  <div className="truncate font-medium">{ex.name}</div>
                  <div className="text-xs text-mute">
                    1RM est. {fmt(h[h.length - 1].bestE1rm)} {ex.unit} · visé {fmt(rate, 2)} %/sem
                    {st.observed != null && ` · réel ${fmt(st.observed, 2)} %/sem`}
                  </div>
                </div>
                <span className={`chip whitespace-nowrap ${STATUS_STYLE[st.kind].color}`}>
                  {STATUS_STYLE[st.kind].icon} {st.label}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WeeklyVolume({ sessions, exMap, ctx, period }: { sessions: Session[]; exMap: Map<string, Exercise>; ctx: EngineContext; period: Period }) {
  const pal = usePalette();
  const p = ctx.settings.engine;
  const [mode, setMode] = useState<'week' | 'avg'>('week');
  const weeks = useMemo(() => weeklyHardSets(sessions, exMap, p, weekStart), [sessions, exMap, p]);
  const thisWeek = weekStart(ctx.now);
  const [offset, setOffset] = useState(0);
  const wk = thisWeek - offset * WEEK_MS;

  const data = useMemo(() => {
    let m: Map<string, number>;
    if (mode === 'week') m = weeks.get(wk) ?? new Map();
    else {
      const since = period === 'all' ? Math.min(thisWeek, ...weeks.keys()) : weekStart(periodStart(period, ctx.now));
      const n = Math.max(1, Math.round((thisWeek - since) / WEEK_MS) + 1);
      m = new Map();
      for (const [k, mm] of weeks) if (k >= since) for (const [mu, v] of mm) m.set(mu, (m.get(mu) ?? 0) + v / n);
    }
    return [...m.entries()].map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 10) / 10 })).sort((a, b) => b.sets - a.sets);
  }, [mode, weeks, wk, period, thisWeek, ctx.now]);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">Volume hebdo par muscle</h3>
      </div>
      <p className="text-xs text-mute">
        Sets durs (≤ {p.hardSetRir} RIR). Muscle secondaire = {fmt(p.secondaryWeight, 2)} set. Zone conseillée {p.volumeLow}–{p.volumeHigh}.
      </p>
      <div className="mt-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'week', label: 'Par semaine' },
            { value: 'avg', label: 'Moyenne période' }
          ]}
        />
      </div>
      {mode === 'week' && (
        <div className="mt-2 flex items-center justify-between">
          <button className="btn-ghost btn-sm" onClick={() => setOffset(offset + 1)} aria-label="Semaine précédente">
            ←
          </button>
          <span className="text-sm">
            {offset === 0 ? 'Cette semaine' : `Semaine du ${fmtDate(wk, { day: 'numeric', month: 'short' })}`}
          </span>
          <button className="btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label="Semaine suivante">
            →
          </button>
        </div>
      )}
      {data.length ? (
        <div style={{ height: Math.max(120, data.length * 30 + 30) }} className="mt-2">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 4 }} barCategoryGap={2}>
              <ReferenceArea x1={p.volumeLow} x2={p.volumeHigh} fill={pal.good} fillOpacity={0.1} ifOverflow="extendDomain" />
              <XAxis type="number" tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} allowDecimals={false} />
              <YAxis type="category" dataKey="muscle" width={110} tick={{ fill: pal.ink, fontSize: 12 }} stroke={pal.line} />
              <Tooltip
                cursor={{ fill: pal.line, fillOpacity: 0.3 }}
                contentStyle={{ background: pal.card, border: `1px solid ${pal.line}`, borderRadius: 12, color: pal.ink }}
                formatter={(v: number) => [`${fmt(v)} sets durs`, '']}
              />
              <Bar dataKey="sets" isAnimationActive={false} fill={pal.accent} radius={[0, 4, 4, 0]} label={{ position: 'right', fill: pal.mute, fontSize: 11, formatter: (v: number) => fmt(v) }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm text-mute">Aucun set dur sur cette période.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- détail exercice

function ExerciseDetail({
  ex,
  sessions,
  ctx,
  period,
  plan
}: {
  ex: Exercise;
  sessions: Session[];
  ctx: EngineContext;
  period: Period;
  plan: { repMin: number; repMax: number; rirTarget: number };
}) {
  const pal = usePalette();
  const p = ctx.settings.engine;
  const all = useMemo(() => exerciseHistory(sessions, ex.id), [sessions, ex.id]);
  const rate = useMemo(() => expectedRate(ex, all, ctx), [ex, all, ctx]);
  const status = useMemo(() => exerciseStatus(all, rate.rate, plan.rirTarget, p), [all, rate, plan, p]);
  const proj = useMemo(() => projections(ex, plan, all, rate.rate, ctx.now), [ex, plan, all, rate, ctx.now]);
  const since = periodStart(period, ctx.now);
  const h = all.filter((x) => x.date >= since);
  const curve = useMemo(() => expectedCurve(h, rate.rate, p.tolerancePct, ctx.now + 14 * DAY_MS), [h, rate, p.tolerancePct, ctx.now]);
  const best = all.reduce<ExerciseSession | null>((a, b) => (!a || b.bestE1rm > a.bestE1rm ? b : a), null);
  const heaviest = all.reduce<ExerciseSession | null>((a, b) => (!a || b.maxWeight > a.maxWeight ? b : a), null);

  const tick = (t: number) => fmtDate(t, { day: 'numeric', month: 'short' });
  const tooltipStyle = { background: pal.card, border: `1px solid ${pal.line}`, borderRadius: 12, color: pal.ink };

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold leading-tight">{ex.name}</h2>
            <div className="text-xs text-mute">
              {ex.primaryMuscle}
              {ex.secondaryMuscles.length ? ` + ${ex.secondaryMuscles.join(', ')}` : ''}
            </div>
          </div>
          <span className={`chip whitespace-nowrap ${STATUS_STYLE[status.kind].color}`}>
            {STATUS_STYLE[status.kind].icon} {status.label}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="1RM estimé max" value={best ? fmt(best.bestE1rm) : '–'} unit={ex.unit} />
          <Stat label="Charge max" value={heaviest ? fmt(heaviest.maxWeight) : '–'} unit={ex.unit} />
          <Stat label="Rythme visé" value={fmt(rate.rate, 2)} unit="%/sem" />
        </div>
        {status.advice.map((a, i) => (
          <p key={i} className="mt-2 text-sm">
            💡 {a}
          </p>
        ))}
        <Why lines={status.why} label="Pourquoi ce statut ?" />
        <Why lines={rate.why} label="Pourquoi ce rythme ?" />
        {proj.length > 0 && (
          <div className="mt-2 space-y-1">
            {proj.map((pr, i) => (
              <div key={i}>
                <p className="text-sm font-medium">🎯 {pr.text}</p>
                <Why lines={pr.why} />
              </div>
            ))}
          </div>
        )}
      </div>

      {h.length === 0 ? (
        <p className="card text-sm text-mute">Pas de données sur cette période.</p>
      ) : (
        <>
          <div className="card">
            <h3 className="font-bold">1RM estimé : réel vs attendu</h3>
            <p className="text-xs text-mute">
              Epley avec reps + RIR. Attendu : {fmt(rate.rate, 2)} %/sem depuis le début de la période, zone ± {fmt(p.tolerancePct)} %.
            </p>
            <div className="mt-2 h-60">
              <ResponsiveContainer>
                <ComposedChart data={curve} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(t) => fmtDate(t as number, { day: 'numeric', month: 'long', year: 'numeric' })}
                    formatter={(v: number | number[], name) => [Array.isArray(v) ? `${fmt(v[0])}–${fmt(v[1])}` : `${fmt(v)} ${ex.unit}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: pal.mute }} />
                  <Area dataKey="band" name="Tolérance" stroke="none" fill={EXPECTED_COLOR} fillOpacity={0.15} isAnimationActive={false} />
                  <Line dataKey="expected" name="Attendu" stroke={EXPECTED_COLOR} strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line
                    dataKey="actual"
                    name="Réel"
                    stroke={pal.accent}
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                    dot={(props: { cx?: number; cy?: number; payload?: { pr: boolean }; index?: number }) =>
                      props.cx == null || props.cy == null || props.payload == null ? (
                        <g key={props.index} />
                      ) : props.payload.pr ? (
                        <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={PR_COLOR} stroke={pal.card} strokeWidth={2} />
                      ) : (
                        <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={pal.accent} stroke={pal.card} strokeWidth={2} />
                      )
                    }
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-mute">
              <span style={{ color: PR_COLOR }}>●</span> record personnel de 1RM estimé
            </p>
          </div>

          <div className="card">
            <h3 className="font-bold">Charge max par séance</h3>
            <div className="mt-2 h-44">
              <ResponsiveContainer>
                <ComposedChart data={h} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtDate(t as number)} formatter={(v: number) => [`${fmt(v)} ${ex.unit}`, 'Charge max']} />
                  <Line
                    dataKey="maxWeight"
                    stroke={pal.accent}
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={(props: { cx?: number; cy?: number; payload?: ExerciseSession; index?: number }) =>
                      props.cx == null || props.cy == null ? (
                        <g key={props.index} />
                      ) : (
                        <circle key={props.index} cx={props.cx} cy={props.cy} r={props.payload?.isWeightPR ? 6 : 4} fill={props.payload?.isWeightPR ? PR_COLOR : pal.accent} stroke={pal.card} strokeWidth={2} />
                      )
                    }
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold">Volume par séance (charge × reps)</h3>
            <div className="mt-2 h-40">
              <ResponsiveContainer>
                <BarChart data={h} margin={{ left: -4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={tick} tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} />
                  <YAxis tick={{ fill: pal.mute, fontSize: 11 }} stroke={pal.line} tickFormatter={(v) => fmt(v, 0)} />
                  <Tooltip cursor={{ fill: pal.line, fillOpacity: 0.3 }} contentStyle={tooltipStyle} labelFormatter={(t) => fmtDate(t as number)} formatter={(v: number) => [`${fmt(v, 0)} ${ex.unit}`, 'Volume']} />
                  <Bar dataKey="volume" isAnimationActive={false} fill={pal.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <h3 className="px-4 pt-4 font-bold">Historique</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-xs text-mute">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="py-2 text-left font-medium">Sets</th>
                  <th className="px-4 py-2 text-right font-medium">1RM est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {[...h].reverse().map((x) => (
                  <tr key={x.sessionId} className={x.isE1rmPR ? 'bg-warn/10' : ''}>
                    <td className="px-4 py-2 align-top whitespace-nowrap">{fmtDate(x.date, { day: 'numeric', month: 'short' })}</td>
                    <td className="py-2 align-top tabular-nums">
                      {x.sets.map((s, i) => (
                        <div key={i}>
                          {fmt(s.weight)} × {fmt(s.reps)} <span className="text-mute">@{s.rir === 4 ? '4+' : s.rir}</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2 text-right align-top tabular-nums">
                      {fmt(x.bestE1rm)}
                      {x.isE1rmPR && <div className="text-xs font-bold text-warn">🏆 PR</div>}
                      {x.isWeightPR && !x.isE1rmPR && <div className="text-xs font-bold text-warn">PR charge</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-bg p-2">
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] text-mute">{unit}</div>
      <div className="text-[11px] text-mute leading-tight">{label}</div>
    </div>
  );
}
