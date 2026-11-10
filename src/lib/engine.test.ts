import { describe, expect, it } from 'vitest';
import { epley } from './e1rm';
import { joinPlates, parseLoad, plateNotation, splitPlates, toPlateNotation } from './plates';
import {
  deltaVsLast,
  detectPRs,
  estimateDayMinutes,
  exerciseHistory,
  exerciseRecords,
  exerciseStatus,
  expectedRate,
  plannedWeekly,
  projections,
  sessionTargets,
  toDoneSet,
  warmupSets,
  weeklyMuscleStats,
  withSets,
  type DoneSet
} from './engine';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS } from './defaults';
import type { Exercise, ProgramDay, Session } from '../types';
import { DAY_MS, sum, weekStart } from './util';

const P = DEFAULT_ENGINE;

const ex: Exercise = {
  id: 'pd', name: 'Lat pulldown', primaryMuscle: 'Dos (largeur)', secondaryMuscles: ['Biceps'], type: 'compound',
  unit: 'lb', increment: 5, loadMode: 'total', baseWeight: 0, restSec: null, setupNotes: ''
};

type S = [number, number, number];

function session(day: number, sets: S[], extra: Partial<Session> = {}): Session {
  return {
    id: 's' + day, dayId: null, dayName: 'A', startedAt: day * DAY_MS, endedAt: day * DAY_MS + 3600e3, note: '',
    exercises: [{
      id: 'x', exerciseId: 'pd', swappedFromId: null, programItemId: null, repMin: 8, repMax: 12, rirTarget: 1,
      restSec: null, skipped: false, note: '',
      sets: sets.map(([w, r, rir], i) => ({ id: 'set' + i, weight: w, notation: '', reps: r, rir, done: true, completedAt: 0, restTakenSec: 180, note: '', target: null }))
    }],
    ...extra
  };
}

const hist = (...ss: Session[]) => exerciseHistory(ss, 'pd');
const done = (w: number, reps: number, rir: number): DoneSet => ({ weight: w, notation: '', reps, rir, e1rm: epley(w, reps, rir), restSec: null });
const plan = (sets: number, repMin: number, repMax: number, rirTarget = 1) => ({ sets, repMin, repMax, rirTarget });
const wr = (ts: { weight: number | null; reps: number | null }[]) => ts.map((t) => `${t.weight}x${t.reps}`);

describe('plates', () => {
  const opt = { plate: 45, loadMode: 'perSide' as const, baseWeight: 45 };
  it('par côté + barre', () => {
    expect(parseLoad('2 plates + 25', opt)?.total).toBe(275);
    expect(parseLoad('2p+25', opt)?.total).toBe(275);
    expect(parseLoad('1 plate', opt)?.total).toBe(135);
  });
  it('total', () => {
    expect(parseLoad('2 plates + 25', { plate: 45, loadMode: 'total', baseWeight: 0 })?.total).toBe(115);
  });
  it('nombre seul = total', () => expect(parseLoad('185', opt)?.total).toBe(185));
  it('demi et virgules', () => expect(parseLoad('2,5', opt)?.total).toBe(2.5));
  it('invalide', () => expect(parseLoad('abc', opt)).toBeNull());
  it('notation inverse', () => expect(toPlateNotation(275, opt)).toBe('2 plates + 25'));
  it('décomposition et recomposition', () => {
    const o = { plate: 45, loadMode: 'perSide' as const, baseWeight: 0 };
    expect(splitPlates(230, o)).toEqual({ plates: 2, extra: 25 });
    expect(joinPlates(2, 25, o)).toBe(230);
    expect(joinPlates(3, 17.5, { plate: 45, loadMode: 'total', baseWeight: 0 })).toBe(152.5);
    expect(plateNotation(2, 25)).toBe('2 plates + 25');
    expect(plateNotation(1, 0)).toBe('1 plate');
    expect(plateNotation(0, 25)).toBe('');
  });
});

