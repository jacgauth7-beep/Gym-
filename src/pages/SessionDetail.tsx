import { useMemo, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { db } from '../db';
import { useCheckins, useExercises, useSessions } from '../hooks';
import { rirForCalc } from '../lib/e1rm';
import { detectPRs, exerciseHistory, exerciseRecords, isDone, toDoneSet, withSets, type DoneSet } from '../lib/engine';
import { sessionStats } from '../lib/session';
import { dateKey, fmt, fmtClock, fmtDate, fmtDuration, rirLabel } from '../lib/util';
import type { Session, SessionExercise, SetLog, Settings } from '../types';
import { BatteryCharging, ChevronRight, Dumbbell, Moon, NotebookPen, RotateCcw, Trash2, Trophy } from '../ui/icons';
import { EmptyState, PageHeader, Segmented, Stat, Stepper, cx } from '../ui/kit';
import { Sheet, dialog, toast } from '../ui/overlay';
import { sleepLabel } from './workout/DailyCheckin';

const RIR_OPTS = [0, 1, 2, 3, 4].map((v) => ({ value: v, label: v === 4 ? '4+' : String(v) }));

async function mutate(id: string, fn: (s: Session) => void) {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return;
    fn(s);
    await db.sessions.put(s);
  });
}

export function SessionDetail({ settings, sessionId }: { settings: Settings; sessionId: string }) {
  const sessions = useSessions();
  const checkins = useCheckins();
  const { map: exMap, loaded } = useExercises();
  const [edit, setEdit] = useState<{ se: SessionExercise; set: SetLog } | null>(null);

  const session = sessions?.find((s) => s.id === sessionId);
  const worked = useMemo(() => (sessions ?? []).filter((s) => s.exercises.some((e) => e.sets.some(isDone))), [sessions]);

  if (!sessions || !loaded) return null;
  if (!session) {
    return (
      <div>
        <BackButton fallback="historique" />
        <EmptyState icon={<Dumbbell size={26} />} title="Séance introuvable">
          Elle a peut-être été supprimée.
        </EmptyState>
      </div>
    );
  }

  const p = settings.engine;
  const stats = sessionStats(session, exMap, p.hardSetRir);
  const sleep = checkins?.find((c) => c.id === dateKey(session.startedAt))?.sleepH ?? null;
  const active = session.endedAt == null;
  const otherActive = sessions.some((s) => s.endedAt == null && s.id !== session.id);
  const done = session.exercises.filter((e) => !e.skipped && e.sets.some(isDone));

  // Records : chaque set est comparé à tout ce qui a été fait avant lui (séances précédentes + sets plus tôt dans celle-ci).
  let prCount = 0;
  const blocks = done.map((se) => {
    const ex = exMap.get(se.exerciseId);
    const before = exerciseHistory(worked.filter((s) => s.startedAt < session.startedAt), se.exerciseId);
    const base = exerciseRecords(before);
    const earlier: DoneSet[] = [];
    const rows = se.sets.filter(isDone).map((set) => {
      const prs = session.deload ? [] : detectPRs({ weight: set.weight!, reps: set.reps!, rir: rirForCalc(set.rir) }, withSets(base, earlier));
      earlier.push(toDoneSet(set));
      if (prs.length) prCount++;
      return { set, prs };
    });
    return { se, ex, rows };
  });

  async function remove() {
    if (!(await dialog.confirm({ title: 'Supprimer cette séance ?', message: 'Ses sets disparaîtront de tes graphiques et de tes records. Cette action est définitive.', confirmLabel: 'Supprimer', danger: true }))) return;
    await db.sessions.delete(session!.id);
    toast('Séance supprimée');
    if (window.history.length > 1) window.history.back();
    else window.location.hash = '/historique';
  }

  return (
    <div>
      <BackButton fallback="historique" />
      <PageHeader eyebrow={fmtDate(session.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} title={session.dayName} />

      {(active || session.deload || sleep != null) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {active && <span className="chip tone-accent">Séance en cours</span>}
          {session.deload && (
            <span className="chip tone-good">
              <BatteryCharging size={13} /> Décharge
            </span>
          )}
          {sleep != null && (
            <span className="chip">
              <Moon size={13} /> Sommeil : {sleepLabel(sleep).toLowerCase()}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Durée" value={active ? 'en cours' : fmtDuration(stats.durationMs)} />
        <Stat label="Sets durs" value={stats.hardSets} unit={`sur ${stats.sets}`} />
        <Stat label="Volume" value={fmt(stats.volumeLb / 1000, 1)} unit="k lb" />
        <Stat label="Records" value={prCount} tone={prCount ? 'gold' : undefined} />
      </div>

      <div className="card mt-3 p-4">
        <label className="eyebrow mb-1.5 flex items-center gap-1.5" htmlFor="detail-note">
          <NotebookPen size={13} /> Note de séance
        </label>
        <textarea
          id="detail-note"
          className="input"
          rows={2}
          defaultValue={session.note}
          placeholder="Aucune note"
          onBlur={(e) => {
            const note = e.target.value;
            if (note !== session.note) mutate(session.id, (s) => void (s.note = note));
          }}
        />
      </div>

      <div className="mt-3 space-y-2.5">
        {blocks.map(({ se, ex, rows }) => (
          <section key={se.id} className="card overflow-hidden">
            <a className="flex min-h-[52px] items-center gap-2 px-4 pt-3 active:opacity-70" href={ex ? `#/progres/ex/${ex.id}` : undefined}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{ex?.name ?? 'Exercice supprimé'}</span>
                <span className="block truncate text-xs text-faint">
                  {ex?.primaryMuscle}
                  {se.swappedFromId && ` · swap de ${exMap.get(se.swappedFromId)?.name ?? '?'}`}
                </span>
              </span>
              {ex && <ChevronRight size={18} className="shrink-0 text-faint" />}
            </a>
            {se.note && <p className="px-4 pt-1 text-[13px] text-mute">{se.note}</p>}
            <ol className="mt-2 divide-y divide-line/60 border-t border-line/60">
              {rows.map(({ set, prs }, i) => (
                <li key={set.id}>
                  <button className={cx('flex min-h-[50px] w-full items-center gap-3 px-4 py-2 text-left active:bg-raised/60', prs.length > 0 && 'bg-gold/5')} onClick={() => setEdit({ se, set })} aria-label={`Corriger le set ${i + 1}`}>
                    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-bold text-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="num block text-[15px] font-bold">
                        {fmt(set.weight)} <span className="text-xs font-medium text-faint">{ex?.unit}</span> × {fmt(set.reps)}
                        <span className="ml-1.5 text-xs font-medium text-faint">@ {rirLabel(set.rir)} RIR</span>
                      </span>
                      {(set.notation || set.note || (i > 0 && set.restTakenSec != null)) && (
                        <span className="num block truncate text-[11px] text-faint">{[set.notation, i > 0 && set.restTakenSec != null ? `repos ${fmtClock(set.restTakenSec)}` : '', set.note].filter(Boolean).join(' · ')}</span>
                      )}
                    </span>
                    {prs.length > 0 && (
                      <span className="chip tone-gold">
                        <Trophy size={12} /> Record
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {!blocks.length && <p className="card p-6 text-center text-sm text-mute">Aucun set validé dans cette séance.</p>}
      </div>
      <p className="mt-2 px-1 text-xs text-faint">Touche un set pour le corriger.</p>

      <div className="mt-5 space-y-2">
        {active ? (
          <a className="btn btn-primary w-full" href="#/seance">
            Continuer la séance
          </a>
        ) : (
          !otherActive && (
            <button
              className="btn btn-secondary w-full"
              onClick={async () => {
                await db.sessions.update(session.id, { endedAt: null });
                window.location.hash = '/seance';
              }}
            >
              <RotateCcw size={18} /> Rouvrir pour ajouter des sets
            </button>
          )
        )}
        <button className="btn btn-danger w-full" onClick={remove}>
          <Trash2 size={18} /> Supprimer la séance
        </button>
      </div>

      {edit && <SetEditSheet key={edit.set.id} sessionId={session.id} se={edit.se} set={edit.set} unit={exMap.get(edit.se.exerciseId)?.unit ?? 'lb'} step={exMap.get(edit.se.exerciseId)?.increment ?? 5} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SetEditSheet({ sessionId, se, set, unit, step, onClose }: { sessionId: string; se: SessionExercise; set: SetLog; unit: string; step: number; onClose: () => void }) {
  const [weight, setWeight] = useState<number | null>(set.weight);
  const [reps, setReps] = useState<number | null>(set.reps);
  const [rir, setRir] = useState<number>(set.rir ?? 0);
  const [note, setNote] = useState(set.note);
  const valid = weight != null && weight > 0 && reps != null && reps > 0;
  const patch = (fn: (x: SetLog, list: SetLog[]) => void) =>
    mutate(sessionId, (s) => {
      const e = s.exercises.find((y) => y.id === se.id);
      const x = e?.sets.find((y) => y.id === set.id);
      if (e && x) fn(x, e.sets);
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title="Corriger le set"
      footer={
        <div className="flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary flex-1"
            disabled={!valid}
            onClick={async () => {
              await patch((x) => {
                // la notation en plates n'est plus fiable si la charge a changé
                if (x.weight !== weight) x.notation = '';
                x.weight = weight;
                x.reps = reps;
                x.rir = rir;
                x.note = note;
              });
              onClose();
              toast('Set corrigé');
            }}
          >
            Enregistrer
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stepper ariaLabel="Charge" label="Charge" value={weight} onChange={setWeight} step={step} unit={unit} />
          <Stepper ariaLabel="Répétitions" label="Reps" value={reps} onChange={setReps} step={0.5} />
        </div>
        <div>
          <div className="eyebrow mb-1.5">Reps en réserve (RIR)</div>
          <Segmented value={rir} onChange={setRir} options={RIR_OPTS} size="lg" />
        </div>
        <input className="input" placeholder="Note du set" value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          className="btn btn-danger w-full"
          onClick={async () => {
            if (!(await dialog.confirm({ title: 'Supprimer ce set ?', confirmLabel: 'Supprimer', danger: true }))) return;
            await patch((x, list) => void list.splice(list.indexOf(x), 1));
            onClose();
          }}
        >
          <Trash2 size={18} /> Supprimer ce set
        </button>
      </div>
    </Sheet>
  );
}
