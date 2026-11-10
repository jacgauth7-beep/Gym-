import { useEffect, useRef, useState } from 'react';
import { usesPlates } from '../../db';
import { rirForCalc } from '../../lib/e1rm';
import { PR_LABEL, detectPRs, type DoneSet, type Records, type SetTarget } from '../../lib/engine';
import { joinPlates, plateNotation, splitPlates } from '../../lib/plates';
import { hasDoneSets, mutateSession, restBefore, restFor } from '../../lib/session';
import { timer, unlockAudio } from '../../lib/timer';
import { fmt, plural, rirLabel } from '../../lib/util';
import type { Exercise, Session, SessionExercise, SetLog, Settings } from '../../types';
import { Check, NotebookPen, Pencil, Trophy } from '../../ui/icons';
import { Segmented, Stepper, WhyButton, cx } from '../../ui/kit';
import { dialog, toast } from '../../ui/overlay';

const RIR_OPTS = [0, 1, 2, 3, 4].map((v) => ({ value: v, label: v === 4 ? '4+' : String(v) }));

export function lastSetLabel(s: DoneSet): string {
  const load = s.notation ? `${s.notation} (${fmt(s.weight)})` : fmt(s.weight);
  return `${load} × ${fmt(s.reps)} @ ${rirLabel(s.rir)} RIR`;
}

