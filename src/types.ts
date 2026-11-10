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

/**
 * Muscles pour lesquels le coach surveille le volume hebdomadaire.
 * Les autres (avant-bras, lombaires…) reçoivent surtout du travail indirect : les signaler ferait du bruit.
 */
export const MAJOR_MUSCLES: ReadonlySet<string> = new Set([
  'Pectoraux',
  'Dos (largeur)',
  'Dos (épaisseur)',
  'Épaules latérales',
  'Biceps',
  'Triceps',
  'Quadriceps',
  'Ischio-jambiers',
  'Fessiers',
  'Mollets'
]);

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
  /** Chargé avec des plates : la saisie se fait en « plates + extra ». */
  plates?: boolean;
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
  /** Séance faite en semaine de décharge : exclue des tendances. */
  deload?: boolean;
  exercises: SessionExercise[];
}

/** Check-in quotidien (clé = date locale AAAA-MM-JJ). */
export interface Checkin {
  id: string;
  date: number;
  /** Heures de sommeil de la nuit précédente. */
  sleepH: number | null;
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
  /** Reprise : au-delà de `layoffDays` sans faire l'exercice, la cible baisse de x %/sem (plafonné). */
  layoffDays: number;
  layoffDropPctPerWeek: number;
  layoffMaxDropPct: number;
  /** Hausse maximale (%) demandée d'une séance à l'autre quand la dernière était sous ton niveau récent. */
  maxJumpPct: number;
  /** Sur un plateau, la progression « due » s'accumule jusqu'à ce total de reps (réparti sur les sets). */
  plateauCapReps: number;
  /** Nombre de reps sous la fourchette toléré avant de baisser la charge. */
  belowRangeTolerance: number;
  /** Autorégulation : écart (%) de forme du jour ignoré, et ajustement maximal (%). */
  autoRegDeadPct: number;
  autoRegMaxPct: number;
  /** Décharge : fraction des sets conservée et RIR ajouté. */
  deloadSetFactor: number;
  deloadRirBonus: number;
  /** Part des exercices en stagnation/régression qui signale une fatigue générale. */
  fatigueShare: number;
  /** Pesées minimales et étendue (jours) pour mesurer la tendance du poids. */
  bwMinPoints: number;
  bwMinDays: number;
  /** Vitesse de prise / perte de poids conseillée (% du poids de corps par semaine). */
  bulkRate: [number, number];
  cutRate: [number, number];
  /** Protéines conseillées (g par kg de poids de corps par jour). */
  proteinRange: [number, number];
  proteinCutRange: [number, number];
  /** Sommeil conseillé (heures). */
  sleepTarget: number;
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
  /** Garder l'écran allumé pendant une séance (Wake Lock). */
  keepAwake: boolean;
  /** Proposer le check-in du jour (sommeil, pesée) sur l'écran Séance. */
  dailyCheckin: boolean;
  /** Semaine de décharge active jusqu'à cette date (ms), sinon null. */
  deloadUntil: number | null;
  lastBackupAt: number | null;
  engine: EngineParams;
}
