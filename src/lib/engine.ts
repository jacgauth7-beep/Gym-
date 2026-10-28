/**
 * Moteur de progression.
 * Chaque fonction renvoie, en plus du résultat, la liste des raisons (« pourquoi »)
 * en langage simple, pour que l'app puisse toujours expliquer ses suggestions.
 */
import type { BodyWeight, EngineParams, Exercise, Goal, Level, ProgramItem, Session, Settings, SetLog } from '../types';
import { epley, repsFor, rirForCalc, weightFor } from './e1rm';
import { DAY_MS, WEEK_MS, clamp, fmt, fmtDate, linreg } from './util';

// ---------------------------------------------------------------- historique

export interface DoneSet {
  weight: number;
  /** Notation en plates saisie, le cas échéant. */
  notation: string;
  reps: number;
  rir: number;
  e1rm: number;
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
}

export const isDone = (s: SetLog) => s.done && s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0;

/** Toutes les séances où l'exercice a été fait, de la plus ancienne à la plus récente. */
export function exerciseHistory(sessions: Session[], exerciseId: string, excludeSessionId?: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  let bestE = 0;
  let bestW = 0;
  for (const s of sorted) {
    if (s.id === excludeSessionId) continue;
    const sets: DoneSet[] = [];
    for (const se of s.exercises) {
      if (se.exerciseId !== exerciseId || se.skipped) continue;
      for (const set of se.sets) {
        if (!isDone(set)) continue;
        const rir = rirForCalc(set.rir);
        sets.push({ weight: set.weight!, notation: set.notation, reps: set.reps!, rir, e1rm: epley(set.weight!, set.reps!, rir) });
      }
    }
    if (!sets.length) continue;
    const bestSet = sets.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const maxWeight = Math.max(...sets.map((x) => x.weight));
    const e: ExerciseSession = {
      sessionId: s.id,
      date: s.startedAt,
      sets,
      bestE1rm: bestSet.e1rm,
      bestSet,
      maxWeight,
      volume: sets.reduce((a, x) => a + x.weight * x.reps, 0),
      isE1rmPR: out.length > 0 && bestSet.e1rm > bestE + 1e-9,
      isWeightPR: out.length > 0 && maxWeight > bestW + 1e-9
    };
    bestE = Math.max(bestE, bestSet.e1rm);
    bestW = Math.max(bestW, maxWeight);
    out.push(e);
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

/** Tendance du poids de corps (%/sem) sur les 4 dernières semaines, si mesurable. */
export function bodyweightTrend(bws: BodyWeight[], now: number): number | null {
  const pts = bws
    .filter((b) => b.date >= now - 28 * DAY_MS && b.date <= now)
    .sort((a, b) => a.date - b.date)
    .map((b) => ({ date: b.date, value: b.weight }));
  if (pts.length < 2 || pts[pts.length - 1].date - pts[0].date < 10 * DAY_MS) return null;
  return slopePctPerWeek(pts);
}

export function expectedRate(ex: Exercise, history: ExerciseSession[], ctx: EngineContext): RateResult {
  const p = ctx.settings.engine;
  const why: string[] = [];
  const level = levelFromYears(ctx.settings.trainingYears, p);
  const range = level === 'beginner' ? p.rateBeginner : level === 'intermediate' ? p.rateIntermediate : p.rateAdvanced;
  const base = (range[0] + range[1]) / 2;
  why.push(
    `Niveau ${LEVEL_FR[level]} (${fmt(ctx.settings.trainingYears)} an(s) de pratique) : on part de ${fmt(base, 2)} %/sem, le milieu de la fourchette ${fmt(range[0], 2)}–${fmt(range[1], 2)} %.`
  );

  let rate = base;
  const typeF = ex.type === 'isolation' ? p.isolationFactor : p.compoundFactor;
  if (typeF !== 1) {
    rate *= typeF;
    why.push(
      `${ex.type === 'isolation' ? 'Exercice d’isolation' : 'Exercice composé'} : × ${fmt(typeF, 2)} (${typeF < 1 ? 'les petits muscles et les mouvements simples progressent plus lentement en charge' : 'ajustement composé'}).`
    );
  }

  const trend = bodyweightTrend(ctx.bodyweights, ctx.now);
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
      why.push(`Objectif « ${GOAL_FR[g]} » (pas assez de pesées pour mesurer ta tendance) : × ${fmt(f, 2)}.`);
    }
  }

  if (history.length >= 2) {
    const start = history[0].bestE1rm;
    const recent = history.slice(-3);
    const cur = recent.reduce((a, h) => a + h.bestE1rm, 0) / recent.length;
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
          `Recalibrage sur ${recentWindow.length} séances (${fmt(spanWeeks, 0)} sem.) : ta progression réelle est de ${fmt(observed, 2)} %/sem. On mélange ${fmt((1 - w) * 100, 0)} % théorie + ${fmt(w * 100, 0)} % historique${obsUsed !== observed ? ` (historique borné à ${fmt(obsUsed, 2)} %)` : ''} → ${fmt(rate, 2)} %/sem.`
        );
      }
    } else {
      why.push(
        `Pas encore de recalibrage : il faut ${p.recalMinWeeks} semaines et ${p.recalMinSessions} séances de données (tu as ${fmt(spanWeeks, 0)} sem., ${recentWindow.length} séances).`
      );
    }
  }
  return { rate, theoretical, observed, historyWeight: w, why };
}

