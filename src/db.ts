import Dexie, { type Table } from 'dexie';
import type { BodyWeight, Exercise, ProgramDay, Session, Settings } from './types';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS } from './lib/defaults';

class GymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  days!: Table<ProgramDay, string>;
  sessions!: Table<Session, string>;
  bodyweights!: Table<BodyWeight, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('gym-pwa');
    this.version(1).stores({
      exercises: 'id, name',
      days: 'id, order',
      sessions: 'id, startedAt, endedAt, dayId',
      bodyweights: 'id, date',
      settings: 'id'
    });
  }
}

export const db = new GymDB();

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return mergeSettings(s);
}

/** Complète les réglages stockés avec les nouvelles clés par défaut. */
export function mergeSettings(s: Settings | undefined): Settings {
  if (!s) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...s, engine: { ...DEFAULT_ENGINE, ...s.engine } };
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'settings' });
}

export async function exportAll() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    days: await db.days.toArray(),
    sessions: await db.sessions.toArray(),
    bodyweights: await db.bodyweights.toArray(),
    settings: await db.settings.toArray()
  };
}

export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  await db.transaction('rw', [db.exercises, db.days, db.sessions, db.bodyweights, db.settings], async () => {
    await Promise.all([db.exercises.clear(), db.days.clear(), db.sessions.clear(), db.bodyweights.clear(), db.settings.clear()]);
    await db.exercises.bulkPut(data.exercises ?? []);
    await db.days.bulkPut(data.days ?? []);
    await db.sessions.bulkPut(data.sessions ?? []);
    await db.bodyweights.bulkPut(data.bodyweights ?? []);
    await db.settings.bulkPut(data.settings ?? []);
  });
}

// Accès console pour le débogage (Safari → Développement).
if (typeof window !== 'undefined') (window as unknown as { gymdb: GymDB }).gymdb = db;
