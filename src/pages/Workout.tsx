import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db';
import { useBodyweights, useDays, useExercises, useSessions } from '../hooks';
import { ExercisePicker } from '../components/ExercisePicker';
import { Segmented, Sheet, Why } from '../components/ui';
import { epley, rirForCalc } from '../lib/e1rm';
import {
  STATUS_STYLE,
  exerciseHistory,
  exerciseStatus,
  expectedRate,
  projections,
  sessionTargets,
  type EngineContext,
  type ExerciseSession,
  type SetTarget
} from '../lib/engine';
import { parseLoad, toPlateNotation } from '../lib/plates';
import { emptySet, fromItem, hasDoneSets, pickTodayDay, restBefore, restFor, startSession } from '../lib/session';
import { timer, unlockAudio } from '../lib/timer';
import { fmt, fmtClock, fmtDate, uid } from '../lib/util';
import type { Exercise, Session, SessionExercise, SetLog, Settings } from '../types';

/** Lecture-modification-écriture atomique d'une séance (évite les courses entre taps rapides). */
async function mutate(id: string, fn: (s: Session) => void) {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id);
    if (!s) return;
    fn(s);
    await db.sessions.put(s);
  });
}

export function Workout({ settings }: { settings: Settings }) {
  const sessions = useSessions();
  const days = useDays();
  const { list: library, map: exMap, loaded } = useExercises();
  const bodyweights = useBodyweights();
  const starting = useRef(false);
  const [forceNew, setForceNew] = useState(false);

  const active = sessions?.find((s) => s.endedAt == null);
  const today0 = new Date().setHours(0, 0, 0, 0);
  const doneToday = sessions?.filter((s) => s.endedAt && s.startedAt >= today0).pop();

  // La séance du jour s'ouvre automatiquement.
  useEffect(() => {
    if (!sessions || !days || active || starting.current) return;
    if (doneToday && !forceNew) return;
    const day = pickTodayDay(days, sessions);
    if (!day) return;
    starting.current = true;
    startSession(day).finally(() => {
      starting.current = false;
      setForceNew(false);
    });
  }, [sessions, days, active, doneToday, forceNew]);

  if (!sessions || !days || !loaded || !bodyweights) return null;

  if (!days.length) {
    return (
      <div className="card mt-6 text-center">
        <p className="mb-3">Aucun jour de programme pour l'instant.</p>
        <a className="btn-primary" href="#/programme">
          Créer mon programme
        </a>
      </div>
    );
  }

  if (!active && doneToday) {
    return <Summary session={doneToday} sessions={sessions} exMap={exMap} settings={settings} onNew={() => setForceNew(true)} />;
  }
  if (!active) return <p className="p-6 text-center text-mute">Préparation de la séance…</p>;

  const ctx: EngineContext = { settings, bodyweights, now: Date.now() };
  return <ActiveSession session={active} sessions={sessions} days={days} library={library ?? []} exMap={exMap} ctx={ctx} />;
}

// ---------------------------------------------------------------- séance active