// ---------------------------------------------------------------- cible de la séance

export interface SetTarget {
  weight: number | null;
  reps: number | null;
  why: string[];
}

const ceilHalf = (x: number) => Math.ceil(x * 2 - 1e-9) / 2;
const roundTo = (x: number, inc: number) => Math.round(x / inc) * inc;
const floorTo = (x: number, inc: number) => Math.floor(x / inc + 1e-9) * inc;

export function sessionTargets(
  ex: Exercise,
  plan: Pick<ProgramItem, 'repMin' | 'repMax' | 'rirTarget'> & { sets: number },
  history: ExerciseSession[],
  rate: number,
  now: number,
  p: EngineParams
): SetTarget[] {
  const last = history[history.length - 1];
  if (!last) {
    return Array.from({ length: plan.sets }, () => ({
      weight: null,
      reps: null,
      why: [
        `Première fois : choisis une charge que tu ferais pour ${plan.repMax} reps en gardant ${plan.rirTarget} rep(s) en réserve. Cette séance servira de point de départ au moteur.`
      ]
    }));
  }
  const days = (now - last.date) / DAY_MS;
  const weeks = Math.min(Math.max(days, 1), p.maxGapDays) / 7;
  const growth = Math.pow(1 + rate / 100, weeks);
  const inc = ex.increment > 0 ? ex.increment : 1;
  const out: SetTarget[] = [];
  for (let i = 0; i < plan.sets; i++) {
    const ref = last.sets[i] ?? last.sets[last.sets.length - 1];
    const why: string[] = [];
    why.push(
      `Référence : set ${Math.min(i, last.sets.length - 1) + 1} du ${fmtDate(last.date)} — ${fmt(ref.weight)} × ${fmt(ref.reps)} @ ${ref.rir} RIR = 1RM estimé ${fmt(ref.e1rm)} ${ex.unit}.`
    );
    const T = ref.e1rm * growth;
    why.push(
      `À ${fmt(rate, 2)} %/sem sur ${fmt(weeks * 7, 0)} jour(s)${days > p.maxGapDays ? ` (pause de ${fmt(days, 0)} j plafonnée à ${p.maxGapDays})` : ''}, la cible de 1RM estimé est ${fmt(T)} ${ex.unit} (+${fmt((growth - 1) * 100, 2)} %).`
    );
    let w = ref.weight;
    let reps = ceilHalf(repsFor(T, w, plan.rirTarget));
    if (reps > plan.repMax) {
      // double progression : haut de fourchette atteint → plus petit incrément de charge
      let k = 0;
      while (reps > plan.repMax && k < 20) {
        k++;
        w = ref.weight + k * inc;
        reps = ceilHalf(repsFor(T, w, plan.rirTarget));
      }
      reps = Math.max(reps, plan.repMin);
      why.push(
        `Au même poids il faudrait plus de ${plan.repMax} reps (haut de ta fourchette) : on monte de ${fmt(w - ref.weight)} ${ex.unit} (incrément ${fmt(inc)}) et on vise ${fmt(reps)} reps.`
      );
    } else if (reps < plan.repMin) {
      w = Math.max(inc, floorTo(weightFor(T, plan.repMin, plan.rirTarget), inc));
      reps = Math.max(plan.repMin, ceilHalf(repsFor(T, w, plan.rirTarget)));
      if (reps > plan.repMax) reps = plan.repMax;
      why.push(
        `Au même poids tu serais sous ${plan.repMin} reps (bas de fourchette) : on ajuste la charge à ${fmt(w)} ${ex.unit} pour revenir dans la fourchette.`
      );
    } else {
      const diff = reps - ref.reps;
      why.push(
        diff > 0
          ? `Même charge, ${fmt(reps)} reps à ${plan.rirTarget} RIR (+${fmt(diff)} rep${diff > 1 ? 's' : ''}${ref.rir !== plan.rirTarget ? `, en tenant compte du RIR ${ref.rir} → ${plan.rirTarget}` : ''}).`
          : diff < 0
            ? `Même charge, ${fmt(reps)} reps : tu avais ${ref.rir} RIR contre ${plan.rirTarget} visé, la cible est donc à ${plan.rirTarget} RIR.`
            : `Même charge et mêmes reps : on consolide (la progression attendue est trop petite pour une demi-rep).`
      );
    }
    out.push({ weight: roundTo(w, 0.01), reps, why });
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

  const goals: { w: number; reps: number }[] = [];
  const nextRound = Math.ceil((topW + ex.increment) / step) * step;
  goals.push({ w: nextRound, reps: plan.repMin });
  goals.push({ w: nextRound, reps: plan.repMax });
  for (const g of goals) {
    const need = epley(g.w, g.reps, plan.rirTarget);
    const weeks = need <= cur ? 0 : Math.log(need / cur) / r;
    if (weeks > 104) continue;
    const date = now + weeks * WEEK_MS;
    out.push({
      text:
        weeks === 0
          ? `${fmt(g.w)} × ${g.reps} @ ${plan.rirTarget} RIR est déjà à ta portée.`
          : `À ce rythme : ${fmt(g.w)} × ${g.reps} vers le ${fmtDate(date)}.`,
      why: [
        `${fmt(g.w)} × ${g.reps} @ ${plan.rirTarget} RIR ≈ 1RM estimé ${fmt(need)} ${ex.unit}. Tu es à ${fmt(cur)} (meilleure des 3 dernières séances).`,
        `À ${fmt(rate, 2)} %/sem, il faut environ ${fmt(weeks, 1)} semaine(s).`
      ]
    });
  }
  const in12 = cur * Math.pow(1 + rate / 100, 12);
  out.push({
    text: `Dans 12 semaines : ~${fmt(floorTo(weightFor(in12, plan.repMax, plan.rirTarget), ex.increment || 1))} × ${plan.repMax}.`,
    why: [`1RM estimé attendu dans 12 semaines : ${fmt(in12)} ${ex.unit} (${fmt(cur)} × (1 + ${fmt(rate, 2)} %)^12).`]
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
  advice: string[];
  why: string[];
}

export const STATUS_STYLE: Record<StatusKind, { color: string; icon: string }> = {
  insufficient: { color: 'text-mute', icon: '…' },
  ahead: { color: 'text-good', icon: '▲▲' },
  ontrack: { color: 'text-good', icon: '▲' },
  slow: { color: 'text-warn', icon: '↗' },
  stall: { color: 'text-warn', icon: '→' },
  regress: { color: 'text-bad', icon: '▼' }
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

export function exerciseStatus(
  history: ExerciseSession[],
  rate: number,
  rirTarget: number,
  p: EngineParams
): StatusResult {
  const label: Record<StatusKind, string> = {
    insufficient: 'Données insuffisantes',
    ahead: 'En avance',
    ontrack: 'Dans la cible',
    slow: 'Progression lente',
    stall: 'Stagnation',
    regress: 'Régression'
  };
  if (!history.length) return { kind: 'insufficient', label: label.insufficient, observed: null, advice: [], why: ['Aucune séance enregistrée.'] };
  const end = history[history.length - 1].date;
  const { pts, slope } = windowSlope(history, end, p.statusWindowWeeks);
  if (pts.length < p.statusMinSessions || slope == null) {
    return {
      kind: 'insufficient',
      label: label.insufficient,
      observed: null,
      advice: [],
      why: [`Il faut au moins ${p.statusMinSessions} séances sur les ${p.statusWindowWeeks} dernières semaines (tu en as ${pts.length}).`]
    };
  }
  const kind = classify(slope, rate, p);
  const why = [
    `Sur les ${p.statusWindowWeeks} dernières semaines (${pts.length} séances), ton 1RM estimé évolue de ${fmt(slope, 2)} %/sem pour ${fmt(rate, 2)} %/sem attendus.`
  ];
  if (kind === 'stall') why.push(`Entre -${fmt(p.stagnationPct, 2)} et +${fmt(p.stagnationPct, 2)} %/sem, on parle de stagnation.`);
  if (kind === 'regress') why.push(`Sous -${fmt(p.regressionPct, 2)} %/sem, on parle de régression.`);
  if (kind === 'ontrack') why.push(`Au moins ${fmt(p.onTrackRatio * 100, 0)} % du rythme attendu.`);
  if (kind === 'ahead') why.push(`Plus de ${fmt(p.aheadRatio * 100, 0)} % du rythme attendu.`);

  const advice: string[] = [];
  // fenêtres précédentes : stagnation répétée → décharge
  let stalls = kind === 'stall' || kind === 'regress' ? 1 : 0;
  if (stalls) {
    let winEnd = end - p.statusWindowWeeks * WEEK_MS;
    for (let k = 1; k < p.deloadAfterStalls; k++) {
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
      `${stalls} fenêtres de suite sans progrès : fais une semaine de décharge à -${p.deloadPct} % de charge (ou un set en moins), puis reprends. Si ça ne repart pas, change de variante.`
    );
  } else if (kind === 'regress') {
    advice.push('Vérifie sommeil, apport en protéines/calories et volume total. Une baisse ponctuelle n’est pas grave ; si elle dure, une décharge aidera.');
  } else if (kind === 'stall') {
    advice.push('Garde la même charge et cherche une demi-rep de plus par set. Si la stagnation dure une autre fenêtre, le moteur proposera une décharge.');
  } else if (kind === 'ahead') {
    advice.push('Excellent. Le recalibrage va relever ton rythme attendu automatiquement.');
  }
  const rirs = pts.flatMap((h) => h.sets.map((s) => s.rir));
  if (rirs.length) {
    const avg = rirs.reduce((a, b) => a + b, 0) / rirs.length;
    if (avg < rirTarget - p.rirDriftWarn)
      advice.push(`Ton RIR moyen est ${fmt(avg)} pour ${rirTarget} visé : tu vas plus près de l’échec que prévu, ce qui peut freiner la récupération.`);
    else if (avg > rirTarget + p.rirDriftWarn)
      advice.push(`Ton RIR moyen est ${fmt(avg)} pour ${rirTarget} visé : tu en gardes beaucoup en réserve, pousse un peu plus près de la cible.`);
  }
  return { kind, label: label[kind], observed: slope, advice, why };
}

// ---------------------------------------------------------------- volume hebdo

export function weeklyHardSets(
  sessions: Session[],
  exercises: Map<string, Exercise>,
  p: EngineParams,
  weekStartFn: (ts: number) => number
): Map<number, Map<string, number>> {
  const weeks = new Map<number, Map<string, number>>();
  for (const s of sessions) {
    const wk = weekStartFn(s.startedAt);
    let m = weeks.get(wk);
    if (!m) weeks.set(wk, (m = new Map()));
    for (const se of s.exercises) {
      if (se.skipped) continue;
      const ex = exercises.get(se.exerciseId);
      if (!ex) continue;
      const hard = se.sets.filter((x) => isDone(x) && rirForCalc(x.rir) <= p.hardSetRir).length;
      if (!hard) continue;
      m.set(ex.primaryMuscle, (m.get(ex.primaryMuscle) ?? 0) + hard);
      for (const sm of ex.secondaryMuscles) m.set(sm, (m.get(sm) ?? 0) + hard * p.secondaryWeight);
    }
  }
  return weeks;
}