/** Éditeur du set en cours : tout se règle au pouce, sans clavier. Toucher une valeur permet de la taper. */
export function SetEditor({
  session,
  se,
  set,
  index,
  total,
  ex,
  target,
  lastSet,
  records,
  settings,
  nextLabel,
  onValidated
}: {
  session: Session;
  se: SessionExercise;
  set: SetLog;
  index: number;
  total: number;
  ex: Exercise;
  target: SetTarget | undefined;
  lastSet: DoneSet | undefined;
  records: Records;
  settings: Settings;
  /** Ce qui vient après ce set, affiché dans le minuteur. */
  nextLabel: string;
  onValidated: () => void;
}) {
  const plates = usesPlates(ex);
  const plate = ex.unit === 'kg' ? settings.plateKg : settings.plateLb;
  const plateOpts = { plate, loadMode: ex.loadMode, baseWeight: ex.baseWeight };
  const inc = ex.increment > 0 ? ex.increment : 1;

  const init = () => ({
    weight: set.weight ?? target?.weight ?? lastSet?.weight ?? null,
    reps: set.reps ?? target?.reps ?? null,
    rir: set.rir ?? target?.rir ?? se.rirTarget
  });
  const [form, setForm] = useState(init);
  const [noteOpen, setNoteOpen] = useState(!!set.note);
  const dirty = useRef(false);

  // Les champs suivent la cible (qui s'ajuste à ta forme du jour) tant que tu n'as rien modifié.
  useEffect(() => {
    if (!dirty.current) setForm(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.weight, target?.reps, target?.rir, set.weight, set.reps, set.rir]);

  const edit = (patch: Partial<typeof form>) => {
    dirty.current = true;
    setForm((f) => ({ ...f, ...patch }));
  };

  const { weight, reps, rir } = form;
  const valid = weight != null && weight > 0 && reps != null && reps > 0;
  const split = splitPlates(weight ?? 0, plateOpts);
  const extraStep = ex.loadMode === 'perSide' ? inc / 2 : inc;
  const setSplit = (n: number, extra: number) => {
    let p = Math.max(0, n);
    let e = extra;
    while (e >= plate - 1e-9) {
      e -= plate;
      p++;
    }
    while (e < -1e-9 && p > 0) {
      e += plate;
      p--;
    }
    edit({ weight: joinPlates(p, Math.max(0, Math.round(e * 100) / 100), plateOpts) });
  };
  const prs = valid ? detectPRs({ weight: weight!, reps: reps!, rir: rirForCalc(rir) }, records) : [];

  async function typeTotal() {
    const v = await dialog.prompt({
      title: `Charge totale (${ex.unit})`,
      message: ex.loadMode === 'perSide' ? 'Total des deux côtés, charge à vide comprise.' : undefined,
      initial: weight != null ? String(weight) : '',
      inputMode: 'decimal',
      confirmLabel: 'OK'
    });
    if (v == null) return;
    const n = parseFloat(v.replace(',', '.'));
    if (isFinite(n) && n > 0) edit({ weight: n });
  }

  async function validate() {
    if (!valid) return;
    unlockAudio();
    const now = Date.now();
    const first = set.completedAt == null;
    await mutateSession(session, (s) => {
      const x = s.exercises.find((y) => y.id === se.id)?.sets.find((y) => y.id === set.id);
      if (!x) return;
      // la durée de la séance part du premier set validé, pas de l'ouverture de l'app
      if (!hasDoneSets(s)) s.startedAt = now;
      x.weight = weight;
      x.notation = plates ? plateNotation(split.plates, split.extra) : '';
      x.reps = reps;
      x.rir = rir;
      x.done = true;
      if (x.completedAt == null) {
        x.restTakenSec = restBefore(s, now);
        x.completedAt = now;
      }
      x.target = target ? { weight: target.weight, reps: target.reps } : null;
    });
    dirty.current = false;
    if (prs.length) {
      toast(
        <span>
          <b>{PR_LABEL[prs[0]]}</b>
          <span className="text-mute">
            {' '}
            · {fmt(weight)} {ex.unit} × {fmt(reps)}
          </span>
        </span>,
        { tone: 'gold', icon: <Trophy size={18} className="shrink-0 text-gold" />, ms: 3500 }
      );
    }
    if (first) timer.start(restFor(se, ex, settings.defaultRestSec), ex.name, nextLabel);
    onValidated();
  }

  const targetText = target?.weight != null && target.reps != null ? `${fmt(target.weight)} × ${fmt(target.reps)}` : null;
  const targetNotation = plates && target?.weight != null ? plateNotation(splitPlates(target.weight, plateOpts).plates, splitPlates(target.weight, plateOpts).extra) : '';

  return (
    <div className="animate-rise rounded-[22px] border border-accent/40 bg-raised/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">
          Set {index + 1} <span className="font-medium text-faint">sur {total}</span>
        </span>
        {target && target.kind !== 'first' && <span className={cx('chip', target.kind === 'load-down' || target.kind === 'resume' || target.kind === 'deload' ? 'tone-mute' : 'tone-accent')}>{target.tag}</span>}
      </div>

      <dl className="mt-2 space-y-1 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-[86px] shrink-0 text-faint">Dernière fois</dt>
          <dd className="num min-w-0 text-mute">{lastSet ? lastSetLabel(lastSet) : 'Pas encore d’historique'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-[86px] shrink-0 text-faint">Cible</dt>
          <dd className="min-w-0 flex-1">
            {targetText ? (
              <span className="num font-bold text-accent">
                {targetText} <span className="font-medium">@ {rirLabel(target!.rir)} RIR</span>
              </span>
            ) : (
              <span className="text-mute">À découvrir aujourd’hui</span>
            )}
            {target && <WhyButton title="Pourquoi cette cible ?" lines={target.why} className="ml-2 align-middle" />}
            {targetText && (targetNotation || target!.failureReps != null) && (
              <span className="num block text-xs text-faint">
                {[targetNotation, target!.failureReps != null ? `≈ ${target!.failureReps} reps à l’échec` : ''].filter(Boolean).join(' · ')}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-3">
        {plates ? (
          <div>
            <div className="mb-1.5 flex items-end justify-between">
              <span className="eyebrow">Charge {ex.loadMode === 'perSide' ? '(par côté)' : ''}</span>
              <button className="num flex items-center gap-1.5 text-sm font-bold text-ink" onClick={typeTotal} aria-label="Saisir la charge totale">
                = {weight != null ? fmt(weight) : '–'} {ex.unit}
                <Pencil size={13} className="text-faint" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stepper
                ariaLabel="Plates"
                value={split.plates}
                onChange={(n) => setSplit(Math.round(n ?? 0), split.extra)}
                step={1}
                unit={plural(split.plates, 'plate')}
                format={(v) => String(v)}
              />
              <Stepper ariaLabel="Charge en plus des plates" value={split.extra} onChange={(e) => setSplit(split.plates, e ?? 0)} step={extraStep} min={split.plates > 0 ? -extraStep : 0} unit={`+ ${ex.unit}`} />
            </div>
          </div>
        ) : (
          <Stepper ariaLabel="Charge" label="Charge" value={weight} onChange={(v) => edit({ weight: v })} step={inc} unit={ex.unit} />
        )}

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Stepper ariaLabel="Répétitions" label="Reps" value={reps} onChange={(v) => edit({ reps: v })} step={1} unit={reps != null && reps % 1 ? 'dont une demie' : undefined} />
          </div>
          <button
            className={cx('btn h-[56px] w-[52px] px-0 text-base', reps != null && reps % 1 ? 'bg-accent text-white' : 'btn-secondary')}
            onClick={() => edit({ reps: reps == null ? 0.5 : reps % 1 ? Math.floor(reps) : reps + 0.5 })}
            aria-label="Demi-rep"
            aria-pressed={reps != null && reps % 1 !== 0}
          >
            ½
          </button>
        </div>

        <div>
          <div className="eyebrow mb-1.5">Reps en réserve (RIR)</div>
          <Segmented value={rir} onChange={(v) => edit({ rir: v })} options={RIR_OPTS} size="lg" ariaLabel="Reps en réserve" />
        </div>

        {noteOpen && (
          <input
            className="input text-sm"
            placeholder="Note du set (douleur, tempo, partielles…)"
            defaultValue={set.note}
            autoFocus={!set.note}
            onBlur={(e) => {
              const note = e.target.value;
              if (note === set.note) return;
              mutateSession(session, (s) => {
                const x = s.exercises.find((y) => y.id === se.id)?.sets.find((y) => y.id === set.id);
                if (x) x.note = note;
              });
            }}
          />
        )}

        <div className="flex gap-2">
          <button className={cx('btn w-[52px] px-0', noteOpen ? 'btn-tonal' : 'btn-secondary')} style={{ minHeight: 56 }} onClick={() => setNoteOpen(!noteOpen)} aria-label="Note du set">
            <NotebookPen size={20} />
          </button>
          <button className="btn btn-primary btn-lg flex-1" disabled={!valid} onClick={validate}>
            {prs.length ? <Trophy size={20} /> : <Check size={22} strokeWidth={2.6} />}
            {prs.length ? 'Valider le record' : 'Valider le set'}
          </button>
        </div>
      </div>
    </div>
  );
}
