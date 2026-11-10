/**
 * Moteur de progression.
 * Chaque fonction renvoie, en plus du résultat, la liste des raisons (« pourquoi »)
 * en langage simple, pour que l'app puisse toujours expliquer ses suggestions.
 */
import type { BodyWeight, EngineParams, Exercise, Goal, Level, ProgramDay, Session, Settings, SetLog } from '../types';
import { bodyweightTrend } from './body';
import { epley, repsFor, rirForCalc, weightFor } from './e1rm';
import { DAY_MS, WEEK_MS, clamp, dateKey, fmt, fmtDate, linreg, mean, median, plural, rirLabel, sum, weekStart } from './util';

// ---------------------------------------------------------------- historique

export interface DoneSet {
  weight: number;
  /** Notation en plates saisie, le cas échéant. */
  notation: string;
  reps: number;
  rir: number;
  e1rm: number;
  restSec: number | null;
}

export interface ExerciseSession {
  sessionId: string;
  date: number;
  sets: DoneSet[];
  bestE1rm: number;
  bestSet: DoneSet;
  maxWeight: number;
  volume: number;
  isE1rmPR: boolean;
  isWeightPR: boolean;
  deload: boolean;
}

export const isDone = (s: SetLog) => s.done && s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0;

export function toDoneSet(s: SetLog): DoneSet {
  const rir = rirForCalc(s.rir);
  return { weight: s.weight!, notation: s.notation, reps: s.reps!, rir, e1rm: epley(s.weight!, s.reps!, rir), restSec: s.restTakenSec };
}

/**
 * Toutes les séances où l'exercice a été fait, de la plus ancienne à la plus récente.
 * Les séances de décharge sont exclues par défaut : elles fausseraient les tendances.
 */
export function exerciseHistory(
  sessions: Session[],
  exerciseId: string,
  opts: { excludeSessionId?: string; includeDeload?: boolean } = {}
): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  let bestE = 0;
  let bestW = 0;
  let count = 0;
  for (const s of sorted) {
    if (s.id === opts.excludeSessionId) continue;
    if (s.deload && !opts.includeDeload) continue;
    const sets: DoneSet[] = [];
    for (const se of s.exercises) {
      if (se.exerciseId !== exerciseId || se.skipped) continue;
      for (const set of se.sets) if (isDone(set)) sets.push(toDoneSet(set));
    }
    if (!sets.length) continue;
    const bestSet = sets.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const maxWeight = Math.max(...sets.map((x) => x.weight));
    const counts = !s.deload;
    out.push({
      sessionId: s.id,
      date: s.startedAt,
      sets,
      bestE1rm: bestSet.e1rm,
      bestSet,
      maxWeight,
      volume: sum(sets.map((x) => x.weight * x.reps)),
      isE1rmPR: counts && count > 0 && bestSet.e1rm > bestE + 1e-9,
      isWeightPR: counts && count > 0 && maxWeight > bestW + 1e-9,
      deload: !!s.deload
    });
    if (counts) {
      bestE = Math.max(bestE, bestSet.e1rm);
      bestW = Math.max(bestW, maxWeight);
      count++;
    }
  }
  return out;
}

/** Pente en % par semaine, relative à la valeur ajustée au début de la série. */
export function slopePctPerWeek(points: { date: number; value: number }[]): number | null {
  if (points.length < 2) return null;
  const t0 = points[0].date;
  const reg = linreg(
    points.map((p) => (p.date - t0) / WEEK_MS),
    points.map((p) => p.value)
  );
  if (!reg || reg.intercept <= 0) return null;
  return (reg.slope / reg.intercept) * 100;
}

// ---------------------------------------------------------------- records

export interface Records {
  sessions: number;
  bestE1rm: number;
  maxWeight: number;
  sets: { weight: number; reps: number }[];
}

export function exerciseRecords(history: ExerciseSession[]): Records {
  const sets = history.flatMap((h) => h.sets.map((s) => ({ weight: s.weight, reps: s.reps })));
  return {
    sessions: history.length,
    bestE1rm: Math.max(0, ...history.map((h) => h.bestE1rm)),
    maxWeight: Math.max(0, ...history.map((h) => h.maxWeight)),
    sets
  };
}

/** Ajoute les sets déjà faits aujourd'hui pour ne pas compter deux fois le même record. */
export function withSets(rec: Records, done: DoneSet[]): Records {
  if (!done.length) return rec;
  return {
    sessions: rec.sessions,
    bestE1rm: Math.max(rec.bestE1rm, ...done.map((d) => d.e1rm)),
    maxWeight: Math.max(rec.maxWeight, ...done.map((d) => d.weight)),
    sets: [...rec.sets, ...done.map((d) => ({ weight: d.weight, reps: d.reps }))]
  };
}

export type PRKind = 'e1rm' | 'weight' | 'reps';
export const PR_LABEL: Record<PRKind, string> = { e1rm: 'Record de 1RM estimé', weight: 'Record de charge', reps: 'Record de reps à cette charge' };

/** Records battus par un set (aucun lors de la toute première séance de l'exercice). */
export function detectPRs(set: { weight: number; reps: number; rir: number }, rec: Records): PRKind[] {
  if (rec.sessions === 0) return [];
  const out: PRKind[] = [];
  if (epley(set.weight, set.reps, set.rir) > rec.bestE1rm + 1e-6) out.push('e1rm');
  if (set.weight > rec.maxWeight + 1e-6) out.push('weight');
  else {
    const atOrAbove = rec.sets.filter((s) => s.weight >= set.weight - 1e-6);
    if (atOrAbove.length && set.reps > Math.max(...atOrAbove.map((s) => s.reps)) + 1e-6) out.push('reps');
  }
  return out;
}

