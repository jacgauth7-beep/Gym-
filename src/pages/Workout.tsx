import { useEffect, useMemo, useState } from 'react';
import { useBodyweights, useDays, useExercises, useSessions } from '../hooks';
import type { EngineContext } from '../lib/engine';
import { buildSession, isDeloadActive, planToday } from '../lib/session';
import { dateKey, startOfDay } from '../lib/util';
import type { Settings } from '../types';
import { CalendarDays } from '../ui/icons';
import { EmptyState } from '../ui/kit';
import { ActiveSession } from './workout/ActiveSession';
import { DayPicker } from './workout/DayPicker';
import { RestDay } from './workout/RestDay';
import { Summary } from './workout/Summary';

/**
 * Onglet Séance. La séance du jour s'affiche tout de suite, prête à être saisie :
 * - séance en cours (enregistrée) ;
 * - sinon brouillon du jour prévu, créé en base seulement à la première action ;
 * - sinon bilan de la séance qui vient d'être terminée ;
 * - sinon jour de repos.
 */
export function Workout({ settings, visible }: { settings: Settings; visible: boolean }) {
  const sessions = useSessions();
  const days = useDays();
  const { list: library, map: exMap, loaded } = useExercises();
  const bodyweights = useBodyweights();
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [today, setToday] = useState(() => dateKey(Date.now()));

  // Passage de minuit ou retour dans l'app le lendemain : on recalcule le jour.
  useEffect(() => {
    const check = () => setToday(dateKey(Date.now()));
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const now = Date.now();
  const active = sessions?.find((s) => s.endedAt == null);
  const recentDone = useMemo(
    () => (sessions ? [...sessions].reverse().find((s) => s.endedAt != null && (s.startedAt >= startOfDay(Date.now()) || s.endedAt > Date.now() - 3 * 3600e3)) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, today]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => (days && sessions ? planToday(days, sessions) : null), [days, sessions, today]);
  const overrideDay = days?.find((d) => d.id === overrideId) ?? null;
  const showSummary = !active && !overrideDay && !!recentDone;
  const draftDay = active || showSummary ? null : (overrideDay ?? (plan && plan.kind !== 'rest' ? plan.day : null));
  const deload = isDeloadActive(settings, now);
  const draft = useMemo(
    () => (draftDay ? buildSession(draftDay, { deload, p: settings.engine }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftDay, deload, settings.engine.deloadSetFactor, today]
  );

  // Une fois la séance choisie réellement commencée, le choix manuel n'a plus lieu d'être.
  useEffect(() => {
    if (active && overrideId) setOverrideId(null);
  }, [active, overrideId]);

  if (!sessions || !days || !loaded || !bodyweights) return null;

  if (!days.length) {
    return (
      <div className="pt-10">
        <EmptyState
          icon={<CalendarDays size={26} />}
          title="Pas encore de programme"
          action={
            <a className="btn btn-primary w-full" href="#/programme">
              Créer mon programme
            </a>
          }
        >
          Ajoute tes jours et tes exercices : la séance du jour s’ouvrira ici toute seule.
        </EmptyState>
      </div>
    );
  }

  const ctx: EngineContext = { settings, bodyweights, now };
  const picked = (
    <DayPicker
      open={picker}
      onClose={() => setPicker(false)}
      onPick={(d) => {
        setPicker(false);
        setOverrideId(d.id);
        window.scrollTo({ top: 0 });
      }}
      days={days}
      sessions={sessions}
      exMap={exMap}
      settings={settings}
    />
  );

  const current = active ?? draft;
  if (current) {
    return (
      <ActiveSession
        key={current.id}
        session={current}
        persisted={!!active}
        sessions={sessions}
        days={days}
        library={library ?? []}
        exMap={exMap}
        ctx={ctx}
        visible={visible}
        onPickDay={(d) => setOverrideId(d.id)}
        onDiscard={() => setOverrideId(null)}
      />
    );
  }
  if (showSummary && recentDone) {
    return (
      <>
        <Summary session={recentDone} sessions={sessions} exMap={exMap} ctx={ctx} onNew={() => setPicker(true)} />
        {picked}
      </>
    );
  }
  if (plan?.kind === 'rest') {
    return (
      <>
        <RestDay plan={plan} sessions={sessions} days={days} exMap={exMap} settings={settings} onPick={() => setPicker(true)} />
        {picked}
      </>
    );
  }
  return null;
}