function ActiveSession({
  session,
  sessions,
  days,
  library,
  exMap,
  ctx
}: {
  session: Session;
  sessions: Session[];
  days: import('../types').ProgramDay[];
  library: Exercise[];
  exMap: Map<string, Exercise>;
  ctx: EngineContext;
}) {
  const [adding, setAdding] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const doneCount = session.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const totalCount = session.exercises.reduce((a, e) => a + (e.skipped ? 0 : e.sets.length), 0);

  async function changeDay(dayId: string) {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    if (hasDoneSets(session) && !confirm('Des sets sont déjà validés. Remplacer quand même les exercices par ceux de ce jour ?')) return;
    await mutate(session.id, (s) => {
      s.dayId = day.id;
      s.dayName = day.name;
      s.exercises = day.items.map(fromItem);
    });
  }

  async function finish() {
    if (!hasDoneSets(session)) {
      if (!confirm('Aucun set validé : abandonner cette séance ?')) return;
      await db.sessions.delete(session.id);
      timer.stop();
      return;
    }
    const left = totalCount - doneCount;
    if (left > 0 && !confirm(`Il reste ${left} set(s) non validé(s). Terminer quand même ?`)) return;
    await mutate(session.id, (s) => {
      s.endedAt = Date.now();
    });
    timer.stop();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          className="input flex-1 text-lg font-bold"
          value={session.dayId ?? ''}
          onChange={(e) => changeDay(e.target.value)}
          aria-label="Jour du programme"
        >
          {days.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="chip whitespace-nowrap">
          {doneCount}/{totalCount} sets
        </span>
      </div>

      {session.exercises.map((se, i) => (
        <ExerciseCard key={se.id} index={i} session={session} se={se} sessions={sessions} library={library} exMap={exMap} ctx={ctx} />
      ))}

      <button className="btn-ghost w-full" onClick={() => setAdding(true)}>
        + Ajouter un exercice (ponctuel)
      </button>

      <div className="card">
        <button className="flex w-full items-center justify-between" onClick={() => setNoteOpen(!noteOpen)}>
          <span className="font-semibold">Note de séance</span>
          <span className="text-mute text-sm">{session.note ? '✎' : '+'}</span>
        </button>
        {(noteOpen || session.note) && (
          <textarea
            className="input mt-2 py-2"
            rows={2}
            defaultValue={session.note}
            placeholder="Énergie, sommeil, douleur…"
            onBlur={(e) => mutate(session.id, (s) => void (s.note = e.target.value))}
          />
        )}
      </div>

      <button className="btn-primary w-full text-lg" onClick={finish}>
        Terminer la séance
      </button>

      <ExercisePicker
        open={adding}
        onClose={() => setAdding(false)}
        exercises={library}
        title="Ajouter un exercice"
        onPick={async (ex) => {
          setAdding(false);
          await mutate(session.id, (s) => {
            s.exercises.push({
              id: uid(),
              exerciseId: ex.id,
              swappedFromId: null,
              programItemId: null,
              repMin: 8,
              repMax: 12,
              rirTarget: 1,
              restSec: null,
              skipped: false,
              note: '',
              sets: [emptySet(), emptySet(), emptySet()]
            });
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- carte exercice

function ExerciseCard({
  index,
  session,
  se,
  sessions,
  library,
  exMap,
  ctx
}: {
  index: number;
  session: Session;
  se: SessionExercise;
  sessions: Session[];
  library: Exercise[];
  exMap: Map<string, Exercise>;
  ctx: EngineContext;
}) {
  const ex = exMap.get(se.exerciseId);
  const [menu, setMenu] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const p = ctx.settings.engine;

  const history = useMemo(() => exerciseHistory(sessions, se.exerciseId, session.id), [sessions, se.exerciseId, session.id]);
  const rate = useMemo(() => (ex ? expectedRate(ex, history, ctx) : null), [ex, history, ctx.settings, ctx.bodyweights]); // eslint-disable-line react-hooks/exhaustive-deps
  const targets = useMemo(
    () => (ex && rate ? sessionTargets(ex, { sets: se.sets.length, repMin: se.repMin, repMax: se.repMax, rirTarget: se.rirTarget }, history, rate.rate, session.startedAt, p) : []),
    [ex, rate, history, se.sets.length, se.repMin, se.repMax, se.rirTarget, session.startedAt, p]
  );
  const status = useMemo(() => (rate ? exerciseStatus(history, rate.rate, se.rirTarget, p) : null), [history, rate, se.rirTarget, p]);
  const proj = useMemo(() => (ex && rate ? projections(ex, se, history, rate.rate, Date.now()).slice(0, 1) : []), [ex, rate, history, se]);

  if (!ex) return <div className="card text-mute">Exercice supprimé de la bibliothèque.</div>;
  const last = history[history.length - 1];
  const bestE1rm = Math.max(0, ...history.map((h) => h.bestE1rm));
  const allDone = se.sets.length > 0 && se.sets.every((s) => s.done);
  const swappedFrom = se.swappedFromId ? exMap.get(se.swappedFromId) : null;

  return (
    <section className={`card ${se.skipped ? 'opacity-50' : ''} ${allDone ? 'border-good/50' : ''}`}>
      <header className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setCollapsed(!collapsed)}>
          <div className="text-xs text-mute">
            {index + 1}. {ex.primaryMuscle} · {se.repMin}–{se.repMax} reps · {se.rirTarget} RIR
          </div>
          <h3 className="text-lg font-bold leading-tight">
            {allDone && '✓ '}
            {ex.name}
          </h3>
          {swappedFrom && <div className="text-xs text-warn">Swap ponctuel — remplace {swappedFrom.name}</div>}
        </button>
        {status && status.kind !== 'insufficient' && (
          <span className={`chip ${STATUS_STYLE[status.kind].color}`}>
            {STATUS_STYLE[status.kind].icon} {status.label}
          </span>
        )}
        <button className="btn-ghost btn-sm w-11" onClick={() => setMenu(true)} aria-label="Options de l'exercice">
          ⋯
        </button>
      </header>

      {ex.setupNotes && <p className="mt-1 rounded-lg bg-bg px-2 py-1 text-sm text-mute">⚙ {ex.setupNotes}</p>}
      {se.note && <p className="mt-1 text-sm text-mute">📝 {se.note}</p>}

      {!collapsed && !se.skipped && (
        <>
          {rate && (
            <div className="mt-2 text-xs text-mute">
              Rythme visé : {fmt(rate.rate, 2)} %/sem
              {proj[0] && <> · {proj[0].text}</>}
              <Why lines={[...rate.why, ...(proj[0]?.why ?? []), ...(status ? [...status.why, ...status.advice] : [])]} label="Pourquoi ce rythme ?" />
            </div>
          )}
          <div className="mt-2 space-y-2">
            {se.sets.map((set, i) => (
              <SetRow
                key={set.id}
                n={i + 1}
                set={set}
                ex={ex}
                se={se}
                session={session}
                target={targets[i]}
                lastSet={last?.sets[i]}
                lastDate={last?.date}
                bestE1rm={bestE1rm}
                ctx={ctx}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="btn-ghost btn-sm flex-1"
              onClick={() => mutate(session.id, (s) => s.exercises.find((x) => x.id === se.id)?.sets.push(emptySet()))}
            >
              + Set
            </button>
            <button
              className="btn-ghost btn-sm flex-1"
              disabled={se.sets.length === 0}
              onClick={() =>
                mutate(session.id, (s) => {
                  const x = s.exercises.find((y) => y.id === se.id);
                  if (!x) return;
                  const i = x.sets.map((z) => z.done).lastIndexOf(false);
                  x.sets.splice(i >= 0 ? i : x.sets.length - 1, 1);
                })
              }
            >
              − Set
            </button>
          </div>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.name}>
        <div className="space-y-2">
          <button className="btn-ghost w-full" onClick={() => (setMenu(false), setSwapping(true))}>
            🔄 Swap ponctuel (machine prise)
          </button>
          {se.swappedFromId && (
            <button
              className="btn-ghost w-full"
              onClick={() => {
                setMenu(false);
                mutate(session.id, (s) => {
                  const x = s.exercises.find((y) => y.id === se.id)!;
                  x.exerciseId = x.swappedFromId!;
                  x.swappedFromId = null;
                });
              }}
            >
              ↩ Revenir à {swappedFrom?.name}
            </button>
          )}
          <button
            className="btn-ghost w-full"
            onClick={() => {
              setMenu(false);
              mutate(session.id, (s) => {
                const x = s.exercises.find((y) => y.id === se.id)!;
                x.skipped = !x.skipped;
              });
            }}
          >
            {se.skipped ? '▶ Reprendre cet exercice' : '⏭ Sauter cet exercice'}
          </button>
          <button
            className="btn-ghost w-full"
            onClick={() => {
              const note = prompt('Note pour cet exercice', se.note);
              setMenu(false);
              if (note != null) mutate(session.id, (s) => void (s.exercises.find((y) => y.id === se.id)!.note = note));
            }}
          >
            📝 Note d'exercice
          </button>
          <button
            className="btn-ghost w-full"
            onClick={() => {
              const n = prompt('Réglages machine (enregistrés dans la bibliothèque)', ex.setupNotes);
              setMenu(false);
              if (n != null) db.exercises.update(ex.id, { setupNotes: n });
            }}
          >
            ⚙ Réglages machine
          </button>
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              disabled={index === 0}
              onClick={() => mutate(session.id, (s) => void s.exercises.splice(index - 1, 0, ...s.exercises.splice(index, 1)))}
            >
              ↑ Monter
            </button>
            <button
              className="btn-ghost flex-1"
              disabled={index === session.exercises.length - 1}
              onClick={() => mutate(session.id, (s) => void s.exercises.splice(index + 1, 0, ...s.exercises.splice(index, 1)))}
            >
              ↓ Descendre
            </button>
          </div>
          {!se.programItemId && (
            <button
              className="btn-ghost w-full text-bad"
              onClick={() => {
                setMenu(false);
                mutate(session.id, (s) => void (s.exercises = s.exercises.filter((y) => y.id !== se.id)));
              }}
            >
              Retirer de la séance
            </button>
          )}
          <a className="btn-ghost w-full" href={`#/progres/${ex.id}`}>
            📈 Voir la progression
          </a>
        </div>
      </Sheet>

      <ExercisePicker
        open={swapping}
        onClose={() => setSwapping(false)}
        exercises={library}
        excludeId={se.exerciseId}
        preferMuscle={ex.primaryMuscle}
        title="Swap ponctuel"
        onPick={(n) => {
          setSwapping(false);
          mutate(session.id, (s) => {
            const x = s.exercises.find((y) => y.id === se.id)!;
            x.swappedFromId = x.swappedFromId ?? x.exerciseId;
            if (n.id === x.swappedFromId) x.swappedFromId = null;
            x.exerciseId = n.id;
            x.sets = x.sets.map((z) => (z.done ? z : emptySet()));
          });
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------- ligne de set

const RIR_OPTS = [0, 1, 2, 3, 4].map((v) => ({ value: v, label: v === 4 ? '4+' : String(v) }));

function SetRow({
  n,
  set,
  ex,
  se,
  session,
  target,
  lastSet,
  lastDate,
  bestE1rm,
  ctx
}: {
  n: number;
  set: SetLog;
  ex: Exercise;
  se: SessionExercise;
  session: Session;
  target: SetTarget | undefined;
  lastSet: ExerciseSession['sets'][number] | undefined;
  lastDate: number | undefined;
  bestE1rm: number;
  ctx: EngineContext;
}) {
  const plate = ex.unit === 'kg' ? ctx.settings.plateKg : ctx.settings.plateLb;
  const plateOpts = { plate, loadMode: ex.loadMode, baseWeight: ex.baseWeight };
  const init = () => ({
    load: set.notation || (set.weight ?? target?.weight)?.toString() || '',
    reps: (set.reps ?? target?.reps)?.toString() ?? '',
    rir: set.rir ?? se.rirTarget
  });
  const [form, setForm] = useState(init);
  const [noteOpen, setNoteOpen] = useState(false);
  const dirty = useRef(false);

  // Pré-remplissage avec la cible tant que l'utilisateur n'a rien touché.
  useEffect(() => {
    if (!dirty.current && !set.done) setForm(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.weight, target?.reps, set.done, set.weight, set.reps, set.notation]);

  const parsed = parseLoad(form.load, plateOpts);
  const reps = parseFloat(form.reps.replace(',', '.'));
  const valid = parsed != null && parsed.total > 0 && isFinite(reps) && reps > 0;
  const curE1rm = valid ? epley(parsed.total, reps, rirForCalc(form.rir)) : 0;
  const isPR = set.done && set.weight && set.reps ? epley(set.weight, set.reps, rirForCalc(set.rir)) > bestE1rm && bestE1rm > 0 : false;

  async function validate() {
    if (set.done) {
      // second tap : on rouvre le set pour le corriger
      await mutate(session.id, (s) => {
        const x = s.exercises.find((y) => y.id === se.id)?.sets.find((y) => y.id === set.id);
        if (x) x.done = false;
      });
      return;
    }
    if (!valid || !parsed) return;
    unlockAudio();
    const now = Date.now();
    await mutate(session.id, (s) => {
      const x = s.exercises.find((y) => y.id === se.id)?.sets.find((y) => y.id === set.id);
      if (!x) return;
      x.weight = parsed.total;
      x.notation = parsed.usedPlates ? form.load.trim() : '';
      x.reps = reps;
      x.rir = form.rir;
      x.done = true;
      if (x.completedAt == null) {
        x.restTakenSec = restBefore(s, now);
        x.completedAt = now;
      }
      x.target = target ? { weight: target.weight, reps: target.reps } : null;
    });
    dirty.current = false;
    timer.start(restFor(se, ex, ctx.settings.defaultRestSec), ex.name);
  }

  const edit = (patch: Partial<typeof form>) => {
    dirty.current = true;
    setForm({ ...form, ...patch });
  };

  const targetNotation = target?.weight ? toPlateNotation(target.weight, plateOpts) : null;

  return (
    <div className={`rounded-xl border p-2 ${set.done ? 'border-good/40 bg-good/5' : 'border-line bg-bg/50'}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-sm">Set {n}</span>
        <span className="text-mute truncate">
          {lastSet ? `Dernière fois : ${fmt(lastSet.weight)} × ${fmt(lastSet.reps)} @ ${lastSet.rir === 4 ? '4+' : lastSet.rir} RIR` : 'Pas d’historique'}
        </span>
      </div>
      {target && (
        <div className="text-xs">
          <span className="text-accent font-semibold">
            Cible : {target.weight != null ? `${fmt(target.weight)} × ${fmt(target.reps)}` : 'à découvrir'}
          </span>
          {targetNotation && <span className="text-mute"> ({targetNotation})</span>}
          <Why lines={[...target.why, ...(lastDate ? [] : [])]} />
        </div>
      )}
      {set.done ? (
        <button className="mt-1 flex w-full items-center justify-between min-h-[48px]" onClick={validate} aria-label="Modifier le set">
          <span className="text-lg font-bold tabular-nums">
            {fmt(set.weight)} {ex.unit} × {fmt(set.reps)} <span className="text-mute text-sm">@ {set.rir === 4 ? '4+' : set.rir} RIR</span>
          </span>
          <span className="text-xs text-mute text-right">
            {isPR && <span className="mr-1 text-warn font-bold">🏆 Record</span>}
            {set.notation && <div>{set.notation}</div>}
            {set.restTakenSec != null && <div>repos {fmtClock(set.restTakenSec)}</div>}
          </span>
        </button>
      ) : (
        <div className="mt-1 space-y-2">
          <div className="flex gap-2">
            <div className="flex-[3]">
              <input
                className="input text-lg font-semibold"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                placeholder={`Charge (${ex.unit}) ou « 2 plates + 25 »`}
                value={form.load}
                onChange={(e) => edit({ load: e.target.value })}
                aria-label="Charge"
              />
            </div>
            <div className="flex-[2]">
              <input
                className="input text-lg font-semibold"
                inputMode="decimal"
                placeholder="Reps"
                value={form.reps}
                onChange={(e) => edit({ reps: e.target.value })}
                aria-label="Répétitions"
              />
            </div>
          </div>
          {parsed?.usedPlates && (
            <div className="text-xs text-mute">
              {form.load} → <b className="text-ink">{fmt(parsed.total)} {ex.unit}</b> ({parsed.explain})
            </div>
          )}
          {form.load && !parsed && <div className="text-xs text-bad">Format non reconnu (ex. « 185 », « 2 plates + 25 »)</div>}
          <div className="flex items-center gap-2">
            <span className="text-xs text-mute w-8">RIR</span>
            <div className="flex-1">
              <Segmented value={form.rir} onChange={(rir) => edit({ rir })} options={RIR_OPTS} size="lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setNoteOpen(!noteOpen)} aria-label="Note du set">
              📝
            </button>
            <button className="btn-primary flex-1 text-lg" disabled={!valid} onClick={validate}>
              ✓ Valider{valid && curE1rm > bestE1rm && bestE1rm > 0 ? ' 🏆' : ''}
            </button>
          </div>
        </div>
      )}
      {(noteOpen || set.note) && (
        <input
          className="input mt-2 text-sm"
          placeholder="Note du set (douleur, tempo, partielles…)"
          defaultValue={set.note}
          onBlur={(e) =>
            mutate(session.id, (s) => {
              const x = s.exercises.find((y) => y.id === se.id)?.sets.find((y) => y.id === set.id);
              if (x) x.note = e.target.value;
            })
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bilan

function Summary({
  session,
  sessions,
  exMap,
  settings,
  onNew
}: {
  session: Session;
  sessions: Session[];
  exMap: Map<string, Exercise>;
  settings: Settings;
  onNew: () => void;
}) {
  const bodyweights = useBodyweights() ?? [];
  const ctx: EngineContext = { settings, bodyweights, now: Date.now() };
  const dur = session.endedAt ? (session.endedAt - session.startedAt) / 60000 : 0;
  const rows = session.exercises
    .filter((e) => !e.skipped && e.sets.some((s) => s.done))
    .map((se) => {
      const ex = exMap.get(se.exerciseId);
      if (!ex) return null;
      const h = exerciseHistory(sessions, ex.id);
      const rate = expectedRate(ex, h, ctx).rate;
      const st = exerciseStatus(h, rate, se.rirTarget, settings.engine);
      const cur = h.find((x) => x.sessionId === session.id);
      return { se, ex, st, cur };
    })
    .filter(Boolean) as { se: SessionExercise; ex: Exercise; st: ReturnType<typeof exerciseStatus>; cur?: ExerciseSession }[];
  return (
    <div className="space-y-3">
      <div className="card">
        <div className="text-sm text-mute">{fmtDate(session.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h2 className="text-2xl font-bold">✓ {session.dayName} terminée</h2>
        <div className="text-mute">{fmt(dur, 0)} min</div>
      </div>
      {rows.map(({ ex, st, cur }) => (
        <div key={ex.id} className="card">
          <div className="flex items-center justify-between gap-2">
            <a href={`#/progres/${ex.id}`} className="font-semibold">
              {ex.name}
            </a>
            <span className={`chip ${STATUS_STYLE[st.kind].color}`}>
              {STATUS_STYLE[st.kind].icon} {st.label}
            </span>
          </div>
          {cur && (
            <div className="text-sm text-mute">
              Meilleur set {fmt(cur.bestSet.weight)} × {fmt(cur.bestSet.reps)} @ {cur.bestSet.rir} · 1RM est. {fmt(cur.bestE1rm)} {ex.unit}
              {cur.isE1rmPR && <span className="ml-1 font-bold text-warn">🏆 Record</span>}
            </div>
          )}
          {st.advice.map((a, i) => (
            <p key={i} className="mt-1 text-sm">
              💡 {a}
            </p>
          ))}
          <Why lines={st.why} />
        </div>
      ))}
      <button className="btn-ghost w-full" onClick={onNew}>
        Démarrer une autre séance
      </button>
    </div>
  );
}
