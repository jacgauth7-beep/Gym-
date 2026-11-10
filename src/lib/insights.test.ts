import { describe, expect, it } from 'vitest';
import { assessBodyweight, bodySeries, bodyweightTrend, proteinTarget, weightRateRange } from './body';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS } from './defaults';
import { analyzeExercises, buildInsights, weekSummary, type AnalysisInput } from './insights';
import { buildSession, planToday } from './session';
import { GUIDE, guideSection } from './science';
import type { BodyWeight, Exercise, ProgramDay, Session } from '../types';
import { DAY_MS, weekStart } from './util';

const P = DEFAULT_ENGINE;
// Mercredi 12 h, pour que « cette semaine » et « la semaine dernière » soient sans ambiguïté.
const NOW = weekStart(Date.UTC(2026, 10, 11, 12)) + 2 * DAY_MS + 12 * 3600e3;

const mk = (id: string, name: string, muscle: string, type: 'compound' | 'isolation' = 'compound'): Exercise => ({
  id, name, primaryMuscle: muscle, secondaryMuscles: [], type, unit: 'lb', increment: 5, loadMode: 'total', baseWeight: 0, restSec: null, setupNotes: ''
});
const EXS = [mk('bench', 'Bench', 'Pectoraux'), mk('row', 'Row', 'Dos (épaisseur)'), mk('curl', 'Curl', 'Biceps', 'isolation'), mk('calf', 'Mollets', 'Mollets', 'isolation')];
const exMap = new Map(EXS.map((e) => [e.id, e]));
const item = (exerciseId: string, sets: number) => ({ id: 'it-' + exerciseId, exerciseId, sets, repMin: 8, repMax: 12, rirTarget: 1, restSec: null, notes: '' });
const DAYS: ProgramDay[] = [
  { id: 'A', name: 'A', order: 0, weekdays: [1, 4], items: [item('bench', 5), item('row', 5), item('curl', 5)] },
  { id: 'B', name: 'B', order: 1, weekdays: [2, 5], items: [item('calf', 2)] }
];

/** Une séance du jour `day` à `daysAgo` jours, avec une charge qui suit `load(daysAgo)`. */
function sess(day: ProgramDay, daysAgo: number, load: (ex: string) => number, opts: { rir?: number; rest?: number } = {}): Session {
  const t = NOW - daysAgo * DAY_MS;
  return {
    id: `${day.id}-${daysAgo}`, dayId: day.id, dayName: day.name, startedAt: t, endedAt: t + 3600e3, note: '',
    exercises: day.items.map((it) => ({
      id: it.id + daysAgo, exerciseId: it.exerciseId, swappedFromId: null, programItemId: it.id, repMin: 8, repMax: 12, rirTarget: 1, restSec: null, skipped: false, note: '',
      sets: Array.from({ length: it.sets }, (_, i) => ({ id: `${it.id}${daysAgo}${i}`, weight: load(it.exerciseId), notation: '', reps: 10, rir: opts.rir ?? 1, done: true, completedAt: t + i * 200e3, restTakenSec: opts.rest ?? 180, note: '', target: null }))
    }))
  };
}
const input = (sessions: Session[], extra: Partial<AnalysisInput> = {}): AnalysisInput => ({
  sessions, exercises: exMap, days: DAYS, bodyweights: [], checkins: [], settings: { ...DEFAULT_SETTINGS, trainingYears: 2 }, now: NOW, ...extra
});
const ids = (i: AnalysisInput) => buildInsights(i).map((x) => x.id);

