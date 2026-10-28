import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db';
import { loadSplitV2 } from './mySplit';

describe('split V2', () => {
  it('charge 6 jours et calcule les plates', async () => {
    await loadSplitV2({ plateLb: 45, plateKg: 20 });
    await loadSplitV2({ plateLb: 45, plateKg: 20 }); // idempotent
    const days = await db.days.orderBy('order').toArray();
    expect(days.map((d) => d.weekdays[0])).toEqual([1, 2, 3, 4, 5, 6]);
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(6);
    const exs = await db.exercises.toArray();
    const id = (n: string) => exs.find((e) => e.name === n)!.id;
    const sets = (n: string) => sessions.flatMap((s) => s.exercises.filter((e) => e.exerciseId === id(n)).flatMap((e) => e.sets));
    expect(sets('Chest press machine').map((s) => s.weight)).toEqual([190, 230, 230]);
    expect(sets('T-bar row')[0].weight).toBe(160);
    expect(sets('Incline Smith bench (30°)')[0].weight).toBe(150);
    expect(sets('Hack squat (machine)').map((s) => s.weight)).toEqual([180, 200, 200]);
    expect(sets('Mollets debout (machine)')).toHaveLength(4);
    expect(exs.filter((e) => e.name === 'Mollets debout (machine)')).toHaveLength(1);
  });
});
