/** Poids de corps : tendance lissée, vitesse de prise / perte, cibles de protéines. */
import type { BodyWeight, EngineParams, Goal, Level, Unit } from '../types';
import { DAY_MS, LB_PER_KG, WEEK_MS, fmt, linreg } from './util';

export const toKg = (b: Pick<BodyWeight, 'weight' | 'unit'>) => (b.unit === 'kg' ? b.weight : b.weight / LB_PER_KG);
export const fromKg = (kg: number, unit: Unit) => (unit === 'kg' ? kg : kg * LB_PER_KG);

/**
 * Tendance du poids de corps (% par semaine) sur les 4 dernières semaines.
 * Il faut assez de pesées étalées dans le temps : le poids varie de ±1 % d'un jour à l'autre (eau, repas).
 */
export function bodyweightTrend(bws: BodyWeight[], now: number, p: Pick<EngineParams, 'bwMinPoints' | 'bwMinDays'> = { bwMinPoints: 4, bwMinDays: 14 }): number | null {
  const pts = bws.filter((b) => b.date >= now - 28 * DAY_MS && b.date <= now + DAY_MS).sort((a, b) => a.date - b.date);
  if (pts.length < p.bwMinPoints || pts[pts.length - 1].date - pts[0].date < p.bwMinDays * DAY_MS) return null;
  const t0 = pts[0].date;
  const reg = linreg(
    pts.map((b) => (b.date - t0) / WEEK_MS),
    pts.map(toKg)
  );
  if (!reg || reg.intercept <= 0) return null;
  return (reg.slope / reg.intercept) * 100;
}

export interface BodyPoint {
  date: number;
  weight: number;
  /** Moyenne mobile exponentielle : gomme les variations d'eau. */
  trend: number;
}

/** Série triée avec tendance lissée (≈ 10 % par jour, ajusté à l'écart entre pesées). */
export function bodySeries(bws: BodyWeight[], unit: Unit): BodyPoint[] {
  const sorted = [...bws].sort((a, b) => a.date - b.date);
  const out: BodyPoint[] = [];
  let trend = 0;
  let prev = 0;
  for (const b of sorted) {
    const w = fromKg(toKg(b), unit);
    if (!out.length) trend = w;
    else {
      const days = Math.max(0.5, (b.date - prev) / DAY_MS);
      const alpha = 1 - Math.pow(0.9, days);
      trend += alpha * (w - trend);
    }
    prev = b.date;
    out.push({ date: b.date, weight: w, trend });
  }
  return out;
}

/** Fourchette conseillée de variation du poids (%/sem, signée) selon l'objectif. */
export function weightRateRange(goal: Goal, level: Level, p: EngineParams): [number, number] {
  if (goal === 'bulk') {
    // Avancé : viser le bas de la fourchette (les gains de muscle sont plus lents).
    return level === 'advanced' ? [p.bulkRate[0] / 2, p.bulkRate[0]] : [p.bulkRate[0], p.bulkRate[1]];
  }
  if (goal === 'cut') return [-p.cutRate[1], -p.cutRate[0]];
  return [-0.1, 0.1];
}

export interface BodyAssessment {
  tone: 'good' | 'warn' | 'info';
  title: string;
  text: string;
}

export function assessBodyweight(trend: number | null, goal: Goal, level: Level, p: EngineParams): BodyAssessment {
  const [lo, hi] = weightRateRange(goal, level, p);
  const range = `${fmt(lo, 2)} à ${hi > 0 ? '+' : ''}${fmt(hi, 2)} %/sem`;
  if (trend == null) {
    return {
      tone: 'info',
      title: 'Tendance pas encore mesurable',
      text: `Il faut au moins ${p.bwMinPoints} pesées étalées sur ${p.bwMinDays} jours. Pèse-toi le matin à jeun, 2 à 4 fois par semaine.`
    };
  }
  const t = `${trend >= 0 ? '+' : ''}${fmt(trend, 2)} %/sem`;
  if (goal === 'bulk') {
    if (trend < lo) return { tone: 'warn', title: 'Prise trop lente', text: `Tu es à ${t} pour ${range} visés. Ajoute environ 100 à 200 kcal par jour.` };
    if (trend > hi) return { tone: 'warn', title: 'Prise trop rapide', text: `Tu es à ${t} pour ${range} visés. Au-delà, le surplus part surtout en gras : retire 100 à 200 kcal par jour.` };
    return { tone: 'good', title: 'Prise dans la cible', text: `Tu es à ${t} (cible ${range}). Assez pour construire, sans gras inutile.` };
  }
  if (goal === 'cut') {
    if (trend > hi) return { tone: 'warn', title: 'Perte trop lente', text: `Tu es à ${t} pour ${range} visés. Retire environ 100 à 200 kcal par jour ou ajoute de la marche.` };
    if (trend < lo) return { tone: 'warn', title: 'Perte trop rapide', text: `Tu es à ${t} pour ${range} visés. Plus vite, tu risques de perdre du muscle et de la force : remonte un peu les calories.` };
    return { tone: 'good', title: 'Perte dans la cible', text: `Tu es à ${t} (cible ${range}). Un rythme qui protège ta masse musculaire.` };
  }
  if (trend < lo || trend > hi) return { tone: 'warn', title: 'Poids qui dérive', text: `Tu es à ${t} alors que ton objectif est le maintien. Ajuste légèrement tes calories ou change d'objectif.` };
  return { tone: 'good', title: 'Poids stable', text: `Tu es à ${t} : stable, comme prévu en maintien.` };
}

/** Cible de protéines en grammes par jour. */
export function proteinTarget(weightKg: number, goal: Goal, p: EngineParams): [number, number] {
  const r = goal === 'cut' ? p.proteinCutRange : p.proteinRange;
  const round5 = (g: number) => Math.round(g / 5) * 5;
  return [round5(weightKg * r[0]), round5(weightKg * r[1])];
}
