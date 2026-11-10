import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BackButton } from '../components/BackButton';
import { ExerciseForm } from '../components/ExerciseForm';
import { StatusBadge } from '../components/StatusBadge';
import { db } from '../db';
import { useBodyweights, useDays, useExercises, usePalette, useSessions } from '../hooks';
import { exerciseHistory, exerciseStatus, expectedCurve, expectedRate, isDone, projections, type EngineContext, type ExerciseSession } from '../lib/engine';
import { planFor } from '../lib/insights';
import { DAY_MS, ago, fmt, fmtDate, fmtDay, fmtSigned, rirLabel } from '../lib/util';
import type { Settings } from '../types';
import { BatteryCharging, Pencil, Target, Trophy } from '../ui/icons';
import { EmptyState, PageHeader, SectionHeader, Segmented, Stat, WhyButton, cx } from '../ui/kit';
import { Sheet, toast } from '../ui/overlay';

type Period = '4w' | '3m' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: '4w', label: '4 sem.' },
  { value: '3m', label: '3 mois' },
  { value: 'all', label: 'Tout' }
];
const periodStart = (p: Period, now: number) => (p === '4w' ? now - 28 * DAY_MS : p === '3m' ? now - 91 * DAY_MS : 0);

export function ExerciseDetail({ settings, exerciseId }: { settings: Settings; exerciseId: string }) {
  const sessions = useSessions();
  const bodyweights = useBodyweights();
  const days = useDays();
  const { map: exMap, loaded } = useExercises();
  const pal = usePalette();
  const [period, setPeriod] = useState<Period>('3m');
  const [editing, setEditing] = useState(false);

  const ex = exMap.get(exerciseId);
  const p = settings.engine;
  const worked = useMemo(() => (sessions ?? []).filter((s) => s.exercises.some((e) => e.sets.some(isDone))), [sessions]);
  const all = useMemo(() => exerciseHistory(worked, exerciseId), [worked, exerciseId]);
  const full = useMemo(() => exerciseHistory(worked, exerciseId, { includeDeload: true }), [worked, exerciseId]);
  const now = Date.now();
  const ctx: EngineContext | null = bodyweights ? { settings, bodyweights, now } : null;
  const plan = (days && planFor(exerciseId, days)) || { repMin: 8, repMax: 12, rirTarget: 1 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rate = useMemo(() => (ex && ctx ? expectedRate(ex, all, ctx) : null), [ex, all, bodyweights, settings]);

  if (!sessions || !bodyweights || !days || !loaded) return null;
  if (!ex || !rate || !ctx) {
    return (
      <div>
        <BackButton fallback="progres" />
        <EmptyState icon={<Target size={26} />} title="Exercice introuvable">
          Il a peut-être été supprimé de la bibliothèque.
        </EmptyState>
      </div>
    );
  }

  const status = exerciseStatus(all, rate.rate, plan.rirTarget, p);
  const proj = projections(ex, plan, all, rate.rate, now);
  const since = periodStart(period, now);
  const h = all.filter((x) => x.date >= since);
  const curve = expectedCurve(h, rate.rate, p.tolerancePct, now + 14 * DAY_MS);
  const best = all.reduce<ExerciseSession | null>((a, b) => (!a || b.bestE1rm > a.bestE1rm ? b : a), null);
  const heaviest = all.reduce<ExerciseSession | null>((a, b) => (!a || b.maxWeight > a.maxWeight ? b : a), null);
  const first = all[0];
  const last = all[all.length - 1];
  const gain = first && last && all.length > 1 ? (last.bestE1rm / first.bestE1rm - 1) * 100 : null;

  const axis = { tick: { fill: pal.faint, fontSize: 11 }, axisLine: false, tickLine: false } as const;
  const tooltip = {
    contentStyle: { background: pal.raised, border: `1px solid ${pal.line}`, borderRadius: 14, color: pal.ink, fontSize: 13, padding: '8px 12px' },
    labelStyle: { color: pal.mute, marginBottom: 2 },
    itemStyle: { color: pal.ink, padding: 0 },
    cursor: { stroke: pal.faint, strokeDasharray: '3 3' }
  } as const;
  const tick = (t: number) => fmtDay(t);

  return (
    <div>
      <BackButton fallback="progres" />
      <PageHeader
        eyebrow={`${ex.primaryMuscle}${ex.secondaryMuscles.length ? ` · ${ex.secondaryMuscles.join(', ')}` : ''}`}
        title={ex.name}
        right={
          <button className="btn btn-icon btn-secondary rounded-full" onClick={() => setEditing(true)} aria-label="Modifier l'exercice">
            <Pencil size={18} />
          </button>
        }
      />

      {all.length === 0 ? (
        <EmptyState icon={<Target size={26} />} title="Pas encore de données">
          Enregistre cet exercice dans une séance : sa courbe, ses records et sa projection apparaîtront ici.
        </EmptyState>
      ) : (
        <>
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind={status.kind} />
              <WhyButton title="Pourquoi ce statut ?" lines={status.why} label="Pourquoi ?" />
            </div>
            {status.advice.map((a, i) => (
              <p key={i} className="mt-2.5 text-[15px] leading-relaxed">
                {a}
              </p>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat label="1RM estimé max" value={best ? fmt(best.bestE1rm) : '–'} unit={ex.unit} />
              <Stat label="Charge max" value={heaviest ? fmt(heaviest.maxWeight) : '–'} unit={ex.unit} />
              <Stat label="Rythme visé" value={`+${fmt(rate.rate, 2)}`} unit="% / sem" />
              <Stat label={status.observed != null ? `Réel (${p.statusWindowWeeks} sem.)` : 'Depuis le début'} value={status.observed != null ? fmtSigned(status.observed, 2) : gain != null ? fmtSigned(gain, 1) : '–'} unit={status.observed != null ? '% / sem' : '%'} tone={status.observed != null ? (status.observed > p.stagnationPct ? 'good' : status.observed < -p.regressionPct ? 'bad' : 'warn') : undefined} />
            </div>
            <div className="mt-3">
              <WhyButton title="Pourquoi ce rythme ?" lines={rate.why} label="Comment est calculé le rythme visé ?" />
            </div>
          </div>

          {proj.length > 0 && (
            <>
              <SectionHeader title="Projection" />
              <div className="card divide-y divide-line/60 overflow-hidden">
                {proj.map((pr, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Target size={18} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 text-[15px] font-medium">{pr.text}</span>
                    <WhyButton title="Comment est-ce calculé ?" lines={pr.why} />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-6">
            <Segmented value={period} onChange={setPeriod} options={PERIODS} tone="neutral" ariaLabel="Période" />
          </div>

          {h.length === 0 ? (
            <p className="card mt-3 p-6 text-center text-sm text-mute">Aucune séance sur cette période. Dernière fois {ago(last.date)}.</p>
          ) : (
            <>
              <div className="card mt-3 p-4">
                <h3 className="headline">1RM estimé : réel et attendu</h3>
                <p className="mt-0.5 text-xs text-faint">
                  Formule d’Epley avec reps + RIR. La courbe attendue part de la première séance de la période, à +{fmt(rate.rate, 2)} % par semaine.
                </p>
                <div className="mt-3 h-60">
                  <ResponsiveContainer>
                    <ComposedChart data={curve} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid stroke={pal.line} strokeOpacity={0.6} vertical={false} />
                      <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} minTickGap={28} {...axis} />
                      <YAxis domain={['auto', 'auto']} width={44} tickFormatter={(v) => fmt(v, 0)} {...axis} />
                      <Tooltip
                        {...tooltip}
                        labelFormatter={(t) => fmtDate(t as number, { day: 'numeric', month: 'long', year: 'numeric' })}
                        formatter={(v: number | number[], name) => [Array.isArray(v) ? `${fmt(v[0])} à ${fmt(v[1])} ${ex.unit}` : `${fmt(v)} ${ex.unit}`, name]}
                      />
                      <Area dataKey="band" name={`Tolérance ± ${fmt(p.tolerancePct)} %`} stroke="none" fill={pal.chart2} fillOpacity={0.14} isAnimationActive={false} />
                      <Line dataKey="expected" name="Attendu" stroke={pal.chart2} strokeDasharray="5 4" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
                      <Line
                        dataKey="actual"
                        name="Réel"
                        stroke={pal.chart1}
                        strokeWidth={2.5}
                        connectNulls
                        isAnimationActive={false}
                        activeDot={{ r: 6, fill: pal.chart1, stroke: pal.surface, strokeWidth: 2 }}
                        dot={(props: { cx?: number; cy?: number; payload?: { pr: boolean; actual: number | null }; index?: number }) =>
                          props.cx == null || props.cy == null || props.payload?.actual == null ? (
                            <g key={props.index} />
                          ) : props.payload.pr ? (
                            <circle key={props.index} cx={props.cx} cy={props.cy} r={6.5} fill={pal.ink} stroke={pal.chart1} strokeWidth={3} />
                          ) : (
                            <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={pal.chart1} stroke={pal.surface} strokeWidth={2} />
                          )
                        }
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                  <li className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded" style={{ background: pal.chart1 }} /> Réel
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed" style={{ borderColor: pal.chart2 }} /> Attendu
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-sm" style={{ background: pal.chart2, opacity: 0.25 }} /> Tolérance ± {fmt(p.tolerancePct)} %
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border-[3px]" style={{ background: pal.ink, borderColor: pal.chart1 }} /> Record
                  </li>
                </ul>
              </div>

              <div className="card mt-3 p-4">
                <h3 className="headline">Charge max par séance</h3>
                <div className="mt-3 h-44">
                  <ResponsiveContainer>
                    <ComposedChart data={h} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid stroke={pal.line} strokeOpacity={0.6} vertical={false} />
                      <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} minTickGap={28} {...axis} />
                      <YAxis domain={['auto', 'auto']} width={44} tickFormatter={(v) => fmt(v, 0)} {...axis} />
                      <Tooltip {...tooltip} labelFormatter={(t) => fmtDate(t as number)} formatter={(v: number) => [`${fmt(v)} ${ex.unit}`, 'Charge max']} />
                      <Line
                        dataKey="maxWeight"
                        stroke={pal.chart1}
                        strokeWidth={2.5}
                        isAnimationActive={false}
                        activeDot={{ r: 6, fill: pal.chart1, stroke: pal.surface, strokeWidth: 2 }}
                        dot={(props: { cx?: number; cy?: number; payload?: ExerciseSession; index?: number }) =>
                          props.cx == null || props.cy == null ? (
                            <g key={props.index} />
                          ) : props.payload?.isWeightPR ? (
                            <circle key={props.index} cx={props.cx} cy={props.cy} r={6.5} fill={pal.ink} stroke={pal.chart1} strokeWidth={3} />
                          ) : (
                            <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={pal.chart1} stroke={pal.surface} strokeWidth={2} />
                          )
                        }
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card mt-3 p-4">
                <h3 className="headline">Volume par séance</h3>
                <p className="mt-0.5 text-xs text-faint">Charge × reps, tous sets confondus ({ex.unit}).</p>
                <div className="mt-3 h-40">
                  <ResponsiveContainer>
                    <BarChart data={h.map((x) => ({ ...x, label: fmtDay(x.date) }))} margin={{ left: -8, right: 8, top: 8, bottom: 0 }} barCategoryGap="18%">
                      <CartesianGrid stroke={pal.line} strokeOpacity={0.6} vertical={false} />
                      <XAxis dataKey="label" minTickGap={16} {...axis} />
                      <YAxis width={44} tickFormatter={(v) => (v >= 1000 ? `${fmt(v / 1000, 1)}k` : fmt(v, 0))} {...axis} />
                      <Tooltip {...tooltip} cursor={{ fill: pal.line, fillOpacity: 0.35 }} formatter={(v: number) => [`${fmt(v, 0)} ${ex.unit}`, 'Volume']} />
                      <Bar dataKey="volume" fill={pal.chart1} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          <SectionHeader title={`Historique (${full.length})`} />
          <ul className="card divide-y divide-line/60 overflow-hidden">
            {[...full]
              .reverse()
              .filter((x) => x.date >= since)
              .map((x) => (
                <li key={x.sessionId}>
                  <a className={cx('flex items-start gap-3 px-4 py-3 active:bg-raised/60', x.isE1rmPR && 'bg-gold/5')} href={`#/historique/${x.sessionId}`}>
                    <span className="w-[58px] shrink-0">
                      <span className="block text-sm font-semibold">{fmtDay(x.date)}</span>
                      <span className="block text-[11px] text-faint">{new Date(x.date).getFullYear()}</span>
                    </span>
                    <span className="num min-w-0 flex-1 text-sm text-mute">
                      {x.sets.map((s, i) => (
                        <span key={i} className="block">
                          <span className="font-semibold text-ink">
                            {fmt(s.weight)} × {fmt(s.reps)}
                          </span>{' '}
                          @ {rirLabel(s.rir)}
                          {s.notation && <span className="text-faint"> · {s.notation}</span>}
                        </span>
                      ))}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm font-semibold">{fmt(x.bestE1rm)}</span>
                      {x.deload ? (
                        <span className="chip tone-good mt-1">
                          <BatteryCharging size={11} /> Décharge
                        </span>
                      ) : x.isE1rmPR ? (
                        <span className="chip tone-gold mt-1">
                          <Trophy size={11} /> Record
                        </span>
                      ) : x.isWeightPR ? (
                        <span className="chip tone-gold mt-1">Charge</span>
                      ) : null}
                    </span>
                  </a>
                </li>
              ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-faint">Colonne de droite : meilleur 1RM estimé de la séance ({ex.unit}).</p>
        </>
      )}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Modifier l’exercice" footer={null}>
        <ExerciseForm
          value={ex}
          globalRest={settings.defaultRestSec}
          onCancel={() => setEditing(false)}
          onSave={async (e) => {
            await db.exercises.put(e);
            setEditing(false);
            toast('Exercice enregistré');
          }}
        />
      </Sheet>
    </div>
  );
}
