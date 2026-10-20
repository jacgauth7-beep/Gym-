export type Unit = 'lb' | 'kg';
export type ExerciseType = 'compound' | 'isolation';
export type LoadMode = 'total' | 'perSide';
export type Goal = 'bulk' | 'maintain' | 'cut';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export const MUSCLES = [
  'Pectoraux',
  'Dos (largeur)',
  'Dos (épaisseur)',
  'Épaules avant',
  'Épaules latérales',
  'Épaules arrière',
  'Biceps',
  'Triceps',
  'Avant-bras',
  'Quadriceps',
  'Ischio-jambiers',
  'Fessiers',
  'Mollets',
  'Abdominaux',
  'Lombaires',
  'Trapèzes',
  'Adducteurs'
] as const;
export type Muscle = (typeof MUSCLES)[number] | string;

/** Exercice de la bibliothèque (réutilisable dans plusieurs jours). */
export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  type: ExerciseType;
  unit: Unit;
  /** Plus petit saut de charge possible (lb ou kg). */
  increment: number;
  /** La notation en plates compte-t-elle par côté (×2) ou au total ? */
  loadMode: LoadMode;
  /** Charge à vide ajoutée au total quand on tape des plates (barre, chariot…). */
  baseWeight: number;
  /** Repos par défaut pour cet exercice (s). null = réglage global. */
  restSec: number | null;
  /** Notes de réglage machine (siège cran 4, etc.). */
  setupNotes: string;
  archived?: boolean;
}

/** Exercice planifié dans un jour du programme. */
export interface ProgramItem {
  id: string;
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: number;
  /** Repos spécifique à ce jour (s). null = celui de l'exercice / global. */
  restSec: number | null;
  notes: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  order: number;
  /** 0 = dimanche … 6 = samedi ; null = rotation. */
  weekdays: number[];
  items: ProgramItem[];
}

export interface SetLog {
  id: string;
  /** Charge totale (unité de l'exercice). */
  weight: number | null;
  /** Saisie brute (ex. « 2 plates + 25 »). */
  notation: string;
  reps: number | null;
  rir: number | null;
  done: boolean;
  completedAt: number | null;
  /** Repos réellement pris avant ce set (s). */
  restTakenSec: number | null;
  note: string;
  target: { weight: number | null; reps: number | null } | null;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  /** Si c'est un swap ponctuel : exercice prévu au programme. */
  swappedFromId: string | null;
  programItemId: string | null;
  repMin: number;
  repMax: number;
  rirTarget: number;
  restSec: number | null;
  skipped: boolean;
  note: string;
  sets: SetLog[];
}

export interface Session {
  id: string;
  dayId: string | null;
  dayName: string;
  startedAt: number;
  endedAt: number | null;
  note: string;
  exercises: SessionExercise[];
}

export interface BodyWeight {
  id: string;
  date: number;
  weight: number;
  unit: Unit;
}

export interface EngineParams {
  /** Taux de départ (% du 1RM estimé / semaine) : [min, max] par niveau. */
  rateBeginner: [number, number];
  rateIntermediate: [number, number];
  rateAdvanced: [number, number];
  /** Années d'ancienneté pour passer intermédiaire / avancé. */
  yearsIntermediate: number;
  yearsAdvanced: number;
  isolationFactor: number;
  compoundFactor: number;
  goalFactorBulk: number;
  goalFactorMaintain: number;
  goalFactorCut: number;
  /** Ajustement par %/sem de variation du poids corporel mesurée. */
  bodyweightTrendK: number;
  bodyweightFactorMin: number;
  bodyweightFactorMax: number;
  /** Ralentissement selon le gain déjà fait depuis les débuts sur l'exercice. */
  gapK: number;
  gapFactorMin: number;
  /** Recalibrage : semaines et séances minimales. */
  recalMinWeeks: number;
  recalMinSessions: number;
  /** Semaines de données pour atteindre le poids maximal de l'historique. */
  recalFullTrustWeeks: number;
  recalMaxWeight: number;
  /** Bornes du taux observé utilisé dans le mélange (× taux théorique). */
  recalClampMax: number;
  /** Zone de tolérance autour de la courbe attendue (± %). */
  tolerancePct: number;
  /** Statut : fenêtre glissante (semaines) et séances minimales. */
  statusWindowWeeks: number;
  statusMinSessions: number;
  /** Pente (%/sem) sous laquelle on parle de stagnation, au-dessus de -x de régression. */
  stagnationPct: number;
  /** Pente observée / attendue au-dessus de laquelle on est « en avance » ou « dans la cible ». */
  aheadRatio: number;
  onTrackRatio: number;
  /** Écart de RIR moyen (vs cible) qui déclenche un conseil. */
  rirDriftWarn: number;
  /** Pause (jours) au-delà de laquelle on ne pousse plus la cible. */
  maxGapDays: number;
  regressionPct: number;
  /** Fenêtres consécutives de stagnation avant de suggérer une décharge. */
  deloadAfterStalls: number;
  deloadPct: number;
  /** Set « dur » : RIR ≤ ce seuil. */
  hardSetRir: number;
  /** Poids d'un set pour un muscle secondaire dans le volume. */
  secondaryWeight: number;
  /** Plage de volume hebdo conseillée (sets durs / muscle). */
  volumeLow: number;
  volumeHigh: number;
}

export interface Settings {
  id: 'settings';
  onboarded: boolean;
  trainingYears: number;
  goal: Goal;
  defaultUnit: Unit;
  defaultRestSec: number;
  plateLb: number;
  plateKg: number;
  sound: boolean;
  vibrate: boolean;
  notify: boolean;
  engine: EngineParams;
}
