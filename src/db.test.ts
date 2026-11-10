import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

/** Simule un téléphone qui a la version 1 de l'app, puis ouvre la version 2. */
describe('mise à niveau de la base', () => {
  it('v1 → v2 : aucune donnée perdue, nouvelles valeurs par défaut', async () => {
    const v1 = new Dexie('gym-pwa');
    v1.version(1).stores({ exercises: 'id, name', days: 'id, order', sessions: 'id, startedAt, endedAt, dayId', bodyweights: 'id, date', settings: 'id' });
    await v1.table('exercises').bulkPut([
      { id: 'e1', name: 'Chest press machine', primaryMuscle: 'Pectoraux', secondaryMuscles: ['Triceps'], type: 'compound', unit: 'lb', increment: 5, loadMode: 'perSide', baseWeight: 0, restSec: null, setupNotes: 'Poignée 3' },
      { id: 'e2', name: 'T-bar row', primaryMuscle: 'Dos (épaisseur)', secondaryMuscles: [], type: 'compound', unit: 'lb', increment: 2.5, loadMode: 'total', baseWeight: 0, restSec: null, setupNotes: '' },
      { id: 'e3', name: 'Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], type: 'isolation', unit: 'lb', increment: 2.5, loadMode: 'total', baseWeight: 0, restSec: 120, setupNotes: '' }
    ]);
    await v1.table('days').put({ id: 'd1', name: 'Push', order: 0, weekdays: [1], items: [{ id: 'i1', exerciseId: 'e1', sets: 3, repMin: 6, repMax: 8, rirTarget: 1, restSec: 150, notes: '' }] });
    await v1.table('sessions').put({
      id: 's1', dayId: 'd1', dayName: 'Push', startedAt: 1000, endedAt: 5000, note: 'ok',
      exercises: [{ id: 'x', exerciseId: 'e1', swappedFromId: null, programItemId: 'i1', repMin: 6, repMax: 8, rirTarget: 1, restSec: null, skipped: false, note: '', sets: [{ id: 'a', weight: 230, notation: '2 plates + 25', reps: 6, rir: 0, done: true, completedAt: 2000, restTakenSec: null, note: '', target: null }] }]
    });
    await v1.table('bodyweights').put({ id: 'b1', date: 1000, weight: 183, unit: 'lb' });
    // réglages d'une ancienne version : il manque les clés ajoutées depuis
    await v1.table('settings').put({ id: 'settings', onboarded: true, trainingYears: 3, goal: 'bulk', defaultUnit: 'lb', defaultRestSec: 150, plateLb: 45, plateKg: 20, sound: false, vibrate: true, notify: false, engine: { volumeLow: 12, rateBeginner: [1, 2] } });
    v1.close();

    const { db, getSettings, softMigrate, usesPlates, exportAll, importAll, isBackup } = await import('./db');
    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.get('s1'))!.exercises[0].sets[0]).toMatchObject({ weight: 230, notation: '2 plates + 25', reps: 6, rir: 0, done: true });
    expect(await db.days.count()).toBe(1);
    expect(await db.bodyweights.count()).toBe(1);
    expect(await db.checkins.count()).toBe(0);

    const s = await getSettings();
    expect(s).toMatchObject({ onboarded: true, trainingYears: 3, goal: 'bulk', defaultRestSec: 150, sound: false, keepAwake: true, dailyCheckin: true, deloadUntil: null, lastBackupAt: null });
    expect(s.engine.volumeLow).toBe(12);
    expect(s.engine.maxJumpPct).toBe(5);
    expect(s.engine.proteinRange).toEqual([1.6, 2.2]);

    await softMigrate();
    await softMigrate();
    const ex = await db.exercises.toArray();
    expect(ex.find((e) => e.id === 'e1')!.plates).toBe(true);
    expect(ex.find((e) => e.id === 'e2')!.plates).toBe(true);
    expect(ex.find((e) => e.id === 'e3')!.plates).toBe(false);
    expect(ex.find((e) => e.id === 'e1')!.setupNotes).toBe('Poignée 3');
    expect(usesPlates({ loadMode: 'perSide' })).toBe(true);
    expect(usesPlates({ loadMode: 'perSide', plates: false })).toBe(false);

    // sauvegarde → restauration à l'identique, y compris une sauvegarde v1 sans check-ins
    await db.checkins.put({ id: '2026-11-10', date: 1, sleepH: 7.5 });
    const backup = await exportAll();
    expect(isBackup(backup)).toBe(true);
    expect(isBackup({ foo: 1 })).toBe(false);
    expect(isBackup(null)).toBe(false);
    await db.sessions.clear();
    await importAll(JSON.parse(JSON.stringify(backup)));
    expect(await db.sessions.count()).toBe(1);
    expect(await db.checkins.count()).toBe(1);
    const { checkins: _c, ...old } = backup;
    await importAll(JSON.parse(JSON.stringify(old)));
    expect(await db.sessions.count()).toBe(1);
    expect(await db.checkins.count()).toBe(0);
  });
});