describe('coach', () => {
  it('reste discret tant qu’il n’y a pas de données', () => {
    expect(ids(input([]))).toEqual(['start']);
  });

  it('signale le volume bas prévu par le programme, seulement pour les muscles suivis', () => {
    // 8 semaines complètes : A deux fois, B deux fois par semaine
    const ss: Session[] = [];
    for (let w = 1; w <= 8; w++) for (const off of [0, 3]) {
      ss.push(sess(DAYS[0], w * 7 + off - 2, () => 100 + (8 - w) * 2));
      ss.push(sess(DAYS[1], w * 7 + off - 3, () => 100 + (8 - w) * 2));
    }
    const out = buildInsights(input(ss));
    const low = out.find((x) => x.id === 'volume-low')!;
    expect(low).toBeTruthy();
    expect(low.title).toContain('Mollets');
    expect(low.why.join(' ')).toContain('Mollets : 4');
    expect(low.why.join(' ')).not.toContain('Pectoraux');
    expect(low.action?.href).toBe('#/programme');
    expect(out.some((x) => x.id === 'progress')).toBe(true);
  });

  it('détecte une fatigue générale quand presque tout stagne, et propose la décharge', () => {
    const ss: Session[] = [];
    for (let w = 1; w <= 9; w++) {
      ss.push(sess(DAYS[0], w * 7 - 2, () => 100));
      ss.push(sess(DAYS[1], w * 7 - 3, () => 100));
    }
    const out = buildInsights(input(ss));
    expect(out[0].id).toBe('fatigue');
    expect(out[0].severity).toBe('alert');
    expect(out[0].action?.kind).toBe('deload');
    // en décharge, on n'alerte plus
    const during = buildInsights(input(ss, { settings: { ...DEFAULT_SETTINGS, trainingYears: 2, deloadUntil: NOW + DAY_MS } }));
    expect(during.some((x) => x.id === 'fatigue')).toBe(false);
    expect(during.some((x) => x.id === 'deload-active')).toBe(true);
  });

  it('commente l’effort : tout à l’échec, ou trop loin de l’échec', () => {
    const fail = [sess(DAYS[0], 2, () => 100, { rir: 0 }), sess(DAYS[0], 6, () => 100, { rir: 0 })];
    expect(ids(input(fail))).toContain('effort-failure');
    const far = [sess(DAYS[0], 2, () => 100, { rir: 4 }), sess(DAYS[0], 6, () => 100, { rir: 4 })];
    expect(ids(input(far))).toContain('effort-low');
  });

  it('compare les repos réels au minuteur', () => {
    const short = [sess(DAYS[0], 2, () => 100, { rest: 70 }), sess(DAYS[0], 6, () => 100, { rest: 70 })];
    expect(ids(input(short))).toContain('rest-short');
    const long = [sess(DAYS[0], 2, () => 100, { rest: 300 }), sess(DAYS[0], 6, () => 100, { rest: 300 })];
    expect(ids(input(long))).toContain('rest-long');
  });

  it('régularité, pesées, sommeil, sauvegarde', () => {
    const few = [sess(DAYS[0], 9, () => 100), sess(DAYS[0], 16, () => 100), sess(DAYS[0], 23, () => 100)];
    const a = ids(input(few));
    expect(a).toContain('adherence');
    expect(a).toContain('weigh-in');
    const sleepy = input(few, { checkins: [1, 2, 3].map((d) => ({ id: 'c' + d, date: NOW - d * DAY_MS, sleepH: 5.5 })) });
    expect(ids(sleepy)).toContain('sleep');
    const many = Array.from({ length: 6 }, (_, k) => sess(DAYS[0], 2 + k * 3, () => 100));
    expect(ids(input(many))).toContain('backup');
    expect(ids(input(many, { settings: { ...DEFAULT_SETTINGS, lastBackupAt: NOW - DAY_MS } }))).not.toContain('backup');
  });

  it('résumé de semaine et analyse par exercice', () => {
    const ss = [sess(DAYS[0], 1, () => 105), sess(DAYS[0], 8, () => 100)];
    const i = input(ss);
    const an = analyzeExercises(i);
    expect(an.map((a) => a.ex.id).sort()).toEqual(['bench', 'curl', 'row']);
    const wk = weekSummary(i, an);
    expect(wk.done).toBe(1);
    expect(wk.planned).toBe(4);
    expect(wk.hardSets).toBe(15);
    expect(wk.prs).toBe(3);
  });

  it('chaque conseil pointe vers une section existante du guide', () => {
    const ss: Session[] = [];
    for (let w = 1; w <= 9; w++) ss.push(sess(DAYS[0], w * 7 - 2, () => 100, { rir: 0, rest: 60 }));
    for (const ins of buildInsights(input(ss))) if (ins.guide) expect(guideSection(ins.guide), ins.id).toBeTruthy();
    expect(new Set(GUIDE.map((g) => g.id)).size).toBe(GUIDE.length);
    for (const g of GUIDE) expect(g.refs.length).toBeGreaterThan(0);
  });
});

