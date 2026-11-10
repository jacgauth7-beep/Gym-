import Dexie, { type Table } from 'dexie';
import type { BodyWeight, Checkin, Exercise, ProgramDay, Session, Settings } from './types';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS } from './lib/defaults';

class GymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  days!: Table<ProgramDay, string>;
  sessions!: Table<Session, string>;
  bodyweights!: Table<BodyWeight, string>;
  settings!: Table<Settings, string>;
  checkins!: Table<Checkin, string>;

  constructor() {
    super('gym-pwa');
    this.version(1).stores({
      exercises: 'id, name',
      days: 'id, order',
      sessions: 'id, startedAt, endedAt, dayId',
      bodyweights: 'id, date',
      settings: 'id'
    });
    // v2 : ajoute seulement une table. Les données existantes ne sont pas touchées.
    this.version(2).stores({
      checkins: 'id, date'
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

/**
 * Mises à niveau douces des données, sans changement de schéma.
 * Idempotent et sans risque : en cas d'erreur l'app continue avec les valeurs par défaut calculées à la lecture.
 */
export async function softMigrate() {
  try {
    await db.exercises
      .filter((e) => e.plates === undefined)
      .modify((e) => {
        e.plates = e.loadMode === 'perSide' || /t[- ]?bar/i.test(e.name);
      });
  } catch {
    /* non bloquant */
  }
}

/** Exercice chargé avec des plates ? (valeur explicite, sinon déduite du mode de charge) */
export const usesPlates = (e: Pick<Exercise, 'plates' | 'loadMode'>) => e.plates ?? e.loadMode === 'perSide';

export interface Backup {
  version: number;
  exportedAt: string;
  exercises: Exercise[];
  days: ProgramDay[];
  sessions: Session[];
  bodyweights: BodyWeight[];
  settings: Settings[];
  checkins?: Checkin[];
}

export async function exportAll(): Promise<Backup> {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    days: await db.days.toArray(),
    sessions: await db.sessions.toArray(),
    bodyweights: await db.bodyweights.toArray(),
    settings: await db.settings.toArray(),
    checkins: await db.checkins.toArray()
  };
}

/** Vérifie qu'un fichier ressemble à une sauvegarde de l'app avant de tout remplacer. */
export function isBackup(data: unknown): data is Backup {
  const d = data as Backup;
  return !!d && typeof d === 'object' && Array.isArray(d.exercises) && Array.isArray(d.days) && Array.isArray(d.sessions);
}

export async function importAll(data: Backup) {
  await db.transaction('rw', [db.exercises, db.days, db.sessions, db.bodyweights, db.settings, db.checkins], async () => {
    await Promise.all([db.exercises.clear(), db.days.clear(), db.sessions.clear(), db.bodyweights.clear(), db.settings.clear(), db.checkins.clear()]);
    await db.exercises.bulkPut(data.exercises ?? []);
    await db.days.bulkPut(data.days ?? []);
    await db.sessions.bulkPut(data.sessions ?? []);
    await db.bodyweights.bulkPut(data.bodyweights ?? []);
    await db.settings.bulkPut(data.settings ?? []);
    await db.checkins.bulkPut(data.checkins ?? []);
  });
}

// Accès console pour le débogage (Safari → Développement).
if (typeof window !== 'undefined') (window as unknown as { gymdb: GymDB }).gymdb = db;
