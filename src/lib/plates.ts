import type { Exercise } from '../types';

export interface ParsedLoad {
  /** Charge totale calculée. */
  total: number;
  /** La saisie utilisait-elle des plates ? */
  usedPlates: boolean;
  /** Explication lisible du calcul. */
  explain: string;
}

const PLATE_RE = /^(\d+(?:[.,]\d+)?)?\s*(p|pl|plate|plates|plaque|plaques|disque|disques)$/i;

/**
 * Interprète « 2 plates + 25 », « 2p+10 », « 3 plates », « 185 », « 1 plate - 5 ».
 * - Un simple nombre est la charge TOTALE.
 * - Dès qu'on parle de plates, la valeur suit le réglage de l'exercice :
 *   par côté (×2) ou au total, puis on ajoute la charge à vide (barre, chariot).
 */
export function parseLoad(
  input: string,
  opts: { plate: number; loadMode: Exercise['loadMode']; baseWeight: number }
): ParsedLoad | null {
  const s = input.trim().toLowerCase().replace(/,/g, '.');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s);
    return { total: v, usedPlates: false, explain: '' };
  }
  const tokens = s.replace(/\s+/g, ' ').split(/\s*([+-])\s*/).filter((t) => t !== '');
  let sign = 1;
  let sum = 0;
  let usedPlates = false;
  let expectTerm = true;
  for (const t of tokens) {
    if (t === '+' || t === '-') {
      sign = t === '-' ? -1 : 1;
      expectTerm = true;
      continue;
    }
    if (!expectTerm) return null;
    const m = t.replace(/\s+/g, '').match(PLATE_RE) ?? t.match(/^(\d+(?:\.\d+)?)\s+(plates?|plaques?|disques?|p)$/);
    if (m) {
      const n = m[1] ? parseFloat(m[1]) : 1;
      sum += sign * n * opts.plate;
      usedPlates = true;
    } else if (/^\d+(\.\d+)?$/.test(t)) {
      sum += sign * parseFloat(t);
    } else {
      return null;
    }
    sign = 1;
    expectTerm = false;
  }
  if (expectTerm) return null;
  if (!usedPlates) return { total: sum, usedPlates: false, explain: '' };
  const perSide = opts.loadMode === 'perSide';
  const total = (perSide ? sum * 2 : sum) + opts.baseWeight;
  const parts = [perSide ? `${round(sum)} par côté × 2` : `${round(sum)}`];
  if (opts.baseWeight) parts.push(`+ ${round(opts.baseWeight)} à vide`);
  return { total: round(total), usedPlates: true, explain: parts.join(' ') };
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Écrit une charge totale sous forme de plates (pour l'affichage de la cible). */
export function toPlateNotation(
  total: number,
  opts: { plate: number; loadMode: Exercise['loadMode']; baseWeight: number }
): string | null {
  const net = total - opts.baseWeight;
  if (net <= 0) return null;
  const v = opts.loadMode === 'perSide' ? net / 2 : net;
  const n = Math.floor(v / opts.plate + 1e-9);
  if (n < 1) return null;
  const rest = round(v - n * opts.plate);
  return `${n} plate${n > 1 ? 's' : ''}${rest ? ` + ${rest}` : ''}`;
}