export interface SetDelta {
  text: string;
  tone: 'good' | 'mute' | 'bad';
}

/** Comparaison d'un set avec le même set de la dernière séance. */
export function deltaVsLast(set: { weight: number; reps: number; rir: number }, last: DoneSet | undefined, unit: string): SetDelta | null {
  if (!last) return null;
  const e = epley(set.weight, set.reps, set.rir);
  if (Math.abs(set.weight - last.weight) < 1e-6) {
    const d = set.reps + set.rir - (last.reps + last.rir);
    if (Math.abs(d) < 0.25) return { text: 'Égal', tone: 'mute' };
    const eq = set.rir !== last.rir ? ' éq.' : '';
    return { text: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} rep${eq}`, tone: d > 0 ? 'good' : 'bad' };
  }
  const dw = set.weight - last.weight;
  const pct = last.e1rm > 0 ? (e / last.e1rm - 1) * 100 : 0;
  return {
    text: `${dw > 0 ? '+' : '−'}${fmt(Math.abs(dw))} ${unit}`,
    tone: pct >= 0.5 ? 'good' : pct <= -0.5 ? 'bad' : 'mute'
  };
}

// ---------------------------------------------------------------- vitesse attendue

export function levelFromYears(years: number, p: EngineParams): Level {
  if (years >= p.yearsAdvanced) return 'advanced';
  if (years >= p.yearsIntermediate) return 'intermediate';
  return 'beginner';
}

export const LEVEL_FR: Record<Level, string> = { beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'avancé' };
export const GOAL_FR: Record<Goal, string> = { bulk: 'prise de masse', maintain: 'maintien', cut: 'sèche' };

export interface RateResult {
  /** Taux final utilisé (% du 1RM estimé / semaine). */
  rate: number;
  theoretical: number;
  observed: number | null;
  historyWeight: number;
  why: string[];
}

export interface EngineContext {
  settings: Settings;
  bodyweights: BodyWeight[];
  now: number;
}

export function expectedRate(ex: Exercise, history: ExerciseSession[], ctx: EngineContext): RateResult {
  const p = ctx.settings.engine;
  const why: string[] = [];
  const level = levelFromYears(ctx.settings.trainingYears, p);
  const range = level === 'beginner' ? p.rateBeginner : level === 'intermediate' ? p.rateIntermediate : p.rateAdvanced;
  const base = (range[0] + range[1]) / 2;
  why.push(
    `Niveau ${LEVEL_FR[level]} (${fmt(ctx.settings.trainingYears)} ${plural(ctx.settings.trainingYears, 'an')} de pratique) : on part de ${fmt(base, 2)} % de 1RM estimé par semaine, le milieu de la fourchette ${fmt(range[0], 2)}–${fmt(range[1], 2)} %.`
  );

  let rate = base;
  const typeF = ex.type === 'isolation' ? p.isolationFactor : p.compoundFactor;
  if (typeF !== 1) {
    rate *= typeF;
    why.push(
      `${ex.type === 'isolation' ? 'Exercice d’isolation' : 'Exercice composé'} : × ${fmt(typeF, 2)}${typeF < 1 ? ' (un seul muscle travaille, la charge monte plus lentement)' : ''}.`
    );
  }

  const trend = bodyweightTrend(ctx.bodyweights, ctx.now, p);
  if (trend != null) {
    const f = clamp(1 + p.bodyweightTrendK * trend, p.bodyweightFactorMin, p.bodyweightFactorMax);
    rate *= f;
    why.push(
      `Ton poids de corps ${trend >= 0 ? 'monte' : 'baisse'} de ${fmt(Math.abs(trend), 2)} %/sem (pesées des 4 dernières semaines) : × ${fmt(f, 2)}.${trend < 0 ? ' En déficit, on vise surtout à garder sa force.' : ''}`
    );
  } else {
    const g = ctx.settings.goal;
    const f = g === 'bulk' ? p.goalFactorBulk : g === 'cut' ? p.goalFactorCut : p.goalFactorMaintain;
    if (f !== 1) {
      rate *= f;
      why.push(`Objectif « ${GOAL_FR[g]} » (pas assez de pesées pour mesurer ta vraie tendance) : × ${fmt(f, 2)}.`);
    }
  }

  if (history.length >= 2) {
    const start = history[0].bestE1rm;
    const recent = history.slice(-3);
    const cur = mean(recent.map((h) => h.bestE1rm));
    const ratio = cur / start;
    let f = 1;
    if (ratio > 1) f = clamp(1 / (1 + p.gapK * (ratio - 1)), p.gapFactorMin, 1);
    else if (ratio < 1) f = clamp(1 + p.gapK * (1 - ratio), 1, 1.5);
    if (Math.abs(f - 1) > 0.005) {
      rate *= f;
      why.push(
        ratio > 1
          ? `Tu as déjà gagné ${fmt((ratio - 1) * 100, 0)} % de 1RM estimé sur cet exercice depuis tes débuts : les gains suivants sont plus durs, × ${fmt(f, 2)}.`
          : `Tu es ${fmt((1 - ratio) * 100, 0)} % sous ton niveau de départ sur cet exercice : la force revient vite, × ${fmt(f, 2)}.`
      );
    }
  }

  const theoretical = rate;
  let observed: number | null = null;
  let w = 0;
  const recentWindow = history.filter((h) => h.date >= ctx.now - p.recalFullTrustWeeks * WEEK_MS);
  if (recentWindow.length >= 2) {
    const spanWeeks = (recentWindow[recentWindow.length - 1].date - recentWindow[0].date) / WEEK_MS;
    if (spanWeeks >= p.recalMinWeeks && recentWindow.length >= p.recalMinSessions) {
      observed = slopePctPerWeek(recentWindow.map((h) => ({ date: h.date, value: h.bestE1rm })));
      if (observed != null) {
        w = p.recalMaxWeight * Math.min(1, spanWeeks / p.recalFullTrustWeeks);
        const obsUsed = clamp(observed, 0, theoretical * p.recalClampMax);
        rate = (1 - w) * theoretical + w * obsUsed;
        why.push(
          `Recalibrage sur ${recentWindow.length} séances (${fmt(spanWeeks, 0)} sem.) : ta progression réelle est de ${fmt(observed, 2)} %/sem. On mélange ${fmt((1 - w) * 100, 0)} % de théorie et ${fmt(w * 100, 0)} % de ton historique${obsUsed !== observed ? ` (borné à ${fmt(obsUsed, 2)} %)` : ''} : ${fmt(rate, 2)} %/sem.`
        );
      }
    } else {
      why.push(
        `Pas encore de recalibrage sur ton historique : il faut ${p.recalMinWeeks} semaines et ${p.recalMinSessions} séances (tu as ${fmt(spanWeeks, 0)} sem. et ${recentWindow.length} séances).`
      );
    }
  }
  return { rate, theoretical, observed, historyWeight: w, why };
}

// ---------------------------------------------------------------- cible de la séance

export type TargetKind = 'first' | 'follow' | 'match' | 'reps' | 'load-up' | 'load-down' | 'resume' | 'deload';

export interface SetTarget {
  weight: number | null;
  reps: number | null;
  /** RIR visé pour ce set. */
  rir: number;
  kind: TargetKind;
  /** Résumé court : « +1 rep », « +5 lb », « Maintien »… */
  tag: string;
  /** Équivalent en reps à l'échec, quand la dernière fois n'était pas au RIR visé. */
  failureReps: number | null;
  why: string[];
}

export interface TargetPlan {
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: number;
}

export interface TargetOpts {
  /** Sets déjà validés aujourd'hui (null = pas encore fait), alignés sur les index. */
  done?: (DoneSet | null)[];
  /** Semaine de décharge : même charge, plus loin de l'échec. */
  deload?: boolean;
}

const setOf = (h: ExerciseSession, i: number) => h.sets[Math.min(i, h.sets.length - 1)];
const snapDown = (x: number, inc: number) => Math.floor(x / inc + 1e-9) * inc;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Répartit des reps entières sur les sets pour que le total suive la progression attendue
 * (méthode du plus fort reste) : le « +1 rep » va au set qui en est le plus proche.
 */
function allocateWholeReps(xs: number[]): number[] {
  const base = xs.map((x) => Math.floor(x + 1e-6));
  let rem = Math.round(sum(xs)) - sum(base);
  const order = xs
    .map((x, i) => ({ i, frac: x - Math.floor(x + 1e-6), base: base[i] }))
    .sort((a, b) => b.frac - a.frac || a.base - b.base || a.i - b.i);
  for (let k = 0; rem > 0 && order.length; k = (k + 1) % order.length, rem--) base[order[k].i]++;
  return base;
}

/**
 * Cibles charge × reps pour chaque set de la séance.
 *
 * Principe : double progression pilotée par la vitesse attendue.
 * 1. Référence = ta performance récente sur le même set (dernière séance, ou médiane des 3 dernières si tu étais en dessous).
 * 2. On y ajoute la progression attendue. Sur un plateau, elle s'accumule depuis le début du plateau.
 * 3. On convertit en reps entières au RIR visé et on répartit l'arrondi entre les sets.
 * 4. Au-dessus de la fourchette, on monte la charge du plus petit incrément ; nettement en dessous, on la baisse.
 * 5. Pendant la séance, les sets restants s'ajustent à ta forme du jour.
 */
export function sessionTargets(
  ex: Exercise,
  plan: TargetPlan,
  history: ExerciseSession[],
  rate: number,
  now: number,
  p: EngineParams,
  opts: TargetOpts = {}
): SetTarget[] {
  const n = plan.sets;
  const done = opts.done ?? [];
  const deload = !!opts.deload;
  const rirT = deload ? Math.min(4, plan.rirTarget + p.deloadRirBonus) : plan.rirTarget;
  const inc = ex.increment > 0 ? ex.increment : 1;
  const unit = ex.unit;
  const last = history[history.length - 1];

  // ---------- première fois sur cet exercice
  if (!last) {
    return Array.from({ length: n }, (_, i): SetTarget => {
      const prev = [...done.slice(0, i)].reverse().find(Boolean) ?? null;
      if (prev && !done[i]) {
        const reps = Math.max(1, Math.round(repsFor(prev.e1rm * 0.97, prev.weight, rirT)));
        return {
          weight: prev.weight,
          reps,
          rir: rirT,
          kind: 'follow',
          tag: 'Comme le set précédent',
          failureReps: null,
          why: [
            `Pas encore d’historique : la cible reprend la charge de ton set précédent (${fmt(prev.weight)} ${unit} × ${fmt(prev.reps)} @ ${rirLabel(prev.rir)} RIR).`,
            `Avec la fatigue, on perd souvent une rep d’un set à l’autre : viser ${reps} ${plural(reps, 'rep')} à ${rirT} RIR est réaliste.`
          ]
        };
      }
      return {
        weight: null,
        reps: null,
        rir: rirT,
        kind: 'first',
        tag: 'Découverte',
        failureReps: null,
        why: [
          `Première fois : choisis une charge que tu peux faire ${plan.repMin} à ${plan.repMax} fois en gardant ${rirT} ${plural(rirT, 'rep')} en réserve.`,
          'Cette séance servira de point de départ : dès la prochaine, le moteur te proposera une cible.'
        ]
      };
    });
  }

  // ---------- référence par set
  const recent = history.slice(-3).filter((h) => last.date - h.date <= 42 * DAY_MS);
  const gapDays = Math.max(0, (now - last.date) / DAY_MS);
  const refs = Array.from({ length: n }, (_, i) => {
    const l = setOf(last, i);
    const med = median(recent.map((h) => setOf(h, i).e1rm));
    const dipped = med > l.e1rm * 1.005;
    // garde-fou : si tu as volontairement beaucoup baissé, on remonte par paliers et pas d'un coup
    const cap = l.e1rm * (1 + p.maxJumpPct / 100);
    return { l, e: Math.min(Math.max(l.e1rm, med), cap), dipped, capped: med > cap, idx: Math.min(i, last.sets.length - 1) };
  });

  // ---------- depuis quand es-tu à ce niveau ? (plateau)
  const score = (h: ExerciseSession) => mean(refs.map((_, i) => setOf(h, i).e1rm));
  const refScore = mean(refs.map((r) => r.e));
  let anchor = last.date;
  for (let k = history.length - 2; k >= 0 && k >= history.length - 6; k--) {
    if (last.date - history[k].date > 56 * DAY_MS) break;
    if (score(history[k]) >= refScore * 0.995) anchor = history[k].date;
    else break;
  }

  const layoff = gapDays > p.layoffDays;
  const layoffDrop = layoff ? Math.min(p.layoffMaxDropPct, (p.layoffDropPctPerWeek * (gapDays - p.layoffDays)) / 7 + p.layoffDropPctPerWeek) : 0;
  const weeksSingle = clamp(gapDays, 1, p.maxGapDays) / 7;
  const weeksPlateau = clamp((now - anchor) / DAY_MS, 1, 56) / 7;
  const gSingle = Math.pow(1 + rate / 100, weeksSingle);
  const gPlateau = Math.pow(1 + rate / 100, weeksPlateau);

  // ---------- plan « à froid » (sans tenir compte des sets déjà faits aujourd'hui)
  const w0 = refs.map((r) => r.l.weight);
  const a = refs.map((r, i) => repsFor(r.e, w0[i], rirT));
  let x: number[];
  let plateauUsed = false;
  if (deload) x = a;
  else if (layoff) x = refs.map((r, i) => repsFor(r.e * (1 - layoffDrop / 100), w0[i], rirT));
  else {
    const xS = refs.map((r, i) => repsFor(r.e * gSingle, w0[i], rirT));
    const xP = refs.map((r, i) => repsFor(r.e * gPlateau, w0[i], rirT));
    const dS = sum(xS) - sum(a);
    const dP = sum(xP) - sum(a);
    // Après une séance sous ton niveau, on vise d'abord à y revenir : pas de rep « due » en plus.
    const recovering = refs.some((r) => r.dipped);
    const d = recovering ? dS : Math.max(dS, Math.min(dP, p.plateauCapReps));
    plateauUsed = d > dS + 1e-6;
    const k = dP > 1e-9 ? d / dP : 0;
    x = a.map((ai, i) => ai + (xP[i] - ai) * k);
  }
  const whole = deload || layoff ? x.map((v) => Math.max(1, Math.round(v))) : allocateWholeReps(x);

  const build = (i: number, w: number, xi: number, reps: number, extra: string[], forced?: TargetKind): SetTarget => {
    const ref = refs[i];
    // 1RM estimé visé pour ce set (sans passer par epley() qui renvoie 0 pour des reps ≤ 0)
    const tE = w * (1 + (xi + rirT) / 30);
    const why: string[] = [];
    why.push(
      `Référence : set ${ref.idx + 1} du ${fmtDate(last.date)}, ${fmt(ref.l.weight)} ${unit} × ${fmt(ref.l.reps)} @ ${rirLabel(ref.l.rir)} RIR, soit un 1RM estimé de ${fmt(ref.l.e1rm)} ${unit}.`
    );
    if (ref.dipped)
      why.push(
        ref.capped
          ? `Cette séance-là était nettement sous ton niveau récent : on remonte vers lui par paliers de ${fmt(p.maxJumpPct)} % au plus par séance (1RM estimé visé ${fmt(ref.e)} ${unit}).`
          : `Cette séance-là était sous ton niveau récent : on repart de la médiane de tes ${recent.length} dernières séances (1RM estimé ${fmt(ref.e)} ${unit}).`
      );
    why.push(...extra);

    let kind: TargetKind = forced ?? 'match';
    let weight = w;
    let r = reps;
    if (!deload) {
      if (r > plan.repMax) {
        let k = 0;
        let w2 = w;
        let rr = r;
        do {
          k++;
          w2 = w + k * inc;
          rr = Math.round(repsFor(tE, w2, rirT));
        } while (rr > plan.repMax && k < 40);
        if (rr >= plan.repMin) {
          weight = w2;
          r = rr;
          kind = 'load-up';
          why.push(
            `Au même poids il faudrait ${reps} reps, au-dessus de ta fourchette ${plan.repMin}–${plan.repMax} : on monte de ${fmt(w2 - w)} ${unit} (${k > 1 ? `${k} incréments` : 'le plus petit incrément'}) et on repart à ${rr} reps.`
          );
        } else {
          why.push(
            `Tu dépasses ta fourchette ${plan.repMin}–${plan.repMax}, mais le prochain incrément (+${fmt(inc)} ${unit}) est trop gros : tu tomberais à ${Math.max(0, rr)} reps. On continue donc à monter les reps avant de changer de charge.`
          );
        }
      } else if (r < plan.repMin - p.belowRangeTolerance) {
        let k = 0;
        let w2 = w;
        let rr = r;
        // on baisse le moins possible : juste assez pour revenir à une rep de la fourchette
        const floor = plan.repMin - p.belowRangeTolerance;
        while (rr < floor && k < 40 && w - (k + 1) * inc > 0) {
          k++;
          w2 = w - k * inc;
          rr = Math.round(repsFor(tE, w2, rirT));
        }
        if (k > 0 && rr >= floor) {
          weight = w2;
          r = Math.min(rr, plan.repMax);
          kind = 'load-down';
          why.push(
            `Au même poids tu serais à ${Math.max(0, reps)} ${plural(reps, 'rep')}, nettement sous ta fourchette ${plan.repMin}–${plan.repMax} : on baisse de ${fmt(w - w2)} ${unit}, juste assez pour s’en rapprocher. Les reps remonteront ensuite.`
          );
        }
      } else if (r < plan.repMin) {
        why.push(`${r} ${plural(r, 'rep')}, c’est juste sous ta fourchette ${plan.repMin}–${plan.repMax} : on garde la charge, les reps vont remonter.`);
      }
    }
    r = Math.max(1, r);

    const baseline = Math.round(repsFor(ref.e, weight, rirT));
    const diff = r - baseline;
    let tag: string;
    if (deload) {
      kind = 'deload';
      tag = 'Décharge';
    } else if (layoff && !forced) {
      kind = 'resume';
      tag = 'Reprise';
    } else if (kind === 'load-up') tag = `+${fmt(weight - ref.l.weight)} ${unit}`;
    else if (kind === 'load-down') tag = `−${fmt(ref.l.weight - weight)} ${unit}`;
    else if (diff > 0) {
      kind = 'reps';
      tag = `+${diff} ${plural(diff, 'rep')}`;
    } else tag = 'Maintien';

    const failureReps = ref.l.rir !== rirT && rirT > 0 ? r + rirT : null;
    if (failureReps != null)
      why.push(`${r} ${plural(r, 'rep')} en gardant ${rirT} en réserve, c’est l’équivalent de ${failureReps} reps à l’échec. La dernière fois, tu étais à ${rirLabel(ref.l.rir)} RIR.`);
    return { weight: r2(weight), reps: r, rir: rirT, kind, tag, failureReps, why };
  };

  const coldExtra = (i: number): string[] => {
    const out: string[] = [];
    if (deload) {
      out.push(`Semaine de décharge : même charge, mais on s’arrête à ${rirT} reps de l’échec (au lieu de ${plan.rirTarget}) pour évacuer la fatigue sans perdre le geste.`);
      return out;
    }
    if (layoff) {
      out.push(
        `Tu n’as pas fait cet exercice depuis ${fmt(gapDays, 0)} jours : on reprend ${fmt(layoffDrop, 1)} % plus bas. La force revient vite, le moteur remontera dès la prochaine séance.`
      );
      return out;
    }
    if (plateauUsed) {
      out.push(
        `Tu es à ce niveau depuis le ${fmtDate(anchor)} (${fmt(weeksPlateau, 0)} sem.). Au rythme attendu de ${fmt(rate, 2)} %/sem, il est temps d’ajouter une rep sur un de tes sets.`
      );
    } else {
      out.push(
        `Rythme attendu : ${fmt(rate, 2)} %/sem, soit +${fmt((gSingle - 1) * 100, 2)} % depuis ta dernière séance il y a ${fmt(gapDays, 0)} ${plural(Math.round(gapDays), 'jour')}${gapDays > p.maxGapDays ? ` (plafonné à ${p.maxGapDays} j)` : ''}.`
      );
    }
    const got = whole[i] > Math.floor(x[i] + 1e-6);
    out.push(
      `À ${fmt(w0[i])} ${unit} et ${rirT} RIR, cela fait ${fmt(x[i], 1)} reps. Les reps sont entières : le moteur répartit l’arrondi entre tes sets${got ? ' et place la rep en plus sur celui-ci' : ''}.`
    );
    return out;
  };

  const cold = refs.map((_, i) => build(i, w0[i], x[i], whole[i], coldExtra(i)));
  const doneIdx = done.map((d, i) => (d ? i : -1)).filter((i) => i >= 0 && i < n);
  if (!doneIdx.length || deload) return cold;

  // ---------- autorégulation : forme du jour et charge choisie
  const reliable = doneIdx.filter((j) => done[j]!.rir < 4);
  const form = reliable.length ? mean(reliable.map((j) => done[j]!.e1rm / refs[j].e)) - 1 : 0;
  const maxAdj = p.autoRegMaxPct / 100;
  const adj = Math.abs(form) * 100 > p.autoRegDeadPct ? clamp(form, -maxAdj, maxAdj) : 0;

  return refs.map((_, i) => {
    if (done[i]) return cold[i];
    const prevIdx = [...doneIdx].reverse().find((j) => j < i) ?? doneIdx[doneIdx.length - 1];
    const prev = done[prevIdx]!;
    const shift = prev.weight - (cold[prevIdx].weight ?? prev.weight);
    if (adj === 0 && Math.abs(shift) < 1e-6) return cold[i];

    const baseW = cold[i].weight ?? w0[i];
    const w = Math.max(inc, r2(baseW + shift));
    const coldE = baseW * (1 + ((cold[i].reps ?? x[i]) + rirT) / 30);
    const xi = repsFor(coldE * (1 + adj), w, rirT);
    const extra: string[] = [];
    if (adj !== 0)
      extra.push(
        `Forme du jour : tes sets validés sont à ${form > 0 ? '+' : '−'}${fmt(Math.abs(form) * 100, 1)} % de ton niveau habituel. Les sets restants sont ajustés d’autant${Math.abs(form) > maxAdj ? ` (plafonné à ${p.autoRegMaxPct} %)` : ''}.`
      );
    if (Math.abs(shift) > 1e-6)
      extra.push(`Tu as choisi ${fmt(prev.weight)} ${unit} au lieu de ${fmt(cold[prevIdx].weight)} sur le set ${prevIdx + 1} : la suite garde le même décalage.`);
    extra.push(`À ${fmt(w)} ${unit} et ${rirT} RIR, cela fait ${fmt(xi, 1)} reps, arrondi à ${Math.max(1, Math.round(xi))}.`);
    const t = build(i, w, xi, Math.max(1, Math.round(xi)), extra, 'match');
    if (t.kind === 'match' || t.kind === 'reps') {
      const lastEq = Math.round(repsFor(refs[i].e, t.weight!, rirT));
      const d = t.reps! - lastEq;
      t.kind = d > 0 ? 'reps' : 'match';
      t.tag = adj > 0 ? 'Bonne forme' : adj < 0 ? 'Forme du jour' : d > 0 ? `+${d} ${plural(d, 'rep')}` : 'Maintien';
    }
    return t;
  });
}

/** Résumé d'une cible pour l'affichage compact : « 205 × 8 ». */
export function targetLabel(t: SetTarget | undefined): string | null {
  if (!t || t.weight == null || t.reps == null) return null;
  return `${fmt(t.weight)} × ${fmt(t.reps)}`;
}

// ---------------------------------------------------------------- échauffement

export interface WarmupSet {
  weight: number;
  reps: number;
  pct: number;
}

/**
 * Sets de montée en charge avant le premier set de travail.
 * Légers et loin de l'échec : ils préparent sans fatiguer et ne comptent pas dans le volume.
 */
export function warmupSets(ex: Exercise, topWeight: number | null, firstForMuscle: boolean): WarmupSet[] {
  if (!topWeight || topWeight <= 0) return [];
  const scheme: [number, number][] =
    ex.type === 'compound'
      ? firstForMuscle
        ? [
            [0.5, 8],
            [0.7, 4],
            [0.85, 2]
          ]
        : [[0.7, 4]]
      : firstForMuscle
        ? [
            [0.5, 8],
            [0.75, 3]
          ]
        : [[0.65, 5]];
  const inc = ex.increment > 0 ? ex.increment : 1;
  const out: WarmupSet[] = [];
  for (const [pct, reps] of scheme) {
    const w = Math.max(ex.baseWeight || 0, snapDown(topWeight * pct, inc));
    if (w <= 0 || w >= topWeight || out.some((o) => o.weight === w)) continue;
    out.push({ weight: r2(w), reps, pct });
  }
  return out;
}

// ---------------------------------------------------------------- projection

export interface Projection {
  text: string;
  why: string[];
}

export function projections(
  ex: Exercise,
  plan: { repMin: number; repMax: number; rirTarget: number },
  history: ExerciseSession[],
  rate: number,
  now: number
): Projection[] {
  if (!history.length || rate <= 0) return [];
  const recent = history.slice(-3);
  const cur = Math.max(...recent.map((h) => h.bestE1rm));
  const last = history[history.length - 1];
  const topW = last.maxWeight;
  const step = ex.unit === 'lb' ? (topW >= 100 ? 10 : 5) : topW >= 50 ? 5 : 2.5;
  const out: Projection[] = [];
  const r = Math.log(1 + rate / 100);

  const nextRound = Math.ceil((topW + (ex.increment || 1)) / step) * step;
  for (const g of [
    { w: nextRound, reps: plan.repMin },
    { w: nextRound, reps: plan.repMax }
  ]) {
    const need = epley(g.w, g.reps, plan.rirTarget);
    const weeks = need <= cur ? 0 : Math.log(need / cur) / r;
    if (weeks > 104) continue;
    out.push({
      text:
        weeks === 0
          ? `${fmt(g.w)} × ${g.reps} @ ${plan.rirTarget} RIR est déjà à ta portée.`
          : `À ce rythme : ${fmt(g.w)} × ${g.reps} vers le ${fmtDate(now + weeks * WEEK_MS)}.`,
      why: [
        `${fmt(g.w)} × ${g.reps} @ ${plan.rirTarget} RIR correspond à un 1RM estimé de ${fmt(need)} ${ex.unit}. Tu es à ${fmt(cur)} (meilleure de tes 3 dernières séances).`,
        `À ${fmt(rate, 2)} %/sem, il faut environ ${fmt(weeks, 1)} ${plural(weeks, 'semaine')}.`
      ]
    });
  }
  const in12 = cur * Math.pow(1 + rate / 100, 12);
  out.push({
    text: `Dans 12 semaines : environ ${fmt(snapDown(weightFor(in12, plan.repMax, plan.rirTarget), ex.increment || 1))} × ${plan.repMax}.`,
    why: [`1RM estimé attendu dans 12 semaines : ${fmt(in12)} ${ex.unit}, soit ${fmt(cur)} × (1 + ${fmt(rate, 2)} %) douze fois de suite.`]
  });
  return out;
}

// ---------------------------------------------------------------- courbe attendue

export interface CurvePoint {
  date: number;
  actual: number | null;
  expected: number;
  band: [number, number];
  pr: boolean;
}

export function expectedCurve(points: ExerciseSession[], rate: number, tolPct: number, until?: number): CurvePoint[] {
  if (!points.length) return [];
  const t0 = points[0].date;
  const e0 = points[0].bestE1rm;
  const exp = (t: number) => e0 * Math.pow(1 + rate / 100, (t - t0) / WEEK_MS);
  const out: CurvePoint[] = points.map((p) => {
    const e = exp(p.date);
    return { date: p.date, actual: p.bestE1rm, expected: e, band: [e * (1 - tolPct / 100), e * (1 + tolPct / 100)], pr: p.isE1rmPR };
  });
  if (until && until > points[points.length - 1].date + DAY_MS) {
    const e = exp(until);
    out.push({ date: until, actual: null, expected: e, band: [e * (1 - tolPct / 100), e * (1 + tolPct / 100)], pr: false });
  }
  return out;
}

// ---------------------------------------------------------------- statut

export type StatusKind = 'insufficient' | 'ahead' | 'ontrack' | 'slow' | 'stall' | 'regress';

export interface StatusResult {
  kind: StatusKind;
  label: string;
  observed: number | null;
  /** Fenêtres consécutives sans progrès (0 si l'exercice progresse). */
  stalls: number;
  advice: string[];
  why: string[];
}

export const STATUS_LABEL: Record<StatusKind, string> = {
  insufficient: 'En attente de données',
  ahead: 'En avance',
  ontrack: 'Dans la cible',
  slow: 'Progression lente',
  stall: 'Stagnation',
  regress: 'Régression'
};

export const STATUS_TONE: Record<StatusKind, 'good' | 'warn' | 'bad' | 'mute'> = {
  insufficient: 'mute',
  ahead: 'good',
  ontrack: 'good',
  slow: 'warn',
  stall: 'warn',
  regress: 'bad'
};

function classify(slope: number, rate: number, p: EngineParams): StatusKind {
  if (slope < -p.regressionPct) return 'regress';
  if (slope <= p.stagnationPct) return 'stall';
  if (rate > 0 && slope >= rate * p.aheadRatio) return 'ahead';
  if (slope >= rate * p.onTrackRatio) return 'ontrack';
  return 'slow';
}

function windowSlope(history: ExerciseSession[], end: number, weeks: number) {
  const pts = history.filter((h) => h.date > end - weeks * WEEK_MS && h.date <= end);
  return { pts, slope: pts.length >= 2 ? slopePctPerWeek(pts.map((h) => ({ date: h.date, value: h.bestE1rm }))) : null };
}

export function exerciseStatus(history: ExerciseSession[], rate: number, rirTarget: number, p: EngineParams): StatusResult {
  const none = (why: string): StatusResult => ({ kind: 'insufficient', label: STATUS_LABEL.insufficient, observed: null, stalls: 0, advice: [], why: [why] });
  if (!history.length) return none('Aucune séance enregistrée pour cet exercice.');
  const end = history[history.length - 1].date;
  const { pts, slope } = windowSlope(history, end, p.statusWindowWeeks);
  if (pts.length < p.statusMinSessions || slope == null) {
    return none(`Il faut au moins ${p.statusMinSessions} séances sur les ${p.statusWindowWeeks} dernières semaines pour juger une tendance (tu en as ${pts.length}).`);
  }
  const kind = classify(slope, rate, p);
  const why = [
    `Sur les ${p.statusWindowWeeks} dernières semaines (${pts.length} séances), ton 1RM estimé évolue de ${slope >= 0 ? '+' : ''}${fmt(slope, 2)} %/sem pour +${fmt(rate, 2)} %/sem attendus.`
  ];
  if (kind === 'stall') why.push(`Entre −${fmt(p.regressionPct, 2)} et +${fmt(p.stagnationPct, 2)} %/sem, on parle de stagnation.`);
  if (kind === 'regress') why.push(`Sous −${fmt(p.regressionPct, 2)} %/sem, on parle de régression.`);
  if (kind === 'slow') why.push(`Tu progresses, mais à moins de ${fmt(p.onTrackRatio * 100, 0)} % du rythme attendu.`);
  if (kind === 'ontrack') why.push(`C’est au moins ${fmt(p.onTrackRatio * 100, 0)} % du rythme attendu.`);
  if (kind === 'ahead') why.push(`C’est plus de ${fmt(p.aheadRatio * 100, 0)} % du rythme attendu.`);

  const advice: string[] = [];
  // fenêtres précédentes : stagnation répétée → décharge
  let stalls = kind === 'stall' || kind === 'regress' ? 1 : 0;
  if (stalls) {
    let winEnd = end - p.statusWindowWeeks * WEEK_MS;
    for (let k = 1; k < 6; k++) {
      const prev = windowSlope(history, winEnd, p.statusWindowWeeks);
      if (prev.pts.length < 2 || prev.slope == null) break;
      const pk = classify(prev.slope, rate, p);
      if (pk !== 'stall' && pk !== 'regress') break;
      stalls++;
      winEnd -= p.statusWindowWeeks * WEEK_MS;
    }
  }
  if (stalls >= p.deloadAfterStalls) {
    advice.push(
      `${stalls} périodes de ${p.statusWindowWeeks} semaines sans progrès : fais une semaine de décharge, puis reprends. Si ça ne repart pas, change de variante ou de fourchette de reps.`
    );
  } else if (kind === 'regress') {
    advice.push('Regarde ton sommeil, tes calories et tes protéines. Une baisse ponctuelle n’est pas grave. Si elle dure, une décharge aidera.');
  } else if (kind === 'stall') {
    advice.push('Garde la charge et cherche une rep de plus sur un seul set. Si la stagnation continue, le moteur proposera une décharge.');
  } else if (kind === 'ahead') {
    advice.push('Excellent. Le recalibrage relève automatiquement ton rythme attendu.');
  }
  const rirs = pts.flatMap((h) => h.sets.map((s) => s.rir));
  if (rirs.length) {
    const avg = mean(rirs);
    if (avg < rirTarget - p.rirDriftWarn)
      advice.push(`Ton RIR moyen est de ${fmt(avg)} pour ${rirTarget} visé : tu vas plus près de l’échec que prévu, ce qui coûte de la récupération.`);
    else if (avg > rirTarget + p.rirDriftWarn)
      advice.push(`Ton RIR moyen est de ${fmt(avg)} pour ${rirTarget} visé : tu en gardes beaucoup en réserve. Pousse un peu plus près de la cible.`);
  }
  return { kind, label: STATUS_LABEL[kind], observed: slope, stalls, advice, why };
}

// ---------------------------------------------------------------- volume hebdo

export interface MuscleWeek {
  /** Sets durs, les muscles secondaires comptant pour une fraction. */
  sets: number;
  /** Sets durs où le muscle est la cible principale. */
  direct: number;
  /** Jours distincts où le muscle a reçu au moins un set dur. */
  days: Set<string>;
}

/** Sets durs par muscle et par semaine (lundi → dimanche). */
export function weeklyMuscleStats(sessions: Session[], exercises: Map<string, Exercise>, p: EngineParams): Map<number, Map<string, MuscleWeek>> {
  const weeks = new Map<number, Map<string, MuscleWeek>>();
  const add = (m: Map<string, MuscleWeek>, muscle: string, sets: number, direct: number, day: string) => {
    let s = m.get(muscle);
    if (!s) m.set(muscle, (s = { sets: 0, direct: 0, days: new Set() }));
    s.sets += sets;
    s.direct += direct;
    s.days.add(day);
  };
  for (const s of sessions) {
    const wk = weekStart(s.startedAt);
    let m = weeks.get(wk);
    if (!m) weeks.set(wk, (m = new Map()));
    const day = dateKey(s.startedAt);
    for (const se of s.exercises) {
      if (se.skipped) continue;
      const ex = exercises.get(se.exerciseId);
      if (!ex) continue;
      const hard = se.sets.filter((x) => isDone(x) && rirForCalc(x.rir) <= p.hardSetRir).length;
      if (!hard) continue;
      add(m, ex.primaryMuscle, hard, hard, day);
      for (const sm of ex.secondaryMuscles) add(m, sm, hard * p.secondaryWeight, 0, day);
    }
  }
  return weeks;
}

export interface PlannedMuscle {
  sets: number;
  direct: number;
  /** Nombre de séances par semaine qui touchent ce muscle. */
  freq: number;
}

/** Volume hebdomadaire prévu par le programme (chaque jour compte une fois par jour de semaine assigné). */
export function plannedWeekly(days: ProgramDay[], exercises: Map<string, Exercise>, p: EngineParams): Map<string, PlannedMuscle> {
  const out = new Map<string, PlannedMuscle>();
  const get = (m: string) => {
    let v = out.get(m);
    if (!v) out.set(m, (v = { sets: 0, direct: 0, freq: 0 }));
    return v;
  };
  for (const d of days) {
    const times = Math.max(1, d.weekdays.length);
    const touched = new Set<string>();
    for (const it of d.items) {
      const ex = exercises.get(it.exerciseId);
      if (!ex || it.rirTarget > p.hardSetRir) continue;
      const pm = get(ex.primaryMuscle);
      pm.sets += it.sets * times;
      pm.direct += it.sets * times;
      touched.add(ex.primaryMuscle);
      for (const sm of ex.secondaryMuscles) {
        get(sm).sets += it.sets * p.secondaryWeight * times;
        touched.add(sm);
      }
    }
    for (const m of touched) get(m).freq += times;
  }
  return out;
}

/** Durée estimée d'un jour du programme (minutes) : repos + ~45 s d'effort par set + 2 min d'installation par exercice. */
export function estimateDayMinutes(day: ProgramDay, exercises: Map<string, Exercise>, globalRestSec: number): number {
  let sec = 0;
  for (const it of day.items) {
    const ex = exercises.get(it.exerciseId);
    const rest = it.restSec ?? ex?.restSec ?? globalRestSec;
    sec += it.sets * 45 + Math.max(0, it.sets - 1) * rest + 120;
  }
  return Math.round(sec / 60);
}
