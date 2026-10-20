import { describe, expect, it } from 'vitest';
import { epley } from './e1rm';
import { parseLoad, toPlateNotation } from './plates';
import { exerciseHistory, exerciseStatus, expectedRate, projections, sessionTargets } from './engine';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS } from './defaults';
import type { Exercise, Session } from '../types';
import { DAY_MS } from './util';

const ex: Exercise = {
  id: 'pd', name: 'Lat pulldown', primaryMuscle: 'Dos (largeur)', secondaryMuscles: ['Biceps'], type: 'compound',
  unit: 'lb', increment: 5, loadMode: 'total', baseWeight: 0, restSec: null, setupNotes: ''
};

function session(day: number, sets: [number, number, number][]): Session {
  return {
    id: 's' + day, dayId: null, dayName: 'A', startedAt: day * DAY_MS, endedAt: day * DAY_MS + 3600e3, note: '',
    exercises: [{
      id: 'x', exerciseId: 'pd', swappedFromId: null, programItemId: null, repMin: 8, repMax: 12, rirTarget: 1,
      restSec: null, skipped: false, note: '',
      sets: sets.map(([w, r, rir], i) => ({ id: 'set' + i, weight: w, notation: '', reps: r, rir, done: true, completedAt: 0, restTakenSec: null, note: '', target: null }))
    }]
  };
}

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
});

describe('moteur', () => {
  const ctx = { settings: { ...DEFAULT_SETTINGS, trainingYears: 2 }, bodyweights: [], now: 30 * DAY_MS };
  it('epley avec RIR', () => expect(epley(200, 8, 2)).toBeCloseTo(200 * (1 + 10 / 30)));

  it('double progression : reps puis charge', () => {
    const h = exerciseHistory([session(0, [[200, 10, 1]])], 'pd');
    const t = sessionTargets(ex, { sets: 1, repMin: 8, repMax: 12, rirTarget: 1 }, h, 1, 7 * DAY_MS, DEFAULT_ENGINE);
    expect(t[0].weight).toBe(200);
    expect(t[0].reps).toBeGreaterThan(10);
    const h2 = exerciseHistory([session(0, [[200, 12, 1]])], 'pd');
    const t2 = sessionTargets(ex, { sets: 1, repMin: 8, repMax: 12, rirTarget: 1 }, h2, 1, 7 * DAY_MS, DEFAULT_ENGINE);
    expect(t2[0].weight).toBe(205);
    expect(t2[0].reps).toBeGreaterThanOrEqual(8);
    expect(t2[0].reps).toBeLessThanOrEqual(12);
  });

  it('taux intermédiaire, isolation plus lente, sèche plus lente', () => {
    const r = expectedRate(ex, [], ctx).rate;
    expect(r).toBeCloseTo(0.75);
    expect(expectedRate({ ...ex, type: 'isolation' }, [], ctx).rate).toBeLessThan(r);
    expect(expectedRate(ex, [], { ...ctx, settings: { ...ctx.settings, goal: 'cut' } }).rate).toBeLessThan(r);
  });

  it('recalibrage après 4 semaines', () => {
    const ss = [0, 7, 14, 21, 28].map((d, i) => session(d, [[200 + i * 5, 10, 1]]));
    const h = exerciseHistory(ss, 'pd');
    const res = expectedRate(ex, h, { ...ctx, now: 29 * DAY_MS });
    expect(res.observed).toBeGreaterThan(2);
    expect(res.historyWeight).toBeGreaterThan(0);
    expect(res.why.some((w) => w.includes('Recalibrage'))).toBe(true);
    expect(h[4].isE1rmPR).toBe(true);
  });

  it('statut stagnation puis décharge', () => {
    const ss = [0, 7, 14, 21, 28, 35, 42, 49].map((d) => session(d, [[200, 10, 1]]));
    const h = exerciseHistory(ss, 'pd');
    const st = exerciseStatus(h, 0.75, 1, DEFAULT_ENGINE);
    expect(st.kind).toBe('stall');
    expect(st.advice[0]).toContain('décharge');
  });

  it('projection', () => {
    const h = exerciseHistory([session(0, [[200, 10, 1]])], 'pd');
    const p = projections(ex, { repMin: 8, repMax: 12, rirTarget: 1 }, h, 0.75, 0);
    expect(p[0].text).toMatch(/210 × 8/);
  });
});