describe('cibles', () => {
  it('epley avec RIR', () => expect(epley(200, 8, 2)).toBeCloseTo(200 * (1 + 10 / 30)));

  it('rythme normal : une rep de plus sur un seul set', () => {
    const h = hist(session(0, [[215, 6, 1], [215, 6, 1], [215, 6, 1]]));
    const t = sessionTargets(ex, plan(3, 6, 8), h, 0.75, 7 * DAY_MS, P);
    expect(wr(t)).toEqual(['215x7', '215x6', '215x6']);
    expect(t[0].tag).toBe('+1 rep');
    expect(t[1].tag).toBe('Maintien');
    expect(t.every((x) => x.failureReps == null)).toBe(true);
  });

  it('dernière fois à l’échec, cible à 1 RIR : équivalent affiché', () => {
    const h = hist(session(0, [[215, 6, 0], [215, 6, 0], [215, 6, 0]]));
    const t = sessionTargets(ex, plan(3, 5, 8), h, 0.75, 7 * DAY_MS, P);
    expect(wr(t)).toEqual(['215x6', '215x5', '215x5']);
    expect(t[0].failureReps).toBe(7);
    expect(t[1].failureReps).toBe(6);
  });

  it('haut de fourchette : la charge monte d’un incrément, un set à la fois', () => {
    const h = hist(session(0, [[215, 10, 1], [215, 10, 1], [215, 10, 1]]));
    const t = sessionTargets(ex, plan(3, 8, 10), h, 0.75, 7 * DAY_MS, P);
    expect(wr(t)).toEqual(['220x9', '215x10', '215x10']);
    expect(t[0].kind).toBe('load-up');
    expect(t[0].tag).toBe('+5 lb');
  });

  it('incrément trop gros : on continue en reps au-delà de la fourchette', () => {
    const lat = { ...ex, increment: 2.5, type: 'isolation' as const };
    const h = hist(session(0, [[27.5, 12, 0], [27.5, 12, 0], [27.5, 12, 0]]));
    const t = sessionTargets(lat, plan(3, 10, 12, 0), h, 0.75, 7 * DAY_MS, P);
    expect(t[0].weight).toBe(27.5);
    expect(t[0].reps).toBe(13);
    expect(t[0].why.join(' ')).toContain('trop gros');
  });

  it('nettement sous la fourchette : la charge baisse', () => {
    const h = hist(session(0, [[230, 6, 0], [230, 5, 0]]));
    const t = sessionTargets(ex, plan(2, 6, 8), h, 0.75, 7 * DAY_MS, P);
    // set 1 : 5 reps @1 = juste sous la fourchette → on garde ; set 2 : 4 reps → on baisse
    expect(t[0].weight).toBe(230);
    expect(t[1].kind).toBe('load-down');
    // baisse minimale : juste assez pour revenir à une rep de la fourchette
    expect(t[1].weight).toBe(225);
    expect(t[1].reps).toBe(5);
  });

  it('mauvaise dernière séance : on repart du niveau récent (médiane)', () => {
    const h = hist(session(0, [[215, 8, 1]]), session(7, [[215, 8, 1]]), session(14, [[215, 7, 1]]));
    const t = sessionTargets(ex, plan(1, 6, 10), h, 0.75, 21 * DAY_MS, P);
    // retour au niveau habituel (8), sans rep « due » en plus juste après une mauvaise séance
    expect(wr(t)).toEqual(['215x8']);
    expect(t[0].why.join(' ')).toContain('médiane');
  });

  it('grosse baisse volontaire : la cible remonte par paliers, pas d’un coup', () => {
    const h = hist(session(0, [[215, 8, 1]]), session(7, [[215, 8, 1]]), session(14, [[185, 8, 1]]));
    const t = sessionTargets(ex, plan(1, 6, 8), h, 0.75, 21 * DAY_MS, P);
    // au plus +5 % de 1RM estimé par rapport à la dernière séance
    expect(epley(t[0].weight!, t[0].reps!, 1)).toBeLessThanOrEqual(epley(185, 8, 1) * 1.07);
    expect(t[0].weight!).toBeLessThan(215);
    expect(t[0].why.join(' ')).toContain('paliers');
  });

  it('plateau avec un rythme lent : la rep due finit par s’accumuler', () => {
    const iso = { ...ex, type: 'isolation' as const };
    const same: S[] = [[100, 10, 1], [100, 10, 1], [100, 10, 1]];
    const one = sessionTargets(iso, plan(3, 8, 12), hist(session(0, same)), 0.2, 7 * DAY_MS, P);
    expect(sum(one.map((t) => t.reps!))).toBe(30);
    const three = sessionTargets(iso, plan(3, 8, 12), hist(session(0, same), session(7, same), session(14, same)), 0.2, 21 * DAY_MS, P);
    expect(sum(three.map((t) => t.reps!))).toBe(31);
    expect(three.some((t) => t.why.join(' ').includes('depuis le'))).toBe(true);
  });

  it('long plateau : jamais plus d’une rep demandée en plus', () => {
    const same: S[] = [[215, 8, 1], [215, 8, 1], [215, 8, 1]];
    const ss = [0, 7, 14, 21, 28, 35].map((d) => session(d, same));
    const t = sessionTargets(ex, plan(3, 6, 10), hist(...ss), 1.5, 42 * DAY_MS, P);
    // 1,5 %/sem sur une semaine = +1,3 rep au total ; l'accumulation du plateau ne dépasse pas ça
    expect(sum(t.map((x) => x.reps!))).toBeLessThanOrEqual(26);
    expect(sum(t.map((x) => x.reps!))).toBeGreaterThanOrEqual(25);
  });

  it('reprise après une longue pause', () => {
    const h = hist(session(0, [[200, 10, 1]]));
    const t = sessionTargets(ex, plan(1, 8, 12), h, 0.75, 45 * DAY_MS, P);
    expect(t[0].kind).toBe('resume');
    expect(t[0].tag).toBe('Reprise');
    // moins exigeant que la dernière fois, mais toujours dans la fourchette
    expect(epley(t[0].weight!, t[0].reps!, 1)).toBeLessThan(epley(200, 10, 1));
    expect(t[0].reps!).toBeGreaterThanOrEqual(7);
  });

  it('première fois : pas de cible, puis on suit le set précédent', () => {
    const t = sessionTargets(ex, plan(3, 8, 12), [], 0.75, 0, P);
    expect(t[0].weight).toBeNull();
    expect(t[0].kind).toBe('first');
    const t2 = sessionTargets(ex, plan(3, 8, 12), [], 0.75, 0, P, { done: [done(150, 10, 1), null, null] });
    expect(t2[1].weight).toBe(150);
    expect(t2[1].reps).toBe(9);
    expect(t2[1].kind).toBe('follow');
  });

  it('décharge : même charge, plus loin de l’échec', () => {
    const h = hist(session(0, [[215, 8, 1], [215, 8, 1]]));
    const t = sessionTargets(ex, plan(2, 6, 10), h, 0.75, 7 * DAY_MS, P, { deload: true });
    expect(t[0].weight).toBe(215);
    expect(t[0].rir).toBe(3);
    expect(t[0].reps).toBe(6);
    expect(t[0].kind).toBe('deload');
  });

  it('les séances de décharge ne servent pas de référence', () => {
    const h = hist(session(0, [[215, 8, 1]]), session(7, [[215, 5, 3]], { deload: true }));
    expect(h).toHaveLength(1);
    expect(exerciseHistory([session(0, [[215, 8, 1]]), session(7, [[215, 5, 3]], { deload: true })], 'pd', { includeDeload: true })).toHaveLength(2);
  });
});

