import { db } from '../db';
import type { Exercise, ProgramDay, ProgramItem, Session, SessionExercise, SetLog } from '../types';
import { uid } from './util';

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

export function fromItem(item: ProgramItem): SessionExercise {
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
    sets: Array.from({ length: item.sets }, emptySet)
  };
}

/** Jour du programme à proposer aujourd'hui. */
export function pickTodayDay(days: ProgramDay[], sessions: Session[], now = new Date()): ProgramDay | undefined {
  if (!days.length) return undefined;
  const sorted = [...days].sort((a, b) => a.order - b.order);
  const dow = now.getDay();
  const scheduled = sorted.find((d) => d.weekdays.includes(dow));
  if (scheduled) return scheduled;
  // rotation : le jour qui suit la dernière séance faite
  const last = [...sessions].filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
  if (last) {
    const i = sorted.findIndex((d) => d.id === last.dayId);
    if (i >= 0) return sorted[(i + 1) % sorted.length];
  }
  return sorted[0];
}

export async function startSession(day: ProgramDay): Promise<Session> {
  const s: Session = {
    id: uid(),
    dayId: day.id,
    dayName: day.name,
    startedAt: Date.now(),
    endedAt: null,
    note: '',
    exercises: day.items.map(fromItem)
  };
  await db.sessions.put(s);
  return s;
}

export const hasDoneSets = (s: Session) => s.exercises.some((e) => e.sets.some((x) => x.done));

/** Ferme proprement les séances oubliées (vides → supprimées, sinon terminées). */
export async function cleanupStale(maxAgeH = 12) {
  const open = await db.sessions.filter((s) => s.endedAt == null).toArray();
  const cutoff = Date.now() - maxAgeH * 3600e3;
  for (const s of open) {
    if (s.startedAt > cutoff) continue;
    if (!hasDoneSets(s)) await db.sessions.delete(s.id);
    else {
      const last = Math.max(...s.exercises.flatMap((e) => e.sets.map((x) => x.completedAt ?? 0)));
      await db.sessions.put({ ...s, endedAt: last || s.startedAt });
    }
  }
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
