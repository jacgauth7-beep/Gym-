import type { EngineParams, Exercise, ProgramDay, Settings } from '../types';
import { uid } from './util';

export const DEFAULT_ENGINE: EngineParams = {
  rateBeginner: [1, 2],
  rateIntermediate: [0.5, 1],
  rateAdvanced: [0.25, 0.5],
  yearsIntermediate: 1,
  yearsAdvanced: 4,
  isolationFactor: 0.7,
  compoundFactor: 1,
  goalFactorBulk: 1.15,
  goalFactorMaintain: 1,
  goalFactorCut: 0.5,
  bodyweightTrendK: 0.6,
  bodyweightFactorMin: 0.3,
  bodyweightFactorMax: 1.3,
  gapK: 1.5,
  gapFactorMin: 0.4,
  recalMinWeeks: 4,
  recalMinSessions: 4,
  recalFullTrustWeeks: 12,
  recalMaxWeight: 0.7,
  recalClampMax: 3,
  tolerancePct: 3,
  statusWindowWeeks: 4,
  statusMinSessions: 3,
  stagnationPct: 0.1,
  aheadRatio: 1.5,
  onTrackRatio: 0.75,
  rirDriftWarn: 1.25,
  maxGapDays: 14,
  regressionPct: 0.5,
  deloadAfterStalls: 2,
  deloadPct: 10,
  hardSetRir: 3,
  secondaryWeight: 0.5,
  volumeLow: 10,
  volumeHigh: 20
};

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  onboarded: false,
  trainingYears: 1,
  goal: 'maintain',
  defaultUnit: 'lb',
  defaultRestSec: 180,
  plateLb: 45,
  plateKg: 20,
  sound: true,
  vibrate: true,
  notify: false,
  engine: DEFAULT_ENGINE
};

type Seed = Omit<Exercise, 'id' | 'unit' | 'restSec' | 'setupNotes'> & { key: string };

const ex = (
  key: string,
  name: string,
  primaryMuscle: string,
  secondaryMuscles: string[],
  type: 'compound' | 'isolation',
  loadMode: 'total' | 'perSide' = 'total',
  baseWeight = 0,
  increment = 5
): Seed => ({ key, name, primaryMuscle, secondaryMuscles, type, loadMode, baseWeight, increment });

const SEEDS: Seed[] = [
  ex('bench', 'Développé couché (barre)', 'Pectoraux', ['Triceps', 'Épaules avant'], 'compound', 'perSide', 45),
  ex('incdb', 'Développé incliné haltères', 'Pectoraux', ['Épaules avant', 'Triceps'], 'compound'),
  ex('chestpress', 'Chest press machine', 'Pectoraux', ['Triceps', 'Épaules avant'], 'compound', 'perSide'),
  ex('fly', 'Écarté à la poulie', 'Pectoraux', [], 'isolation', 'total', 0, 2.5),
  ex('ohp', 'Développé militaire', 'Épaules avant', ['Triceps', 'Épaules latérales'], 'compound', 'perSide', 45),
  ex('lat', 'Élévations latérales', 'Épaules latérales', [], 'isolation', 'total', 0, 2.5),
  ex('reardelt', 'Reverse pec deck', 'Épaules arrière', ['Trapèzes'], 'isolation'),
  ex('pushdown', 'Extension triceps poulie', 'Triceps', [], 'isolation', 'total', 0, 2.5),
  ex('skull', 'Extension triceps au-dessus de la tête', 'Triceps', [], 'isolation', 'total', 0, 2.5),
  ex('pulldown', 'Lat pulldown', 'Dos (largeur)', ['Biceps', 'Épaules arrière'], 'compound'),
  ex('pullup', 'Tractions lestées', 'Dos (largeur)', ['Biceps'], 'compound', 'total', 0, 2.5),
  ex('row', 'Rowing barre', 'Dos (épaisseur)', ['Dos (largeur)', 'Biceps', 'Lombaires'], 'compound', 'perSide', 45),
  ex('cablerow', 'Tirage horizontal poulie', 'Dos (épaisseur)', ['Dos (largeur)', 'Biceps'], 'compound'),
  ex('curl', 'Curl haltères', 'Biceps', ['Avant-bras'], 'isolation', 'total', 0, 2.5),
  ex('hammer', 'Curl marteau', 'Biceps', ['Avant-bras'], 'isolation', 'total', 0, 2.5),
  ex('squat', 'Squat (barre)', 'Quadriceps', ['Fessiers', 'Adducteurs', 'Lombaires'], 'compound', 'perSide', 45),
  ex('hack', 'Hack squat', 'Quadriceps', ['Fessiers'], 'compound', 'perSide'),
  ex('legpress', 'Presse à cuisses', 'Quadriceps', ['Fessiers', 'Adducteurs'], 'compound', 'perSide'),
  ex('legext', 'Leg extension', 'Quadriceps', [], 'isolation'),
  ex('rdl', 'Soulevé de terre roumain', 'Ischio-jambiers', ['Fessiers', 'Lombaires'], 'compound', 'perSide', 45),
  ex('legcurl', 'Leg curl assis', 'Ischio-jambiers', [], 'isolation'),
  ex('hipthrust', 'Hip thrust', 'Fessiers', ['Ischio-jambiers'], 'compound', 'perSide', 45),
  ex('calf', 'Mollets debout', 'Mollets', [], 'isolation'),
  ex('crunch', 'Crunch à la poulie', 'Abdominaux', [], 'isolation')
];

