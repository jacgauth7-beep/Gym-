import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db, mergeSettings } from './db';
import type { Exercise } from './types';

export function useSettings() {
  return useLiveQuery(async () => mergeSettings(await db.settings.get('settings')), []);
}

export function useExercises() {
  const list = useLiveQuery(() => db.exercises.toArray(), []);
  const map = useMemo(() => new Map<string, Exercise>((list ?? []).map((e) => [e.id, e])), [list]);
  return { list: list?.filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name, 'fr')), map, loaded: !!list };
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

/** Re-rend le composant toutes les `ms` et au retour au premier plan. */
export function useNow(ms = 250, active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, active]);
  return now;
}

/** Route minimaliste basée sur le hash (#/progres/<id>). */
export function useHashRoute(): [string[], (path: string) => void] {
  const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const on = () => setParts(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [parts, (p: string) => (window.location.hash = '/' + p)];
}
