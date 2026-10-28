/**
 * Split V2 personnel (lb, 3:00 de repos, 1 RIR visé), avec les performances
 * de la dernière semaine comme point de départ du moteur.
 */
import { db, saveSettings } from '../db';
import type { Exercise, ExerciseType, LoadMode, ProgramDay, Session, SetLog, Unit } from '../types';
import { parseLoad } from './plates';
import { DAY_MS, uid } from './util';

interface PastSet {
  /** Charge totale, ou notation en plates (« 2 plates + 25 »). */
  w: number | string;
  /** Notation affichée si `w` est un nombre (ex. « 2×10 + 7.5 »). */
  n?: string;
  r: number;
  rir: number;
  note?: string;
}

interface Def {
  name: string;
  muscle: string;
  sec?: string[];
  type?: ExerciseType;
  sets: number;
  min: number;
  max: number;
  setup?: string;
  notes?: string;
  loadMode?: LoadMode;
  unit?: Unit;
  inc?: number;
  last?: PastSet[];
}

interface DayDef {
  name: string;
  weekday: number;
  items: Def[];
}

const iso = (d: Omit<Def, 'type'>): Def => ({ ...d, type: 'isolation' });

export const SPLIT_V2: DayDef[] = [
  {
    name: 'Push (middle chest)',
    weekday: 1,
    items: [
      {
        name: 'Chest press machine', muscle: 'Pectoraux', sec: ['Triceps', 'Épaules avant'], sets: 3, min: 6, max: 8,
        loadMode: 'perSide', setup: 'Poignée niveau 3, hauteur 9e trou du banc',
        last: [
          { w: '2 plates + 5', r: 10, rir: 1 },
          { w: '2 plates + 25', r: 6, rir: 0 },
          { w: '2 plates + 25', r: 5, rir: 0 }
        ]
      },
      {
        name: 'Shoulder press machine (prise neutre)', muscle: 'Épaules avant', sec: ['Triceps', 'Épaules latérales'], sets: 3, min: 8, max: 10,
        last: [
          { w: 215, r: 8, rir: 0 },
          { w: 215, r: 6, rir: 1 },
          { w: 215, r: 7, rir: 0 }
        ]
      },
      iso({ name: 'JM press', muscle: 'Triceps', sets: 2, min: 8, max: 10, notes: 'À déplacer au 2e push ?' }),
      iso({
        name: 'Seated lateral raises', muscle: 'Épaules latérales', sets: 3, min: 10, max: 12, inc: 2.5,
        last: [
          { w: 27.5, n: '2×10 + 7.5', r: 8, rir: 0 },
          { w: 27.5, n: '2×10 + 7.5', r: 6, rir: 0 },
          { w: 25, n: '2×10 + 5', r: 9, rir: 0 }
        ]
      }),
      iso({
        name: 'Low to high pec fly', muscle: 'Pectoraux', sec: ['Épaules avant'], sets: 3, min: 10, max: 12, inc: 2.5,
        setup: 'Hauteur 11, largeur 7',
        last: [
          { w: 32.5, r: 10, rir: 0 },
          { w: 32.5, r: 9, rir: 0 },
          { w: 27.5, r: 9, rir: 0 }
        ]
      }),
      iso({
        name: 'Single arm cable extension', muscle: 'Triceps', sets: 2, min: 8, max: 10, inc: 2.5,
        last: [
          { w: 80, r: 7, rir: 0 },
          { w: 70, r: 8, rir: 1 }
        ]
      })
    ]
  },
  {
    name: 'Pull (upper back)',
    weekday: 2,
    items: [
      {
        name: 'T-bar row', muscle: 'Dos (épaisseur)', sec: ['Dos (largeur)', 'Biceps', 'Épaules arrière'], sets: 3, min: 6, max: 8,
        loadMode: 'total', inc: 2.5,
        last: [
          { w: '3 plates + 25', r: 8, rir: 0 },
          { w: '3 plates + 17.5', r: 7, rir: 0 },
          { w: '3 plates + 17.5', r: 5, rir: 1 }
        ]
      },
      {
        name: 'High to low row', muscle: 'Dos (largeur)', sec: ['Dos (épaisseur)', 'Biceps'], sets: 3, min: 8, max: 10,
        last: [
          { w: 215, r: 6, rir: 0 },
          { w: 215, r: 6, rir: 0 },
          { w: 200, r: 8, rir: 0 }
        ]
      },
      iso({
        name: 'Seated curl 1 bras (machine)', muscle: 'Biceps', sets: 3, min: 8, max: 10,
        last: [
          { w: 150, r: 10, rir: 0 },
          { w: 150, r: 8, rir: 0 },
          { w: 150, r: 7, rir: 0 }
        ]
      }),
      {
        name: '45° seated row', muscle: 'Dos (épaisseur)', sec: ['Dos (largeur)', 'Biceps', 'Épaules arrière'], sets: 2, min: 10, max: 12,
        last: [
          { w: 195, r: 8, rir: 0 },
          { w: 195, r: 6, rir: 0 }
        ]
      },
      iso({
        name: 'Cable hammer curl', muscle: 'Biceps', sec: ['Avant-bras'], sets: 2, min: 10, max: 12, setup: 'Bloc 🔺',
        last: [{ w: 170, r: 7, rir: 0 }]
      })
    ]
  },
  {
    name: 'Legs (ischios/fessiers)',
    weekday: 3,
    items: [
      {
        name: 'RDL Smith machine', muscle: 'Ischio-jambiers', sec: ['Fessiers', 'Lombaires'], sets: 3, min: 8, max: 10,
        loadMode: 'perSide', notes: 'Départ prévu : 2 plates + 25'
      },
      { name: 'Panetta hip thrust', muscle: 'Fessiers', sec: ['Ischio-jambiers'], sets: 3, min: 10, max: 12 },
      iso({
        name: 'Mollets debout (machine)', muscle: 'Mollets', sets: 3, min: 12, max: 15,
        last: [
          { w: 190, r: 9, rir: 0 },
          { w: 190, r: 9, rir: 1 }
        ]
      }),
      iso({
        name: 'Leg extension (machine)', muscle: 'Quadriceps', sets: 3, min: 8, max: 10,
        last: [{ w: 90, r: 13, rir: 0, note: 'Trop léger (13+)' }]
      }),
      iso({
        name: 'Sus machine (#6)', muscle: 'Adducteurs', sets: 3, min: 10, max: 12, setup: '#6',
        last: [
          { w: 120, r: 8, rir: 0 },
          { w: 120, r: 7, rir: 0 },
          { w: 120, r: 6, rir: 0 }
        ]
      }),
      iso({ name: 'Sus machine fessiers', muscle: 'Fessiers', sets: 3, min: 10, max: 12, notes: 'Max + 45' }),
      iso({
        name: 'Crunch machine', muscle: 'Abdominaux', sets: 3, min: 10, max: 12, unit: 'kg',
        last: [{ w: 57, r: 8, rir: 0 }]
      })
    ]
  },
  {
    name: 'Push (upper chest)',
    weekday: 4,
    items: [
      {
        name: 'Incline Smith bench (30°)', muscle: 'Pectoraux', sec: ['Épaules avant', 'Triceps'], sets: 3, min: 6, max: 8,
        loadMode: 'perSide',
        last: [
          { w: 'plate + 30', r: 7, rir: 1 },
          { w: 'plate + 30', r: 7, rir: 0 },
          { w: 'plate + 25', r: 7, rir: 0 }
        ]
      },
      {
        name: 'Shoulder press machine (prise large)', muscle: 'Épaules avant', sec: ['Épaules latérales', 'Triceps'], sets: 3, min: 8, max: 10,
        last: [
          { w: 200, r: 8, rir: 0 },
          { w: 200, r: 7, rir: 0 },
          { w: 200, r: 6, rir: 1 }
        ]
      },
      iso({
        name: 'High to low fly', muscle: 'Pectoraux', sets: 2, min: 8, max: 10, inc: 2.5,
        setup: 'Machine élévations latérales, bras niveau 3',
        last: [{ w: 59.5, r: 10, rir: 2 }]
      }),
      iso({ name: 'Standing lateral raises (machine)', muscle: 'Épaules latérales', sets: 3, min: 10, max: 12, inc: 2.5 }),
      iso({
        name: 'EZ bar cable extension', muscle: 'Triceps', sets: 2, min: 8, max: 10,
        last: [
          { w: 170, r: 10, rir: 0 },
          { w: 170, r: 9, rir: 0 }
        ]
      }),
      iso({ name: 'Pec deck', muscle: 'Pectoraux', sets: 3, min: 10, max: 12, notes: 'Départ prévu : 140' })
    ]
  },
  {
    name: 'Pull (lats)',
    weekday: 5,
    items: [
      {
        name: 'Lat pulldown (machine)', muscle: 'Dos (largeur)', sec: ['Biceps'], sets: 3, min: 6, max: 8,
        last: [
          { w: 225, r: 6, rir: 0 },
          { w: 225, r: 6.5, rir: 0 },
          { w: 210, r: 8, rir: 0 }
        ]
      },
      {
        name: 'Low to high row', muscle: 'Dos (largeur)', sec: ['Dos (épaisseur)', 'Biceps'], sets: 3, min: 8, max: 10,
        loadMode: 'perSide',
        last: [
          { w: '3 plates', r: 10, rir: 0 },
          { w: '3 plates', r: 9, rir: 0 },
          { w: '3 plates', r: 9, rir: 0 }
        ]
      },
      iso({
        name: 'Preacher curl', muscle: 'Biceps', sets: 2, min: 8, max: 10, setup: 'Poitrine #3',
        last: [
          { w: 100, r: 7, rir: 0 },
          { w: 100, r: 6, rir: 0 }
        ]
      }),
      iso({
        name: 'Cable curl (assis)', muscle: 'Biceps', sets: 1, min: 10, max: 12, inc: 2.5,
        last: [{ w: 75, r: 6, rir: 0 }]
      }),
      iso({
        name: 'Pullover machine', muscle: 'Dos (largeur)', sets: 3, min: 10, max: 12, setup: 'Avec straps',
        last: [
          { w: 140, r: 11, rir: 0 },
          { w: 140, r: 6, rir: 0 },
          { w: 140, r: 8, rir: 0 }
        ]
      }),
      iso({
        name: 'Reverse curl', muscle: 'Avant-bras', sec: ['Biceps'], sets: 2, min: 8, max: 10, setup: 'Vulken + bloc 🔺 + barre EZ',
        last: [
          { w: 160, r: 9, rir: 0 },
          { w: 155, r: 8, rir: 0 }
        ]
      })
    ]
  },
  {
    name: 'Legs (quads)',
    weekday: 6,
    items: [
      iso({
        name: 'Seated leg curl', muscle: 'Ischio-jambiers', sets: 3, min: 8, max: 10, setup: 'Avant-dernier trou',
        last: [
          { w: 175, r: 9, rir: 1 },
          { w: 175, r: 8, rir: 1 },
          { w: 190, r: 5, rir: 1 }
        ]
      }),
      {
        name: 'Hack squat (machine)', muscle: 'Quadriceps', sec: ['Fessiers', 'Adducteurs'], sets: 3, min: 10, max: 12,
        loadMode: 'perSide',
        last: [
          { w: '2 plates', r: 9, rir: 0, note: '0-1 RIR' },
          { w: '2 plates + 10', r: 7, rir: 0 },
          { w: '2 plates + 10', r: 7, rir: 0 }
        ]
      },
      iso({
        name: 'Mollets debout (machine)', muscle: 'Mollets', sets: 3, min: 12, max: 15,
        last: [
          { w: 170, r: 11, rir: 0 },
          { w: 200, r: 8, rir: 0 }
        ]
      }),
      iso({ name: 'Leg extension (machine)', muscle: 'Quadriceps', sets: 3, min: 8, max: 10 }),
      iso({ name: 'Back extension', muscle: 'Lombaires', sec: ['Fessiers', 'Ischio-jambiers'], sets: 3, min: 10, max: 12 }),
      iso({
        name: 'Crunch machine', muscle: 'Abdominaux', sets: 3, min: 10, max: 12, unit: 'kg',
        last: [{ w: 50, r: 6, rir: 0 }]
      })
    ]
  }
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Date du dernier `weekday` strictement avant aujourd'hui, à 18 h. */
function lastWeekday(weekday: number, now = new Date()): number {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  let back = (d.getDay() - weekday + 7) % 7;
  if (back === 0) back = 7;
  return d.getTime() - back * DAY_MS;
}

/**
 * Remplace le programme par le split V2 et enregistre la dernière semaine comme historique.
 * Idempotent : relancer met à jour les mêmes exercices et séances.
 */
export async function loadSplitV2(opts: { plateLb: number; plateKg: number }) {
  const existing = await db.exercises.toArray();
  const byName = new Map(existing.map((e) => [norm(e.name), e]));
  const exercises = new Map<string, Exercise>();

  for (const day of SPLIT_V2)
    for (const d of day.items) {
      const key = norm(d.name);
      if (exercises.has(key)) continue;
      const prev = byName.get(key);
      const unit = d.unit ?? 'lb';
      exercises.set(key, {
        id: prev?.id ?? uid(),
        name: d.name,
        primaryMuscle: d.muscle,
        secondaryMuscles: d.sec ?? [],
        type: d.type ?? 'compound',
        unit,
        increment: d.inc ?? (unit === 'kg' ? 2.5 : 5),
        loadMode: d.loadMode ?? 'total',
        baseWeight: prev?.baseWeight ?? 0,
        restSec: null,
        setupNotes: d.setup ?? prev?.setupNotes ?? '',
        archived: false
      });
    }

  const days: ProgramDay[] = SPLIT_V2.map((day, i) => ({
    id: `split-v2-${day.weekday}`,
    name: day.name,
    order: i,
    weekdays: [day.weekday],
    items: day.items.map((d) => ({
      id: uid(),
      exerciseId: exercises.get(norm(d.name))!.id,
      sets: d.sets,
      repMin: d.min,
      repMax: d.max,
      rirTarget: 1,
      restSec: null,
      notes: d.notes ?? ''
    }))
  }));

  const sessions: Session[] = SPLIT_V2.map((day) => {
    const date = lastWeekday(day.weekday);
    const programDay = days.find((d) => d.weekdays.includes(day.weekday))!;
    return {
      id: `split-v2-hist-${day.weekday}`,
      dayId: programDay.id,
      dayName: day.name,
      startedAt: date,
      endedAt: date + 3600e3,
      note: 'Importé (Split V2)',
      exercises: day.items
        .filter((d) => d.last?.length)
        .map((d, k) => {
          const ex = exercises.get(norm(d.name))!;
          const item = programDay.items.find((it) => it.exerciseId === ex.id)!;
          const plate = ex.unit === 'kg' ? opts.plateKg : opts.plateLb;
          const sets: SetLog[] = d.last!.map((s, j) => {
            const parsed = typeof s.w === 'string' ? parseLoad(s.w, { plate, loadMode: ex.loadMode, baseWeight: ex.baseWeight }) : null;
            return {
              id: uid(),
              weight: parsed ? parsed.total : (s.w as number),
              notation: typeof s.w === 'string' ? s.w : (s.n ?? ''),
              reps: s.r,
              rir: s.rir,
              done: true,
              completedAt: date + (k * 4 + j) * 180e3,
              restTakenSec: null,
              note: s.note ?? '',
              target: null
            };
          });
          return {
            id: uid(),
            exerciseId: ex.id,
            swappedFromId: null,
            programItemId: item.id,
            repMin: d.min,
            repMax: d.max,
            rirTarget: 1,
            restSec: null,
            skipped: false,
            note: '',
            sets
          };
        })
    };
  });

  await db.transaction('rw', [db.exercises, db.days, db.sessions], async () => {
    await db.exercises.bulkPut([...exercises.values()]);
    await db.days.clear();
    await db.days.bulkPut(days);
    // Séance ouverte sans set validé : elle venait de l'ancien programme.
    const open = await db.sessions.filter((s) => s.endedAt == null).toArray();
    for (const s of open) if (!s.exercises.some((e) => e.sets.some((x) => x.done))) await db.sessions.delete(s.id);
    await db.sessions.bulkPut(sessions);
  });
  await saveSettings({ defaultRestSec: 180, defaultUnit: 'lb' });
}
