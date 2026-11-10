export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
export const LB_PER_KG = 2.2046226;

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Format français : décimales limitées, virgule. */
export function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return '–';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

/** Nombre signé : « +2,5 » / « −1 ». */
export function fmtSigned(n: number, digits = 1): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '−'}${fmt(Math.abs(r), digits)}`;
}

export function fmtPct(n: number, digits = 2): string {
  return `${fmt(n, digits)} %`;
}

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Date(ts).toLocaleDateString('fr-FR', opts);
}

export const fmtDay = (ts: number) => fmtDate(ts, { day: 'numeric', month: 'short' }).replace('.', '');

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Durée lisible : « 58 min », « 1 h 12 ». */
export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export const rirLabel = (rir: number | null | undefined) => (rir == null ? '–' : rir >= 4 ? '4+' : String(rir));

/** « il y a 3 jours », « hier », « aujourd'hui ». */
export function ago(ts: number, now = Date.now()): string {
  const d = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 14) return `il y a ${d} jours`;
  if (d < 60) return `il y a ${Math.round(d / 7)} sem.`;
  return `il y a ${Math.round(d / 30)} mois`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Clé de jour locale AAAA-MM-JJ. */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lundi 00:00 de la semaine qui contient ts. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Régression linéaire simple. */
export function linreg(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

export const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const WEEKDAYS_LONG_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const plural = (n: number, one: string, many = `${one}s`) => (Math.abs(n) >= 2 ? many : one);

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
