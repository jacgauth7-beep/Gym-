/**
 * 1RM estimé, formule d'Epley corrigée par le RIR :
 * on considère que le set valait (reps + RIR) répétitions jusqu'à l'échec.
 *   e1RM = charge × (1 + (reps + RIR) / 30)
 */
export function epley(weight: number, reps: number, rir = 0): number {
  if (!weight || weight <= 0 || reps <= 0) return 0;
  const r = reps + Math.max(0, rir);
  return weight * (1 + r / 30);
}

/** Reps nécessaires à `weight` (en laissant `rir` en réserve) pour atteindre `e1rm`. */
export function repsFor(e1rm: number, weight: number, rir = 0): number {
  return 30 * (e1rm / weight - 1) - rir;
}

/** Charge permettant `reps` à `rir` pour un e1RM donné. */
export function weightFor(e1rm: number, reps: number, rir = 0): number {
  return e1rm / (1 + (reps + rir) / 30);
}

/** RIR stocké « 4 » signifie « 4 ou plus » : on le plafonne pour les calculs. */
export const rirForCalc = (rir: number | null | undefined) => (rir == null ? 0 : Math.min(rir, 4));
