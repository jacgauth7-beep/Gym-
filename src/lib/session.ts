import { db } from '../db';
import type { EngineParams, Exercise, ProgramDay, ProgramItem, Session, SessionExercise, SetLog, Settings } from '../types';
import { rirForCalc } from './e1rm';
import { isDone } from './engine';
import { DAY_MS, LB_PER_KG, clone, uid } from './util';

export const emptySet = (): SetLog => ({
  id: uid(),
  weight: null,
  notation: '',
  reps: null,
  rir: null,
  done: false,
  completedAt: null,
  restTakenSec: null,
  note: '',
  target: null
});

export function fromItem(item: ProgramItem, sets = item.sets): SessionExercise {
  return {
    id: uid(),
    exerciseId: item.exerciseId,
    swappedFromId: null,
    programItemId: item.id,
    repMin: item.repMin,
    repMax: item.repMax,
    rirTarget: item.rirTarget,
    restSec: item.restSec,
    skipped: false,
    note: item.notes,
    sets: Array.from({ length: Math.max(1, sets) }, emptySet)
  };
}

/** Exercice ajouté à la volée pendant une séance (hors programme). */
export function adHocExercise(exerciseId: string): SessionExercise {
  return {
    id: uid(),
    exerciseId,
    swappedFromId: null,
    programItemId: null,
    repMin: 8,
    repMax: 12,
    rirTarget: 1,
    restSec: null,
    skipped: false,
    note: '',
    sets: [emptySet(), emptySet(), emptySet()]
  };
}

export const isDeloadActive = (settings: Pick<Settings, 'deloadUntil'>, now = Date.now()) => settings.deloadUntil != null && settings.deloadUntil > now;

/**
 * Construit la séance d'un jour du programme SANS l'enregistrer.
 * Elle n'est écrite en base qu'à la première action (voir mutateSession) : pas de séance fantôme si tu ouvres juste l'app.
 */
export function buildSession(day: ProgramDay, opts: { deload: boolean; p: Pick<EngineParams, 'deloadSetFactor'> }): Session {
  return {
    id: uid(),
    dayId: day.id,
    dayName: day.name,
    startedAt: Date.now(),
    endedAt: null,
    note: '',
    deload: opts.deload || undefined,
    exercises: day.items.map((it) => fromItem(it, opts.deload ? Math.ceil(it.sets * opts.p.deloadSetFactor) : it.sets))
  };
}

/** Lecture-modification-écriture atomique. Si la séance n'est encore qu'un brouillon, elle est créée à ce moment-là. */
export async function mutateSession(session: Session, fn: (s: Session) => void): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const cur = (await db.sessions.get(session.id)) ?? { ...clone(session), startedAt: Date.now() };
    fn(cur);
    await db.sessions.put(cur);
  });
}

export const hasDoneSets = (s: Session) => s.exercises.some((e) => e.sets.some((x) => x.done));

export type TodayPlan =
  | { kind: 'scheduled' | 'rotation'; day: ProgramDay }
  | { kind: 'rest'; next: { day: ProgramDay; inDays: number } | null };

/** Séance à proposer aujourd'hui : jour calé sur la semaine, rotation, ou repos. */
export function planToday(days: ProgramDay[], sessions: Session[], now = new Date()): TodayPlan | null {
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => a.order - b.order);
  const usesWeek = sorted.some((d) => d.weekdays.length > 0);
  if (usesWeek) {
    const dow = now.getDay();
    const today = sorted.find((d) => d.weekdays.includes(dow));
    if (today) return { kind: 'scheduled', day: today };
    for (let k = 1; k <= 7; k++) {
      const next = sorted.find((d) => d.weekdays.includes((dow + k) % 7));
      if (next) return { kind: 'rest', next: { day: next, inDays: k } };
    }
    return { kind: 'rest', next: null };
  }
  // rotation : le jour qui suit la dernière séance faite
  const last = [...sessions].filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (last) {
    const i = sorted.findIndex((d) => d.id === last.dayId);
    if (i >= 0) return { kind: 'rotation', day: sorted[(i + 1) % sorted.length] };
  }
  return { kind: 'rotation', day: sorted[0] };
}

const isPristine = (s: Session) => !hasDoneSets(s) && !s.note && s.exercises.every((e) => !e.swappedFromId && e.programItemId != null && !e.skipped);

/**
 * Range les séances restées ouvertes :
 * - vide et intacte → supprimée (le brouillon du jour la remplace) ;
 * - commencée mais inactive depuis plus de 4 h → terminée à l'heure du dernier set ;
 * - modifiée sans aucun set depuis plus de 12 h → supprimée.
 */
export async function cleanupSessions(now = Date.now()) {
  const open = await db.sessions.filter((s) => s.endedAt == null).toArray();
  for (const s of open) {
    if (isPristine(s)) {
      await db.sessions.delete(s.id);
    } else if (hasDoneSets(s)) {
      const last = Math.max(...s.exercises.flatMap((e) => e.sets.map((x) => x.completedAt ?? 0)));
      if (now - last > 4 * 3600e3) await db.sessions.put({ ...s, endedAt: last || s.startedAt });
    } else if (now - s.startedAt > 12 * 3600e3) {
      await db.sessions.delete(s.id);
    }
  }
}

/** Supprime une séance ouverte sans aucun set : utile quand le programme vient de changer. */
export async function discardEmptyActive() {
  const open = await db.sessions.filter((s) => s.endedAt == null).toArray();
  for (const s of open) if (!hasDoneSets(s)) await db.sessions.delete(s.id);
}

/** Temps de repos réellement pris : écart avec le set validé juste avant dans la séance. */
export function restBefore(s: Session, now: number): number | null {
  const prev = s.exercises.flatMap((e) => e.sets.map((x) => x.completedAt ?? 0)).filter((t) => t > 0 && t < now);
  if (!prev.length) return null;
  return Math.round((now - Math.max(...prev)) / 1000);
}

export function restFor(se: SessionExercise, ex: Exercise | undefined, globalSec: number): number {
  return se.restSec ?? ex?.restSec ?? globalSec;
}

export interface SessionStats {
  exercises: number;
  sets: number;
  hardSets: number;
  /** Volume total converti en lb. */
  volumeLb: number;
  durationMs: number;
}

export function sessionStats(s: Session, exercises: Map<string, Exercise>, hardSetRir: number): SessionStats {
  let sets = 0;
  let hardSets = 0;
  let volumeLb = 0;
  let exCount = 0;
  let first = Infinity;
  let last = 0;
  for (const e of s.exercises) {
    if (e.skipped) continue;
    const done = e.sets.filter(isDone);
    if (!done.length) continue;
    exCount++;
    const unit = exercises.get(e.exerciseId)?.unit ?? 'lb';
    for (const x of done) {
      sets++;
      if (rirForCalc(x.rir) <= hardSetRir) hardSets++;
      volumeLb += x.weight! * x.reps! * (unit === 'kg' ? LB_PER_KG : 1);
      if (x.completedAt) {
        first = Math.min(first, x.completedAt);
        last = Math.max(last, x.completedAt);
      }
    }
  }
  const end = s.endedAt ?? (last || s.startedAt);
  return { exercises: exCount, sets, hardSets, volumeLb, durationMs: Math.max(0, end - s.startedAt) };
}

/** Dernière séance terminée pour un jour du programme. */
export function lastSessionOfDay(sessions: Session[], dayId: string): Session | undefined {
  return [...sessions].filter((s) => s.endedAt && s.dayId === dayId).sort((a, b) => b.startedAt - a.startedAt)[0];
}

export const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY_MS);
