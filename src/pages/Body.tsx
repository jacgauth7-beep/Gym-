import { useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BackButton } from '../components/BackButton';
import { db, saveSettings } from '../db';
import { useBodyweights, useCheckins, usePalette } from '../hooks';
import { assessBodyweight, bodySeries, bodyweightTrend, fromKg, proteinTarget, toKg, weightRateRange } from '../lib/body';
import { GOAL_FR, LEVEL_FR, levelFromYears } from '../lib/engine';
import { DAY_MS, dateKey, fmt, fmtDate, fmtDay, fmtSigned, mean, startOfDay, uid } from '../lib/util';
import type { Goal, Settings } from '../types';
import { BookOpen, CircleAlert, CircleCheck, Info, Moon, Plus, Utensils, X } from '../ui/icons';
import { NumInput, PageHeader, SectionHeader, Segmented, Stat, cx } from '../ui/kit';
import { dialog, toast } from '../ui/overlay';
import { sleepLabel } from './workout/DailyCheckin';

type Period = '4w' | '3m' | 'all';

export function Body({ settings }: { settings: Settings }) {
  const bodyweights = useBodyweights();
  const checkins = useCheckins();
  const pal = usePalette();
  const [w, setW] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>('3m');
  if (!bodyweights || !checkins) return null;

  const p = settings.engine;
  const now = Date.now();
  const unit = bodyweights.length ? bodyweights[bodyweights.length - 1].unit : settings.defaultUnit;
  const series = bodySeries(bodyweights, unit);
  const last = series[series.length - 1];
  const trend = bodyweightTrend(bodyweights, now, p);
  const level = levelFromYears(settings.trainingYears, p);
  const verdict = assessBodyweight(trend, settings.goal, level, p);
  const [lo, hi] = weightRateRange(settings.goal, level, p);
  const lastKg = bodyweights.length ? toKg(bodyweights[bodyweights.length - 1]) : null;
  const protein = lastKg ? proteinTarget(lastKg, settings.goal, p) : null;
  const pr = settings.goal === 'cut' ? p.proteinCutRange : p.proteinRange;

  const since = period === '4w' ? now - 28 * DAY_MS : period === '3m' ? now - 91 * DAY_MS : 0;
  const shown = series.filter((s) => s.date >= since);
  const today = bodyweights.find((b) => b.date >= startOfDay(now));

  const nights = Array.from({ length: 7 }, (_, i) => {
    const t = startOfDay(now) - (6 - i) * DAY_MS;
    return { t, h: checkins.find((c) => c.id === dateKey(t))?.sleepH ?? null };
  });
  const slept = nights.filter((n) => n.h != null).map((n) => n.h!);

  async function add() {
    if (!w || w <= 0) return;
    if (today) await db.bodyweights.update(today.id, { weight: w });
    else await db.bodyweights.put({ id: uid(), date: now, weight: w, unit });
    setW(null);
    toast('Pesée enregistrée', { tone: 'good', icon: <CircleCheck size={16} className="text-good" /> });
  }

  const axis = { tick: { fill: pal.faint, fontSize: 11 }, axisLine: false, tickLine: false } as const;
  const VerdictIcon = verdict.tone === 'good' ? CircleCheck : verdict.tone === 'warn' ? CircleAlert : Info;

  return (
    <div>
      <BackButton fallback="progres" />
      <PageHeader title="Poids de corps" />

      <div className="card hero-glow p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">{last ? `Dernière pesée · ${fmtDay(last.date)}` : 'Aucune pesée'}</div>
            <div className="num mt-1 text-[44px] font-bold leading-none">
              {last ? fmt(last.weight) : '–'}
              <span className="ml-1.5 text-base font-semibold text-faint">{unit}</span>
            </div>
          </div>
          {trend != null && (
            <div className="text-right">
              <div className="eyebrow">Tendance</div>
              <div className="num text-xl font-bold">{fmtSigned(trend, 2)} %</div>
              <div className="text-[11px] text-faint">par semaine</div>
            </div>
          )}
        </div>
        <div className={cx('mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm', verdict.tone === 'good' ? 'tone-good' : verdict.tone === 'warn' ? 'tone-warn' : 'tone-mute')}>
          <VerdictIcon size={17} className="mt-0.5 shrink-0" />
          <p>
            <b>{verdict.title}.</b> <span className="opacity-90">{verdict.text}</span>
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <NumInput value={w} onChange={setW} placeholder={today ? `Corriger la pesée du jour (${unit})` : `Pesée du jour (${unit})`} className="flex-1" ariaLabel="Poids de corps" />
          <button className="btn btn-primary shrink-0" disabled={!w || w <= 0} onClick={add}>
            <Plus size={18} /> {today ? 'Corriger' : 'Ajouter'}
          </button>
        </div>
      </div>

      {series.length >= 2 && (
        <>
          <div className="mt-6">
            <Segmented
              value={period}
              onChange={setPeriod}
              tone="neutral"
              ariaLabel="Période"
              options={[
                { value: '4w', label: '4 sem.' },
                { value: '3m', label: '3 mois' },
                { value: 'all', label: 'Tout' }
              ]}
            />
          </div>
          <div className="card mt-3 p-4">
            <h3 className="headline">Évolution</h3>
            <p className="mt-0.5 text-xs text-faint">Les points sont tes pesées. La ligne est la tendance lissée, qui gomme les variations d’eau d’un jour à l’autre.</p>
            {shown.length >= 2 ? (
              <div className="mt-3 h-52">
                <ResponsiveContainer>
                  <ComposedChart data={shown} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke={pal.line} strokeOpacity={0.6} vertical={false} />
                    <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtDay(t)} minTickGap={28} {...axis} />
                    <YAxis domain={['auto', 'auto']} width={44} tickFormatter={(v) => fmt(v, 0)} {...axis} />
                    <Tooltip
                      contentStyle={{ background: pal.raised, border: `1px solid ${pal.line}`, borderRadius: 14, color: pal.ink, fontSize: 13, padding: '8px 12px' }}
                      labelStyle={{ color: pal.mute, marginBottom: 2 }}
                      itemStyle={{ color: pal.ink, padding: 0 }}
                      cursor={{ stroke: pal.faint, strokeDasharray: '3 3' }}
                      labelFormatter={(t) => fmtDate(t as number, { day: 'numeric', month: 'long', year: 'numeric' })}
                      formatter={(v: number, name) => [`${fmt(v)} ${unit}`, name]}
                    />
                    <Line dataKey="weight" name="Pesée" stroke="none" isAnimationActive={false} dot={{ r: 3, fill: pal.faint, stroke: 'none' }} activeDot={{ r: 5, fill: pal.mute, stroke: 'none' }} />
                    <Line dataKey="trend" name="Tendance" stroke={pal.chart1} strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5, fill: pal.chart1, stroke: pal.surface, strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-mute">Pas assez de pesées sur cette période.</p>
            )}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: pal.chart1 }} /> Tendance
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: pal.faint }} /> Pesée
              </li>
            </ul>
          </div>
        </>
      )}

      <SectionHeader title="Objectif" />
      <div className="card p-4">
        <Segmented
          value={settings.goal}
          onChange={(goal: Goal) => saveSettings({ goal })}
          size="lg"
          ariaLabel="Objectif de poids"
          options={[
            { value: 'bulk', label: 'Prise' },
            { value: 'maintain', label: 'Maintien' },
            { value: 'cut', label: 'Sèche' }
          ]}
        />
        <p className="mt-3 text-sm leading-relaxed text-mute">
          {settings.goal === 'maintain' ? (
            <>En maintien, ton poids devrait rester stable, à ± 0,1 % par semaine.</>
          ) : (
            <>
              En {GOAL_FR[settings.goal]}, vise{' '}
              <b className="num text-ink">
                {fmtSigned(lo, 2)} à {fmtSigned(hi, 2)} %
              </b>{' '}
              de ton poids par semaine
              {last && (
                <>
                  , soit{' '}
                  <b className="num text-ink">
                    {fmt(Math.abs((lo * last.weight) / 100), 1)} à {fmt(Math.abs((hi * last.weight) / 100), 1)} {unit}
                  </b>
                </>
              )}
              .{settings.goal === 'bulk' && level === 'advanced' ? ` Niveau ${LEVEL_FR[level]} : le bas de la fourchette suffit.` : ''}
            </>
          )}{' '}
          Le moteur adapte ta vitesse de progression attendue à ta tendance réelle dès qu’il a {p.bwMinPoints} pesées sur {p.bwMinDays} jours.
        </p>
      </div>

      <SectionHeader title="Protéines" />
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <span className="tone-good flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
            <Utensils size={20} />
          </span>
          <div className="min-w-0 flex-1">
            {protein ? (
              <>
                <div className="num text-[22px] font-bold leading-tight">
                  {protein[0]} à {protein[1]} g <span className="text-xs font-medium text-faint">par jour</span>
                </div>
                <div className="text-xs text-faint">
                  {fmt(pr[0], 1)} à {fmt(pr[1], 1)} g par kilo pour {fmt(lastKg!, 1)} kg{unit === 'lb' ? ` (${fmt(fromKg(lastKg!, 'lb'), 0)} lb)` : ''}
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold">
                  {fmt(pr[0], 1)} à {fmt(pr[1], 1)} g par kilo et par jour
                </div>
                <div className="text-xs text-faint">Ajoute une pesée pour voir ta cible en grammes.</div>
              </>
            )}
          </div>
        </div>
        {protein && (
          <p className="mt-3 text-sm leading-relaxed text-mute">
            Sur 4 repas, ça fait environ <b className="num text-ink">{Math.round(protein[0] / 4 / 5) * 5} à {Math.round(protein[1] / 4 / 5) * 5} g</b> par repas.
            {settings.goal === 'cut' && ' En sèche, vise le haut de la fourchette : ça protège ta masse musculaire.'}
          </p>
        )}
        <a className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent" href="#/reglages/guide/nutrition">
          <BookOpen size={15} /> Ce que dit la recherche
        </a>
      </div>

      <SectionHeader title="Sommeil des 7 dernières nuits" />
      <div className="card p-4">
        {slept.length ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Moyenne" value={fmt(mean(slept), 1)} unit="h par nuit" tone={mean(slept) >= p.sleepTarget - 0.25 ? 'good' : 'warn'} />
              <Stat label="Nuits notées" value={slept.length} unit="sur 7" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-1.5" aria-hidden>
              {nights.map((n) => (
                <div key={n.t} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-20 w-full items-end rounded-lg bg-raised/60">
                    {n.h != null && <div className={cx('w-full rounded-lg', n.h >= p.sleepTarget ? 'bg-good/70' : 'bg-warn/70')} style={{ height: `${Math.min(100, (n.h / 9) * 100)}%` }} />}
                  </div>
                  <span className="text-[10px] font-semibold text-faint">{fmtDate(n.t, { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
            <ul className="sr-only">
              {nights.map((n) => (
                <li key={n.t}>
                  {fmtDate(n.t)} : {n.h != null ? sleepLabel(n.h) : 'non noté'}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-faint">Vert : {p.sleepTarget} h ou plus. Tu notes ta nuit en un tap depuis l’écran Séance.</p>
          </>
        ) : (
          <div className="flex items-start gap-3 text-sm text-mute">
            <Moon size={18} className="mt-0.5 shrink-0 text-accent" />
            <p>Note ta nuit en un tap depuis l’écran Séance. Après quelques jours, le coach te dira si ton sommeil suffit à ta récupération.</p>
          </div>
        )}
      </div>

      {bodyweights.length > 0 && (
        <>
          <SectionHeader title={`Pesées (${bodyweights.length})`} />
          <ul className="card divide-y divide-line/60 overflow-hidden">
            {[...bodyweights]
              .reverse()
              .slice(0, 40)
              .map((b) => (
                <li key={b.id} className="flex min-h-[48px] items-center gap-3 px-4">
                  <span className="flex-1 text-sm">{fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <span className="num text-sm font-semibold">
                    {fmt(b.weight)} {b.unit}
                  </span>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-full text-faint active:bg-raised"
                    aria-label={`Supprimer la pesée du ${fmtDate(b.date)}`}
                    onClick={async () => {
                      if (await dialog.confirm({ title: 'Supprimer cette pesée ?', message: `${fmt(b.weight)} ${b.unit} le ${fmtDate(b.date)}.`, confirmLabel: 'Supprimer', danger: true })) db.bodyweights.delete(b.id);
                    }}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