describe('poids de corps', () => {
  const bw = (daysAgo: number, weight: number, unit: 'lb' | 'kg' = 'lb'): BodyWeight => ({ id: 'b' + daysAgo, date: NOW - daysAgo * DAY_MS, weight, unit });
  it('il faut assez de pesées étalées pour mesurer une tendance', () => {
    expect(bodyweightTrend([bw(1, 180), bw(12, 181)], NOW, P)).toBeNull();
    expect(bodyweightTrend([bw(1, 180), bw(2, 180), bw(3, 180), bw(4, 180)], NOW, P)).toBeNull();
    const t = bodyweightTrend([bw(0, 178), bw(7, 179), bw(14, 180), bw(21, 181)], NOW, P)!;
    expect(t).toBeCloseTo(-0.55, 1);
  });
  it('mélange lb et kg sans se tromper', () => {
    const t = bodyweightTrend([bw(0, 80, 'kg'), bw(7, 176.37), bw(14, 80, 'kg'), bw(21, 176.37)], NOW, P)!;
    expect(Math.abs(t)).toBeLessThan(0.01);
  });
  it('tendance lissée', () => {
    const s = bodySeries([bw(3, 180), bw(2, 184), bw(1, 180)], 'lb');
    expect(s[1].trend).toBeGreaterThan(180);
    expect(s[1].trend).toBeLessThan(184);
  });
  it('cibles selon l’objectif', () => {
    expect(weightRateRange('bulk', 'intermediate', P)).toEqual([0.25, 0.5]);
    expect(weightRateRange('bulk', 'advanced', P)).toEqual([0.125, 0.25]);
    expect(weightRateRange('cut', 'intermediate', P)).toEqual([-1, -0.5]);
    expect(assessBodyweight(0.4, 'bulk', 'intermediate', P).tone).toBe('good');
    expect(assessBodyweight(0.9, 'bulk', 'intermediate', P).title).toContain('trop rapide');
    expect(assessBodyweight(-1.4, 'cut', 'intermediate', P).title).toContain('trop rapide');
    expect(assessBodyweight(null, 'cut', 'intermediate', P).tone).toBe('info');
    expect(proteinTarget(80, 'maintain', P)).toEqual([130, 175]);
    expect(proteinTarget(80, 'cut', P)).toEqual([145, 215]);
  });
});

describe('séance du jour', () => {
  const at = (iso: string) => new Date(iso);
  it('jour calé sur la semaine, sinon repos avec la prochaine séance', () => {
    expect(planToday(DAYS, [], at('2026-11-09T10:00:00'))).toMatchObject({ kind: 'scheduled', day: { id: 'A' } });
    expect(planToday(DAYS, [], at('2026-11-10T10:00:00'))).toMatchObject({ kind: 'scheduled', day: { id: 'B' } });
    expect(planToday(DAYS, [], at('2026-11-11T10:00:00'))).toMatchObject({ kind: 'rest', next: { day: { id: 'A' }, inDays: 1 } });
    expect(planToday(DAYS, [], at('2026-11-15T10:00:00'))).toMatchObject({ kind: 'rest', next: { day: { id: 'A' }, inDays: 1 } });
    expect(planToday([], [], at('2026-11-15T10:00:00'))).toBeNull();
  });
  it('rotation quand aucun jour n’est coché', () => {
    const rot = DAYS.map((d) => ({ ...d, weekdays: [] }));
    expect(planToday(rot, [])).toMatchObject({ kind: 'rotation', day: { id: 'A' } });
    expect(planToday(rot, [sess(rot[0], 1, () => 100)])).toMatchObject({ kind: 'rotation', day: { id: 'B' } });
  });
  it('la décharge réduit les sets de moitié (arrondi au-dessus)', () => {
    const s = buildSession(DAYS[0], { deload: true, p: P });
    expect(s.deload).toBe(true);
    expect(s.exercises.map((e) => e.sets.length)).toEqual([3, 3, 3]);
    expect(buildSession(DAYS[0], { deload: false, p: P }).exercises[0].sets.length).toBe(5);
  });
});