describe('autorégulation en séance', () => {
  const h = hist(session(0, [[215, 6, 1], [215, 6, 1], [215, 6, 1]]));
  const pl = plan(3, 5, 8);
  const cold = sessionTargets(ex, pl, h, 0.75, 7 * DAY_MS, P);

  it('set conforme au plan : les suivants ne bougent pas', () => {
    const t = sessionTargets(ex, pl, h, 0.75, 7 * DAY_MS, P, { done: [done(215, 7, 1), null, null] });
    expect(wr(t.slice(1))).toEqual(wr(cold.slice(1)));
  });

  it('une rep ratée : les suivants ne bougent pas (zone morte)', () => {
    const t = sessionTargets(ex, pl, h, 0.75, 7 * DAY_MS, P, { done: [done(215, 6, 1), null, null] });
    expect(wr(t.slice(1))).toEqual(wr(cold.slice(1)));
  });

  it('grosse forme : les suivants montent', () => {
    const wide = plan(3, 5, 12);
    const base = sessionTargets(ex, wide, h, 0.75, 7 * DAY_MS, P);
    const t = sessionTargets(ex, wide, h, 0.75, 7 * DAY_MS, P, { done: [done(215, 9, 1), null, null] });
    expect(t[1].reps!).toBeGreaterThan(base[1].reps!);
    expect(t[1].tag).toBe('Bonne forme');
    // fourchette étroite : au lieu de dépasser le haut, on monte la charge
    const narrow = sessionTargets(ex, pl, h, 0.75, 7 * DAY_MS, P, { done: [done(215, 9, 1), null, null] });
    expect(narrow[1].kind).toBe('load-up');
    expect(narrow[1].weight).toBe(220);
  });

  it('mauvais jour : les suivants baissent', () => {
    const t = sessionTargets(ex, pl, h, 0.75, 7 * DAY_MS, P, { done: [done(215, 4, 1), null, null] });
    expect(t[1].reps!).toBeLessThan(cold[1].reps!);
    expect(t[2].why.join(' ')).toContain('Forme du jour');
  });

  it('charge différente du plan : la suite garde le décalage', () => {
    const t = sessionTargets(ex, pl, h, 0.75, 7 * DAY_MS, P, { done: [done(220, 6, 1), null, null] });
    expect(t[1].weight).toBe(220);
    expect(t[2].weight).toBe(220);
    expect(t[1].reps!).toBeLessThanOrEqual(6);
  });
});

