import { useEffect, useMemo, useRef, useState } from 'react';
import { db, usesPlates } from '../../db';
import { ExercisePicker } from '../../components/ExercisePicker';
import { StatusBadge } from '../../components/StatusBadge';
import { rirForCalc } from '../../lib/e1rm';
import {
  deltaVsLast,
  detectPRs,
  exerciseHistory,
  exerciseRecords,
  exerciseStatus,
  expectedRate,
  isDone,
  projections,
  sessionTargets,
  targetLabel,
  toDoneSet,
  warmupSets,
  withSets,
  type DoneSet,
  type EngineContext
} from '../../lib/engine';
import { plateNotation, splitPlates } from '../../lib/plates';
import { emptySet, mutateSession, restFor } from '../../lib/session';
import { ago, fmt, fmtClock, fmtDay, plural, rirLabel } from '../../lib/util';
import type { Exercise, Session, SessionExercise, SetLog } from '../../types';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Check,
  ChevronDown,
  Ellipsis,
  Flame,
  History as HistoryIcon,
  Minus,
  NotebookPen,
  Plus,
  SkipForward,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Undo2,
  Wrench
} from '../../ui/icons';
import { ListRow, RestPicker, SetDots, Toggle, WhyList, cx } from '../../ui/kit';
import { Sheet, dialog } from '../../ui/overlay';
import { SetEditor } from './SetEditor';

const DELTA_TONE = { good: 'tone-good', mute: 'tone-mute', bad: 'tone-bad' } as const;