export function seedLibrary(unit: 'lb' | 'kg'): { exercises: Exercise[]; days: ProgramDay[] } {
  const byKey = new Map<string, Exercise>();
  const exercises = SEEDS.map(({ key, ...s }) => {
    const e: Exercise = {
      ...s,
      id: uid(),
      unit,
      increment: unit === 'kg' ? Math.max(1, s.increment / 2.5) : s.increment,
      baseWeight: unit === 'kg' ? Math.round(s.baseWeight / 2.25) : s.baseWeight,
      restSec: s.type === 'isolation' ? 120 : null,
      setupNotes: ''
    };
    byKey.set(key, e);
    return e;
  });
  const item = (key: string, sets: number, repMin: number, repMax: number, rirTarget = 1) => ({
    id: uid(),
    exerciseId: byKey.get(key)!.id,
    sets,
    repMin,
    repMax,
    rirTarget,
    restSec: null,
    notes: ''
  });
  const days: ProgramDay[] = [
    {
      id: uid(), name: 'Haut A', order: 0, weekdays: [1],
      items: [item('bench', 3, 6, 10), item('pulldown', 3, 8, 12), item('incdb', 2, 8, 12), item('cablerow', 2, 8, 12), item('lat', 3, 12, 20, 0), item('pushdown', 2, 10, 15, 0)]
    },
    {
      id: uid(), name: 'Bas A', order: 1, weekdays: [2],
      items: [item('squat', 3, 5, 8, 2), item('rdl', 3, 6, 10, 2), item('legext', 2, 10, 15, 0), item('legcurl', 2, 10, 15, 0), item('calf', 3, 10, 15, 0)]
    },
    {
      id: uid(), name: 'Haut B', order: 2, weekdays: [4],
      items: [item('ohp', 3, 6, 10), item('pullup', 3, 6, 10), item('chestpress', 2, 8, 12), item('row', 2, 8, 12), item('curl', 3, 10, 15, 0), item('skull', 2, 10, 15, 0)]
    },
    {
      id: uid(), name: 'Bas B', order: 3, weekdays: [5],
      items: [item('hack', 3, 6, 10), item('hipthrust', 3, 8, 12), item('legpress', 2, 10, 15), item('legcurl', 3, 10, 15, 0), item('crunch', 3, 10, 15, 0)]
    }
  ];
  return { exercises, days };
}