describe('records et comparaisons', () => {
  const h = hist(session(0, [[200, 8, 1], [200, 7, 1]]), session(7, [[205, 8, 1], [200, 8, 1]]));
  const rec = exerciseRecords(h);
  it('détecte les trois types de records', () => {
    expect(detectPRs({ weight: 210, reps: 8, rir: 1 }, rec)).toEqual(['e1rm', 'weight']);
    expect(detectPRs({ weight: 200, reps: 9, rir: 0 }, rec)).toEqual(['reps']);
    expect(detectPRs({ weight: 200, reps: 8, rir: 1 }, rec)).toEqual([]);
  });
  it('pas de record à la première séance', () => {
    expect(detectPRs({ weight: 300, reps: 10, rir: 0 }, exerciseRecords([]))).toEqual([]);
  });
  it('un record n’est compté qu’une fois dans la séance', () => {
    const d = done(210, 8, 1);
    expect(detectPRs({ weight: 210, reps: 8, rir: 1 }, withSets(rec, [d]))).toEqual([]);
  });
  it('compare au même set de la dernière fois', () => {
    const last = toDoneSet({ id: '', weight: 200, notation: '', reps: 8, rir: 1, done: true, completedAt: 0, restTakenSec: null, note: '', target: null });
    expect(deltaVsLast({ weight: 200, reps: 9, rir: 1 }, last, 'lb')).toEqual({ text: '+1 rep', tone: 'good' });
    expect(deltaVsLast({ weight: 200, reps: 8, rir: 1 }, last, 'lb')?.text).toBe('Égal');
    expect(deltaVsLast({ weight: 200, reps: 8, rir: 0 }, last, 'lb')).toEqual({ text: '−1 rep éq.', tone: 'bad' });
    expect(deltaVsLast({ weight: 205, reps: 8, rir: 1 }, last, 'lb')).toEqual({ text: '+5 lb', tone: 'good' });
  });
  it('marque les records dans l’historique', () => {
    expect(h[1].isE1rmPR).toBe(true);
    expect(h[1].isWeightPR).toBe(true);
    expect(h[0].isE1rmPR).toBe(false);
  });
});

