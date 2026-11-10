import { useEffect, useRef, useState } from 'react';
import { db, saveSettings } from '../../db';
import { ExercisePicker } from '../../components/ExercisePicker';
import { useNow } from '../../hooks';
import type { EngineContext } from '../../lib/engine';
import { adHocExercise, fromItem, hasDoneSets, isDeloadActive, mutateSession } from '../../lib/session';
import { timer } from '../../lib/timer';
import { DAY_MS, fmtDate, fmtDuration, plural } from '../../lib/util';
import type { Exercise, ProgramDay, Session } from '../../types';
import { BatteryCharging, CalendarDays, Check, Ellipsis, NotebookPen, Plus, Trash2 } from '../../ui/icons';
import { IconButton, ListRow, PageHeader, ProgressBar } from '../../ui/kit';
import { Sheet, dialog, toast } from '../../ui/overlay';
import { DailyCheckin } from './DailyCheckin';
import { DayPicker } from './DayPicker';
import { ExerciseCard } from './ExerciseCard';
import { WeekStrip } from './WeekStrip';

export function ActiveSession({
  session,
  persisted,
  sessions,
  days,
  library,
  exMap,
  ctx,
  visible,
  onPickDay,
  onDiscard
}: {
  session: Session;
  /** false tant que la séance n'est qu'un brouillon (aucune action encore). */
  persisted: boolean;
  sessions: Session[];
  days: ProgramDay[];
  library: Exercise[];
  exMap: Map<string, Exercise>;
  ctx: EngineContext;
  visible: boolean;
  onPickDay: (day: ProgramDay) => void;
  onDiscard: () => void;
}) {
  const { settings } = ctx;
  const [sheet, setSheet] = useState<null | 'menu' | 'add' | 'days'>(null);
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const scrollNext = useRef(false);

  const started = hasDoneSets(session);
  const doneCount = session.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const totalCount = session.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.length), 0);
  const now = useNow(20_000, started && visible);
  const deload = isDeloadActive(settings);

  // Par défaut, l'exercice ouvert est le premier qui a encore des sets à faire.
  const auto = session.exercises.find((e) => !e.skipped && e.sets.some((s) => !s.done))?.id ?? null;
  const open = openId !== undefined && (openId === null || session.exercises.some((e) => e.id === openId)) ? openId : auto;

  useEffect(() => {
    if (!scrollNext.current || !visible || !open) return;
    scrollNext.current = false;
    const id = window.setTimeout(() => document.getElementById(`ex-${open}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    return () => window.clearTimeout(id);
  }, [open, visible]);

  async function changeDay(day: ProgramDay) {
    setSheet(null);
    if (!persisted) return onPickDay(day);
    if (started && !(await dialog.confirm({ title: 'Changer de séance ?', message: 'Les sets déjà validés aujourd’hui seront remplacés par les exercices de ce jour.', confirmLabel: 'Remplacer', danger: true }))) return;
    await mutateSession(session, (s) => {
      s.dayId = day.id;
      s.dayName = day.name;
      s.exercises = day.items.map((it) => fromItem(it, s.deload ? Math.ceil(it.sets * settings.engine.deloadSetFactor) : it.sets));
    });
    setOpenId(undefined);
  }

  async function discard() {
    setSheet(null);
    if (started && !(await dialog.confirm({ title: 'Abandonner la séance ?', message: 'Les sets validés aujourd’hui seront supprimés.', confirmLabel: 'Abandonner', danger: true }))) return;
    if (persisted) await db.sessions.delete(session.id);
    timer.stop();
    onDiscard();
  }

  async function finish() {
    if (!started) return discard();
    const left = totalCount - doneCount;
    if (left > 0 && !(await dialog.confirm({ title: `Il reste ${left} ${plural(left, 'set')}`, message: 'Terminer la séance quand même ?', confirmLabel: 'Terminer' }))) return;
    await mutateSession(session, (s) => {
      s.endedAt = Date.now();
    });
    timer.stop();
    window.scrollTo({ top: 0 });
  }

  async function toggleDeload() {
    setSheet(null);
    if (deload) {
      await saveSettings({ deloadUntil: null });
      if (persisted && !started) await db.sessions.delete(session.id);
      else if (persisted) await mutateSession(session, (s) => void (s.deload = undefined));
      toast('Décharge arrêtée');
      return;
    }
    const ok = await dialog.confirm({
      title: 'Semaine de décharge',
      message: 'Pendant 7 jours : moitié moins de sets, 2 reps de plus en réserve, mêmes charges. Ces séances ne comptent pas dans tes tendances.',
      confirmLabel: 'Activer'
    });
    if (!ok) return;
    await saveSettings({ deloadUntil: Date.now() + 7 * DAY_MS });
    // la séance du jour repart en mode décharge si rien n'est encore validé
    if (persisted && !started) await db.sessions.delete(session.id);
    else if (persisted) await mutateSession(session, (s) => void (s.deload = true));
    toast('Décharge activée pour 7 jours', { tone: 'good', icon: <BatteryCharging size={16} className="text-good" /> });
  }

  const firstDone = Math.min(...session.exercises.flatMap((e) => e.sets.map((s) => s.completedAt ?? Infinity)));
  const seenMuscles = new Set<string>();

  return (
    <div>
      <PageHeader
        eyebrow={fmtDate(session.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={session.dayName}
        right={
          <IconButton label="Options de la séance" onClick={() => setSheet('menu')}>
            <Ellipsis size={20} />
          </IconButton>
        }
      />

      <div className="card mb-3 p-4">
        <WeekStrip sessions={sessions} days={days} />
      </div>

      {settings.dailyCheckin && (
        <div className="mb-3">
          <DailyCheckin settings={settings} />
        </div>
      )}

      {session.deload && (
        <div className="mb-3 flex items-start gap-3 rounded-3xl bg-good/10 p-4 text-sm text-good">
          <BatteryCharging size={18} className="mt-0.5 shrink-0" />
          <p>
            <b>Séance de décharge.</b> Moins de sets, plus loin de l’échec, mêmes charges. Tu dois sortir plus frais que tu n’es entré.
          </p>
        </div>
      )}

      <div className="mb-3 px-1">
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-faint">
          <span>
            <span className="num font-bold text-ink">{doneCount}</span> / {totalCount} sets
          </span>
          <span className="num">{started && isFinite(firstDone) ? fmtDuration(now - firstDone) : `${session.exercises.length} ${plural(session.exercises.length, 'exercice')}`}</span>
        </div>
        <ProgressBar value={totalCount ? doneCount / totalCount : 0} tone={doneCount === totalCount && totalCount > 0 ? 'good' : 'accent'} />
      </div>

      <div className="space-y-2.5">
        {session.exercises.map((se, i) => {
          const muscle = exMap.get(se.exerciseId)?.primaryMuscle ?? '';
          const first = !seenMuscles.has(muscle);
          if (!se.skipped) seenMuscles.add(muscle);
          const next = session.exercises.slice(i + 1).find((e) => !e.skipped && e.sets.some((s) => !s.done));
          return (
            <div key={se.id} id={`ex-${se.id}`} className="scroll-mt-4">
              <ExerciseCard
                index={i}
                count={session.exercises.length}
                session={session}
                se={se}
                sessions={sessions}
                library={library}
                exMap={exMap}
                ctx={ctx}
                open={open === se.id}
                onToggle={() => setOpenId(open === se.id ? null : se.id)}
                onCompleted={() => {
                  scrollNext.current = true;
                  setOpenId(undefined);
                }}
                firstForMuscle={first}
                nextExerciseName={next ? (exMap.get(next.exerciseId)?.name ?? null) : null}
                visible={visible}
              />
            </div>
          );
        })}
      </div>

      <button className="btn btn-secondary mt-3 w-full" onClick={() => setSheet('add')}>
        <Plus size={18} /> Ajouter un exercice
      </button>

      <div className="card mt-3 p-4">
        <label className="eyebrow mb-1.5 flex items-center gap-1.5" htmlFor="session-note">
          <NotebookPen size={13} /> Note de séance
        </label>
        <textarea
          id="session-note"
          key={session.id}
          className="input"
          rows={2}
          defaultValue={session.note}
          placeholder="Énergie, douleur, contexte…"
          onBlur={(e) => {
            const note = e.target.value;
            if (note !== session.note) mutateSession(session, (s) => void (s.note = note));
          }}
        />
      </div>

      <button className={started ? 'btn btn-primary btn-lg mt-4 w-full' : 'btn btn-secondary btn-lg mt-4 w-full'} onClick={finish} disabled={!started && !persisted}>
        <Check size={22} strokeWidth={2.6} />
        Terminer la séance
      </button>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={session.dayName} subtitle="Options de la séance">
        <div className="card divide-y divide-line/60 overflow-hidden">
          <ListRow icon={<CalendarDays size={18} />} title="Changer de séance" subtitle="Faire un autre jour du programme" onClick={() => setSheet('days')} />
          <ListRow icon={<Plus size={18} />} title="Ajouter un exercice" subtitle="Seulement pour aujourd’hui" onClick={() => setSheet('add')} />
          <ListRow
            icon={<BatteryCharging size={18} />}
            iconTone="good"
            title={deload ? 'Arrêter la décharge' : 'Semaine de décharge'}
            subtitle={deload ? `Active jusqu’au ${fmtDate(settings.deloadUntil!)}` : 'Moins de sets, plus loin de l’échec, 7 jours'}
            onClick={toggleDeload}
          />
          {(persisted || started) && <ListRow icon={<Trash2 size={18} />} iconTone="bad" danger title="Abandonner la séance" onClick={discard} chevron={false} />}
        </div>
      </Sheet>

      <DayPicker open={sheet === 'days'} onClose={() => setSheet(null)} onPick={changeDay} days={days} sessions={sessions} exMap={exMap} settings={settings} currentId={session.dayId} />

      <ExercisePicker
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        exercises={library}
        title="Ajouter un exercice"
        subtitle="Ajouté à cette séance seulement."
        onPick={async (ex) => {
          setSheet(null);
          const added = adHocExercise(ex.id);
          await mutateSession(session, (s) => void s.exercises.push(added));
          scrollNext.current = true;
          setOpenId(added.id);
        }}
      />
    </div>
  );
}