export function ExerciseCard({
  index,
  count,
  session,
  se,
  sessions,
  library,
  exMap,
  ctx,
  open,
  onToggle,
  onCompleted,
  firstForMuscle,
  nextExerciseName,
  visible
}: {
  index: number;
  count: number;
  session: Session;
  se: SessionExercise;
  sessions: Session[];
  library: Exercise[];
  exMap: Map<string, Exercise>;
  ctx: EngineContext;
  open: boolean;
  onToggle: () => void;
  /** Tous les sets sont validés : la séance passe à l'exercice suivant. */
  onCompleted: () => void;
  firstForMuscle: boolean;
  nextExerciseName: string | null;
  visible: boolean;
}) {
  const ex = exMap.get(se.exerciseId);
  const p = ctx.settings.engine;
  const [sheet, setSheet] = useState<null | 'menu' | 'rest' | 'swap' | 'history' | 'warmup' | 'insight'>(null);
  const [restKeep, setRestKeep] = useState(true);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLLIElement>(null);

  const history = useMemo(() => exerciseHistory(sessions, se.exerciseId, { excludeSessionId: session.id }), [sessions, se.exerciseId, session.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rate = useMemo(() => (ex ? expectedRate(ex, history, ctx) : null), [ex, history, ctx.settings, ctx.bodyweights]);
  const doneToday = useMemo<(DoneSet | null)[]>(() => se.sets.map((s) => (isDone(s) ? toDoneSet(s) : null)), [se.sets]);
  const targets = useMemo(
    () =>
      ex && rate
        ? sessionTargets(ex, { sets: se.sets.length, repMin: se.repMin, repMax: se.repMax, rirTarget: se.rirTarget }, history, rate.rate, session.startedAt, p, {
            done: doneToday,
            deload: !!session.deload
          })
        : [],
    [ex, rate, history, se.sets.length, se.repMin, se.repMax, se.rirTarget, session.startedAt, session.deload, p, doneToday]
  );
  const status = useMemo(() => (rate ? exerciseStatus(history, rate.rate, se.rirTarget, p) : null), [history, rate, se.rirTarget, p]);
  const proj = useMemo(() => (ex && rate ? projections(ex, se, history, rate.rate, ctx.now) : []), [ex, rate, history, se, ctx.now]);
  const records = useMemo(() => exerciseRecords(history), [history]);

  const doneCount = se.sets.filter((s) => s.done).length;
  const allDone = se.sets.length > 0 && doneCount === se.sets.length;
  const firstUndone = se.sets.find((s) => !s.done);
  const activeId = se.sets.some((s) => s.id === activeSetId && !s.done) ? activeSetId : (firstUndone?.id ?? null);

  // Garde le set en cours à l'écran quand il change (après une validation).
  const prevActive = useRef(activeId);
  useEffect(() => {
    if (open && visible && activeId && prevActive.current && prevActive.current !== activeId) {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    prevActive.current = activeId;
  }, [activeId, open, visible]);

  if (!ex) {
    return (
      <section className="card flex items-center justify-between gap-3 p-4 text-sm text-mute">
        Exercice supprimé de la bibliothèque.
        <button className="btn btn-danger btn-sm" onClick={() => mutateSession(session, (s) => void (s.exercises = s.exercises.filter((y) => y.id !== se.id)))}>
          Retirer
        </button>
      </section>
    );
  }

  const last = history[history.length - 1];
  const swappedFrom = se.swappedFromId ? exMap.get(se.swappedFromId) : null;
  const rest = restFor(se, ex, ctx.settings.defaultRestSec);
  const plates = usesPlates(ex);
  const plateOpts = { plate: ex.unit === 'kg' ? ctx.settings.plateKg : ctx.settings.plateLb, loadMode: ex.loadMode, baseWeight: ex.baseWeight };
  const nextTarget = targets[se.sets.findIndex((s) => !s.done)];
  const update = (fn: (x: SessionExercise, s: Session) => void) =>
    mutateSession(session, (s) => {
      const x = s.exercises.find((y) => y.id === se.id);
      if (x) fn(x, s);
    });
  const close = () => setSheet(null);

  const recordsBefore = (i: number) => withSets(records, doneToday.slice(0, i).filter((d): d is DoneSet => !!d));

  /** Ce qui vient après le set i, pour le minuteur : « set 2 sur 3 · T-bar row », l'exercice suivant, ou rien. */
  const nextLabelFor = (i: number) => {
    const k = se.sets.findIndex((s, j) => !s.done && j !== i);
    if (k >= 0) return `set ${k + 1} sur ${se.sets.length} · ${ex.name}`;
    return nextExerciseName ?? '';
  };

  const warm = warmupSets(ex, targets[0]?.weight ?? last?.sets[0]?.weight ?? null, firstForMuscle);

  // ------------------------------------------------------------ carte repliée
  if (!open) {
    return (
      <section ref={rootRef} className={cx('card scroll-mt-4 transition', se.skipped && 'opacity-50')}>
        <button className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left" onClick={onToggle} aria-expanded={false}>
          <span
            className={cx(
              'num flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              allDone ? 'bg-good/15 text-good' : 'bg-raised text-mute'
            )}
          >
            {allDone ? <Check size={18} strokeWidth={2.8} /> : index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold">{ex.name}</span>
            <span className="num block truncate text-xs text-faint">
              {se.skipped ? (
                'Sauté'
              ) : allDone ? (
                se.sets.map((s) => `${fmt(s.weight)}×${fmt(s.reps)}`).join(' · ')
              ) : (
                <>
                  {se.sets.length} × {se.repMin}–{se.repMax}
                  {targetLabel(nextTarget) && <span className="text-accent"> · cible {targetLabel(nextTarget)}</span>}
                </>
              )}
            </span>
          </span>
          {!se.skipped && !allDone && <SetDots done={doneCount} total={se.sets.length} />}
          <ChevronDown size={18} className="shrink-0 text-faint" />
        </button>
      </section>
    );
  }

  // ------------------------------------------------------------ carte ouverte
  return (
    <section ref={rootRef} className={cx('card scroll-mt-4 p-4', allDone && 'border-good/40')}>
      <header className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} aria-expanded>
          <div className="eyebrow">
            {index + 1} / {count} · {ex.primaryMuscle}
          </div>
          <h3 className="title-lg mt-0.5 break-words">{ex.name}</h3>
          {swappedFrom && <div className="mt-0.5 text-xs font-medium text-warn">Swap ponctuel · remplace {swappedFrom.name}</div>}
        </button>
        <button className="btn btn-icon btn-secondary rounded-full" onClick={() => setSheet('menu')} aria-label="Options de l'exercice">
          <Ellipsis size={20} />
        </button>
      </header>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="chip num">
          {se.sets.length} × {se.repMin}–{se.repMax}
        </span>
        <span className="chip num">{session.deload ? `${Math.min(4, se.rirTarget + p.deloadRirBonus)} RIR · décharge` : `${se.rirTarget} RIR`}</span>
        <button className="chip num text-ink active:bg-hover" onClick={() => setSheet('rest')} aria-label={`Repos ${fmtClock(rest)}, toucher pour modifier`}>
          <Timer size={13} className="text-accent" /> {fmtClock(rest)}
        </button>
        {status && status.kind !== 'insufficient' && (
          <button onClick={() => setSheet('insight')} aria-label="Analyse de l'exercice">
            <StatusBadge kind={status.kind} />
          </button>
        )}
      </div>

      {ex.setupNotes && (
        <p className="inset mt-2.5 flex gap-2 px-3 py-2 text-[13px] text-mute">
          <Wrench size={15} className="mt-0.5 shrink-0 text-faint" />
          {ex.setupNotes}
        </p>
      )}
      {se.note && (
        <p className="mt-2 flex gap-2 px-1 text-[13px] text-mute">
          <NotebookPen size={15} className="mt-0.5 shrink-0 text-faint" />
          {se.note}
        </p>
      )}

      {se.skipped ? (
        <button className="btn btn-secondary mt-3 w-full" onClick={() => update((x) => void (x.skipped = false))}>
          Reprendre cet exercice
        </button>
      ) : (
        <>
          {warm.length > 0 && doneCount === 0 && (
            <button className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-warn/10 px-3 py-2.5 text-left text-[13px] text-warn" onClick={() => setSheet('warmup')}>
              <Flame size={16} className="shrink-0" />
              <span className="num min-w-0 flex-1 truncate">Échauffement : {warm.map((w) => `${fmt(w.weight)} × ${w.reps}`).join(' → ')}</span>
            </button>
          )}

          <ol className="mt-3 space-y-2">
            {se.sets.map((set, i) => {
              const lastSet = last ? last.sets[i] : undefined;
              if (set.id === activeId) {
                return (
                  <li key={set.id} ref={editorRef} className="scroll-mt-24">
                    <SetEditor
                      session={session}
                      se={se}
                      set={set}
                      index={i}
                      total={se.sets.length}
                      ex={ex}
                      target={targets[i]}
                      lastSet={lastSet}
                      records={recordsBefore(i)}
                      settings={ctx.settings}
                      nextLabel={nextLabelFor(i)}
                      onValidated={() => {
                        setActiveSetId(null);
                        if (se.sets.every((s) => s.done || s.id === set.id)) onCompleted();
                      }}
                    />
                  </li>
                );
              }
              if (set.done && isDone(set)) return <DoneRow key={set.id} set={set} n={i + 1} ex={ex} lastSet={lastSet} prs={detectPRs({ weight: set.weight!, reps: set.reps!, rir: rirForCalc(set.rir) }, recordsBefore(i))} onEdit={async () => {
                await update((x) => {
                  const y = x.sets.find((z) => z.id === set.id);
                  if (y) y.done = false;
                });
                setActiveSetId(set.id);
              }} />;
              const t = targets[i];
              return (
                <li key={set.id}>
                  <button className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-dashed border-line px-3 text-left active:bg-raised/60" onClick={() => setActiveSetId(set.id)}>
                    <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-faint">{i + 1}</span>
                    <span className="num min-w-0 flex-1 truncate text-sm text-mute">
                      {targetLabel(t) ? (
                        <>
                          Cible <span className="font-semibold text-ink">{targetLabel(t)}</span> @ {rirLabel(t.rir)}
                        </>
                      ) : (
                        'À découvrir'
                      )}
                    </span>
                    {t && t.kind !== 'first' && t.kind !== 'match' && <span className="chip tone-mute">{t.tag}</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-3 flex items-center gap-2">
            <button className="btn btn-secondary btn-sm flex-1" onClick={() => update((x) => void x.sets.push(emptySet()))}>
              <Plus size={16} /> Set
            </button>
            <button
              className="btn btn-secondary btn-sm flex-1"
              disabled={se.sets.length <= 1 || !firstUndone}
              onClick={() =>
                update((x) => {
                  const i = x.sets.map((z) => z.done).lastIndexOf(false);
                  if (i >= 0 && x.sets.length > 1) x.sets.splice(i, 1);
                })
              }
            >
              <Minus size={16} /> Set
            </button>
            <button className="btn btn-secondary btn-sm flex-1" onClick={() => setSheet('history')}>
              <HistoryIcon size={16} /> Historique
            </button>
          </div>

          {rate && proj[0] && (
            <button className="mt-3 flex w-full items-center gap-2 px-1 text-left text-xs text-faint" onClick={() => setSheet('insight')}>
              <TrendingUp size={14} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">{proj[0].text}</span>
            </button>
          )}
        </>
      )}

      {/* ------------------------------------------------------ panneaux */}
      <Sheet open={sheet === 'menu'} onClose={close} title={ex.name} subtitle={ex.primaryMuscle}>
        <div className="card divide-y divide-line/60 overflow-hidden">
          <ListRow icon={<ArrowLeftRight size={18} />} title="Swap ponctuel" subtitle="Machine prise : remplace juste pour aujourd’hui" onClick={() => setSheet('swap')} />
          {se.swappedFromId && (
            <ListRow
              icon={<Undo2 size={18} />}
              title={`Revenir à ${swappedFrom?.name ?? 'l’exercice prévu'}`}
              onClick={() => {
                close();
                update((x) => {
                  x.exerciseId = x.swappedFromId!;
                  x.swappedFromId = null;
                });
              }}
            />
          )}
          <ListRow
            icon={<SkipForward size={18} />}
            iconTone="mute"
            title={se.skipped ? 'Reprendre cet exercice' : 'Sauter cet exercice'}
            onClick={() => {
              close();
              update((x) => void (x.skipped = !x.skipped));
              if (!se.skipped) onCompleted();
            }}
          />
          <ListRow icon={<Flame size={18} />} iconTone="warn" title="Échauffement" subtitle="Sets de montée en charge suggérés" onClick={() => setSheet('warmup')} />
          <ListRow icon={<HistoryIcon size={18} />} title="Historique" subtitle={last ? `Dernière fois ${ago(last.date)}` : 'Jamais fait'} onClick={() => setSheet('history')} />
          <ListRow icon={<Timer size={18} />} title="Temps de repos" value={fmtClock(rest)} onClick={() => setSheet('rest')} />
          <ListRow
            icon={<NotebookPen size={18} />}
            iconTone="mute"
            title="Note pour aujourd’hui"
            subtitle={se.note || undefined}
            onClick={async () => {
              close();
              const note = await dialog.prompt({ title: 'Note pour cet exercice', initial: se.note, multiline: true, placeholder: 'Sensation, douleur, technique…' });
              if (note != null) update((x) => void (x.note = note));
            }}
          />
          <ListRow
            icon={<Wrench size={18} />}
            iconTone="mute"
            title="Réglages machine"
            subtitle={ex.setupNotes || 'Siège, poignées, hauteur…'}
            onClick={async () => {
              close();
              const n = await dialog.prompt({ title: 'Réglages machine', message: 'Enregistrés avec l’exercice et affichés à chaque séance.', initial: ex.setupNotes, multiline: true });
              if (n != null) db.exercises.update(ex.id, { setupNotes: n });
            }}
          />
          <ListRow icon={<TrendingUp size={18} />} title="Voir la progression" href={`#/progres/ex/${ex.id}`} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-secondary flex-1" disabled={index === 0} onClick={() => mutateSession(session, (s) => void s.exercises.splice(index - 1, 0, ...s.exercises.splice(index, 1)))}>
            <ArrowUp size={18} /> Monter
          </button>
          <button className="btn btn-secondary flex-1" disabled={index === count - 1} onClick={() => mutateSession(session, (s) => void s.exercises.splice(index + 1, 0, ...s.exercises.splice(index, 1)))}>
            <ArrowDown size={18} /> Descendre
          </button>
        </div>
        {!se.programItemId && (
          <button
            className="btn btn-danger mt-2 w-full"
            onClick={() => {
              close();
              mutateSession(session, (s) => void (s.exercises = s.exercises.filter((y) => y.id !== se.id)));
            }}
          >
            <Trash2 size={18} /> Retirer de la séance
          </button>
        )}
      </Sheet>

      <Sheet open={sheet === 'rest'} onClose={close} title="Temps de repos" subtitle={ex.name} closeLabel="OK">
        <RestPicker
          value={se.restSec}
          defaultSec={ex.restSec ?? ctx.settings.defaultRestSec}
          defaultLabel={ex.restSec != null ? 'repos de l’exercice' : 'repos global'}
          onChange={async (restSec) => {
            await update((x) => void (x.restSec = restSec));
            // Enregistré aussi dans le programme pour les prochaines séances.
            if (restKeep && se.programItemId && session.dayId) {
              const day = await db.days.get(session.dayId);
              if (day) await db.days.update(day.id, { items: day.items.map((it) => (it.id === se.programItemId ? { ...it, restSec } : it)) });
            }
          }}
        />
        {se.programItemId && (
          <div className="mt-3 border-t border-line/60 pt-1">
            <Toggle label="Garder pour les prochaines séances" checked={restKeep} onChange={setRestKeep} />
          </div>
        )}
      </Sheet>

      <ExercisePicker
        open={sheet === 'swap'}
        onClose={close}
        exercises={library}
        excludeId={se.exerciseId}
        preferMuscle={ex.primaryMuscle}
        title="Swap ponctuel"
        subtitle="Seulement pour aujourd’hui. Ton programme ne change pas."
        onPick={(n) => {
          close();
          update((x) => {
            x.swappedFromId = x.swappedFromId ?? x.exerciseId;
            if (n.id === x.swappedFromId) x.swappedFromId = null;
            x.exerciseId = n.id;
            x.sets = x.sets.map((z) => (z.done ? z : emptySet()));
          });
        }}
      />

      <Sheet open={sheet === 'history'} onClose={close} title="Historique" subtitle={ex.name}>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-mute">Tu n’as encore jamais enregistré cet exercice.</p>
        ) : (
          <ul className="space-y-2">
            {[...history]
              .reverse()
              .slice(0, 8)
              .map((h) => (
                <li key={h.sessionId} className="inset px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {fmtDay(h.date)} <span className="font-normal text-faint">· {ago(h.date)}</span>
                    </span>
                    <span className="num text-xs text-faint">
                      1RM est. {fmt(h.bestE1rm)}
                      {h.isE1rmPR && <Trophy size={12} className="ml-1 inline text-gold" />}
                    </span>
                  </div>
                  <div className="num mt-1 text-sm text-mute">{h.sets.map((s) => `${fmt(s.weight)} × ${fmt(s.reps)} @${rirLabel(s.rir)}`).join('   ')}</div>
                </li>
              ))}
          </ul>
        )}
        <a className="btn btn-tonal mt-3 w-full" href={`#/progres/ex/${ex.id}`}>
          <TrendingUp size={18} /> Voir les graphiques
        </a>
      </Sheet>

      <Sheet open={sheet === 'warmup'} onClose={close} title="Échauffement" subtitle={ex.name} closeLabel="Compris">
        {warm.length ? (
          <ol className="space-y-2">
            {warm.map((w, i) => {
              const sp = splitPlates(w.weight, plateOpts);
              const notation = plates ? plateNotation(sp.plates, sp.extra) : '';
              return (
                <li key={i} className="inset flex items-center gap-3 px-3.5 py-3">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warn/15 text-xs font-bold text-warn">{i + 1}</span>
                  <span className="num flex-1 text-[17px] font-bold">
                    {fmt(w.weight)} {ex.unit} × {w.reps}
                    {notation && <span className="ml-2 text-xs font-medium text-faint">{notation}</span>}
                  </span>
                  <span className="num text-xs text-faint">{Math.round(w.pct * 100)} %</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-mute">Fais d’abord un premier set : la suggestion s’appuie sur ta charge de travail.</p>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-faint">
          Sets légers, loin de l’échec : ils préparent l’articulation et le geste sans te fatiguer. Ils ne se notent pas et ne comptent pas dans ton volume.
          {!firstForMuscle && ' Ce muscle est déjà chaud : un seul set suffit.'}
        </p>
      </Sheet>

      <Sheet open={sheet === 'insight'} onClose={close} title="Analyse" subtitle={ex.name} closeLabel="Compris">
        {status && (
          <div className="mb-4">
            <StatusBadge kind={status.kind} />
            {status.advice.map((a, i) => (
              <p key={i} className="mt-2 text-[15px] leading-relaxed">
                {a}
              </p>
            ))}
          </div>
        )}
        {proj.length > 0 && (
          <div className="inset mb-4 space-y-1.5 px-3.5 py-3">
            {proj.map((pr, i) => (
              <p key={i} className="text-sm font-medium">
                {pr.text}
              </p>
            ))}
          </div>
        )}
        {rate && (
          <>
            <div className="eyebrow mb-2">
              Rythme visé : {fmt(rate.rate, 2)} % par semaine. Pourquoi ?
            </div>
            <WhyList lines={[...rate.why, ...(status?.why ?? [])]} />
          </>
        )}
      </Sheet>
    </section>
  );
}

function DoneRow({
  set,
  n,
  ex,
  lastSet,
  prs,
  onEdit
}: {
  set: SetLog;
  n: number;
  ex: Exercise;
  lastSet: DoneSet | undefined;
  prs: string[];
  onEdit: () => void;
}) {
  const delta = deltaVsLast({ weight: set.weight!, reps: set.reps!, rir: rirForCalc(set.rir) }, lastSet, ex.unit);
  return (
    <li>
      <button className={cx('flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-left active:opacity-80', prs.length ? 'gold-glow sheen bg-gold/10' : 'bg-good/10')} onClick={onEdit} aria-label={`Set ${n} validé, toucher pour corriger`}>
        <span className={cx('flex h-7 w-7 shrink-0 animate-pop items-center justify-center rounded-full', prs.length ? 'bg-gold text-black' : 'bg-good text-black')}>
          {prs.length ? <Trophy size={15} strokeWidth={2.4} /> : <Check size={16} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="num block text-[17px] font-bold leading-tight">
            {fmt(set.weight)} <span className="text-xs font-medium text-faint">{ex.unit}</span> × {fmt(set.reps)}
            <span className="ml-1.5 text-xs font-medium text-faint">@ {rirLabel(set.rir)}</span>
          </span>
          {(set.notation || set.restTakenSec != null || set.note) && (
            <span className="num block truncate text-[11px] text-faint">
              {[set.notation, set.restTakenSec != null && n > 1 ? `repos ${fmtClock(set.restTakenSec)}` : '', set.note].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        {prs.length > 0 && <span className="chip tone-gold">Record</span>}
        {delta && !prs.length && <span className={cx('chip', DELTA_TONE[delta.tone])}>{delta.text}</span>}
      </button>
    </li>
  );
}

/** Texte « 3 sets validés » pour les résumés. */
export const setsDoneLabel = (n: number) => `${n} ${plural(n, 'set')} ${plural(n, 'validé')}`;