describe('vitesse attendue et statut', () => {
  const ctx = { settings: { ...DEFAULT_SETTINGS, trainingYears: 2 }, bodyweights: [], now: 30 * DAY_MS };

  it('taux intermédiaire, isolation plus lente, sèche plus lente', () => {
    const r = expectedRate(ex, [], ctx).rate;
    expect(r).toBeCloseTo(0.75);
    expect(expectedRate({ ...ex, type: 'isolation' }, [], ctx).rate).toBeLessThan(r);
    expect(expectedRate(ex, [], { ...ctx, settings: { ...ctx.settings, goal: 'cut' } }).rate).toBeLessThan(r);
  });

  it('la tendance du poids remplace l’objectif quand il y a assez de pesées', () => {
    const bw = (day: number, weight: number) => ({ id: 'b' + day, date: day * DAY_MS, weight, unit: 'lb' as const });
    const few = expectedRate(ex, [], { ...ctx, bodyweights: [bw(10, 180), bw(25, 176)] });
    expect(few.why.join(' ')).not.toContain('poids de corps');
    const many = expectedRate(ex, [], { ...ctx, bodyweights: [bw(8, 180), bw(14, 179), bw(20, 178), bw(27, 177)] });
    expect(many.why.join(' ')).toContain('poids de corps');
    expect(many.rate).toBeLessThan(0.75);
  });

  it('recalibrage après 4 semaines', () => {
    const ss = [0, 7, 14, 21, 28].map((d, i) => session(d, [[200 + i * 5, 10, 1]]));
    const h = hist(...ss);
    const res = expectedRate(ex, h, { ...ctx, now: 29 * DAY_MS });
    expect(res.observed).toBeGreaterThan(2);
    expect(res.historyWeight).toBeGreaterThan(0);
    expect(res.why.some((w) => w.includes('Recalibrage'))).toBe(true);
  });

  it('statut stagnation puis décharge', () => {
    const ss = [0, 7, 14, 21, 28, 35, 42, 49].map((d) => session(d, [[200, 10, 1]]));
    const st = exerciseStatus(hist(...ss), 0.75, 1, P);
    expect(st.kind).toBe('stall');
    expect(st.stalls).toBeGreaterThanOrEqual(2);
    expect(st.advice[0]).toContain('décharge');
  });

  it('statut en avance', () => {
    const ss = [0, 7, 14, 21].map((d, i) => session(d, [[200 + i * 5, 10, 1]]));
    expect(exerciseStatus(hist(...ss), 0.75, 1, P).kind).toBe('ahead');
  });

  it('projection', () => {
    const h = hist(session(0, [[200, 10, 1]]));
    const p = projections(ex, { repMin: 8, repMax: 12, rirTarget: 1 }, h, 0.75, 0);
    expect(p[0].text).toMatch(/210 × 8/);
  });
});

describe('volume et échauffement', () => {
  const exMap = new Map([[ex.id, ex]]);
  it('sets durs par muscle, secondaires à 0,5', () => {
    const w = weeklyMuscleStats([session(0, [[200, 8, 1], [200, 8, 4], [200, 8, 0]])], exMap, P);
    const m = w.get(weekStart(0))!;
    // le set à 4+ RIR n'est pas « dur » avec le seuil par défaut (≤ 3)
    expect(m.get('Dos (largeur)')!.sets).toBe(2);
    expect(m.get('Biceps')!.sets).toBe(1);
    expect(m.get('Biceps')!.direct).toBe(0);
    const loose = weeklyMuscleStats([session(0, [[200, 8, 1], [200, 8, 4], [200, 8, 0]])], exMap, { ...P, hardSetRir: 4 });
    expect(loose.get(weekStart(0))!.get('Dos (largeur)')!.sets).toBe(3);
  });
  it('volume planifié et fréquence', () => {
    const item = { id: 'i', exerciseId: 'pd', sets: 3, repMin: 8, repMax: 12, rirTarget: 1, restSec: null, notes: '' };
    const days: ProgramDay[] = [
      { id: 'a', name: 'A', order: 0, weekdays: [1, 4], items: [item] },
      { id: 'b', name: 'B', order: 1, weekdays: [2], items: [{ ...item, sets: 2 }] }
    ];
    const pw = plannedWeekly(days, exMap, P);
    expect(pw.get('Dos (largeur)')).toEqual({ sets: 8, direct: 8, freq: 3 });
    expect(pw.get('Biceps')!.sets).toBe(4);
    expect(estimateDayMinutes(days[0], exMap, 180)).toBe(Math.round((3 * 45 + 2 * 180 + 120) / 60));
  });
  it('échauffement : montée en charge sous la charge de travail', () => {
    const w = warmupSets(ex, 230, true);
    expect(w.map((s) => s.weight)).toEqual([115, 160, 195]);
    expect(w.map((s) => s.reps)).toEqual([8, 4, 2]);
    expect(warmupSets(ex, 230, false)).toHaveLength(1);
    expect(warmupSets(ex, null, true)).toEqual([]);
  });
});
