import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { db, mergeSettings } from './db';
import type { Exercise } from './types';

export function useSettings() {
  return useLiveQuery(async () => mergeSettings(await db.settings.get('settings')), []);
}

export function useExercises() {
  const list = useLiveQuery(() => db.exercises.toArray(), []);
  const map = useMemo(() => new Map<string, Exercise>((list ?? []).map((e) => [e.id, e])), [list]);
  const visible = useMemo(() => list?.filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [list]);
  return { list: visible, map, loaded: !!list };
}

export function useDays() {
  return useLiveQuery(() => db.days.orderBy('order').toArray(), []);
}

export function useSessions() {
  return useLiveQuery(() => db.sessions.orderBy('startedAt').toArray(), []);
}

export function useBodyweights() {
  return useLiveQuery(() => db.bodyweights.orderBy('date').toArray(), []);
}

export function useCheckins() {
  return useLiveQuery(() => db.checkins.orderBy('date').toArray(), []);
}

/** Re-rend le composant toutes les `ms` et au retour au premier plan. */
export function useNow(ms = 250, active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, active]);
  return now;
}

/** Route minimaliste basée sur le hash (#/progres/ex/<id>). Le geste « retour » d'iOS fonctionne. */
export function useHashRoute(): [string[], (path: string) => void] {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const on = () => setParts(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [parts, go];
}

export const go = (path: string) => {
  window.location.hash = '/' + path;
};

// ---------------------------------------------------------------- thème

export type Theme = 'dark' | 'light' | 'auto';
const themeListeners = new Set<() => void>();

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'auto' ? t : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  const light = t === 'light' || (t === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f4f6' : '#09090b');
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* ignoré */
  }
  applyTheme(t);
  themeListeners.forEach((l) => l());
}

/** Thème courant ; re-rend quand il change (les graphiques relisent leurs couleurs). */
export function useTheme(): Theme {
  // L'instantané inclut le réglage du système pour que le mode « auto » re-rende quand iOS change de thème.
  const snap = () => `${getTheme()}:${window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'l' : 'd'}`;
  const v = useSyncExternalStore(
    (l) => {
      themeListeners.add(l);
      const mq = window.matchMedia?.('(prefers-color-scheme: light)');
      mq?.addEventListener?.('change', l);
      return () => {
        themeListeners.delete(l);
        mq?.removeEventListener?.('change', l);
      };
    },
    snap,
    snap
  );
  return v.split(':')[0] as Theme;
}

/** Couleurs résolues depuis les variables CSS (pour les graphiques SVG). */
export function usePalette() {
  const theme = useTheme();
  const systemLight = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return useMemo(() => {
    const css = (v: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(v).trim().replace(/ /g, ', ')})`;
    return {
      theme,
      bg: css('--bg'),
      surface: css('--surface'),
      raised: css('--raised'),
      line: css('--line'),
      ink: css('--ink'),
      mute: css('--mute'),
      faint: css('--faint'),
      accent: css('--accent'),
      good: css('--good'),
      warn: css('--warn'),
      bad: css('--bad'),
      gold: css('--gold'),
      chart1: css('--chart-1'),
      chart2: css('--chart-2')
    };
  }, [theme, systemLight]);
}
