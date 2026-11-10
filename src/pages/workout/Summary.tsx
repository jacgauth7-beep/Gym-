import { db } from '../../db';
import { exerciseHistory, isDone, type EngineContext, type ExerciseSession } from '../../lib/engine';
import { lastSessionOfDay, sessionStats } from '../../lib/session';
import { ago, fmt, fmtDate, fmtDuration, fmtSigned, plural, rirLabel } from '../../lib/util';
import type { Exercise, Session } from '../../types';
import { Check, ChevronRight, Plus, RotateCcw, Trophy } from '../../ui/icons';
import { SectionHeader, Stat, cx } from '../../ui/kit';

interface Row {
  ex: Exercise;
  cur: ExerciseSession;
  prev: ExerciseSession | undefined;
}

/** Bilan affiché juste après « Terminer la séance ». */
export function Summary({
  session,
  sessions,
  exMap,
  ctx,
  onNew
}: {
  session: Session;
  sessions: Session[];
  exMap: Map<string, Exercise>;
  ctx: EngineContext;
  onNew: () => void;
}) {
  const p = ctx.settings.engine;
  const stats = sessionStats(session, exMap, p.hardSetRir);
  const rows: Row[] = [];
  for (const se of session.exercises) {
    if (se.skipped || !se.sets.some(isDone)) continue;
    const ex = exMap.get(se.exerciseId);
    if (!ex || rows.some((r) => r.ex.id === ex.id)) continue;
    const all = exerciseHistory(sessions, ex.id, { includeDeload: true });
    const i = all.findIndex((h) => h.sessionId === session.id);
    if (i < 0) continue;
    rows.push({ ex, cur: all[i], prev: [...all.slice(0, i)].reverse().find((h) => !h.deload) });
  }
  const prs = rows.filter((r) => r.cur.isE1rmPR || r.cur.isWeightPR).length;
  const deltas = rows.filter((r) => r.prev).map((r) => (r.cur.bestE1rm / r.prev!.bestE1rm - 1) * 100);
  const up = deltas.filter((d) => d > 0.4).length;
  const down = deltas.filter((d) => d < -0.4).length;

  const previous = session.dayId ? lastSessionOfDay(sessions.filter((s) => s.id !== session.id && s.startedAt < session.startedAt && !s.deload), session.dayId) : undefined;
  const prevStats = previous ? sessionStats(previous, exMap, p.hardSetRir) : null;
  const volDelta = prevStats && prevStats.volumeLb > 0 ? (stats.volumeLb / prevStats.volumeLb - 1) * 100 : null;
  const canResume = session.endedAt != null && ctx.now - session.endedAt < 6 * 3600e3;

  let headline = 'Séance enregistrée.';
  if (session.deload) headline = 'Décharge faite. La fatigue retombe, tu repartiras plus fort.';
  else if (prs > 0) headline = `${prs} ${plural(prs, 'record')} ${plural(prs, 'battu')}. Belle séance.`;
  else if (deltas.length && up >= down && up > 0) headline = `${up} ${plural(up, 'exercice')} en hausse par rapport à la dernière fois.`;
  else if (deltas.length && down > up) headline = 'Séance un peu en dessous. Ça arrive : regarde ton sommeil et reviens frais.';
  else if (!deltas.length) headline = 'Première référence posée. La prochaine fois, tu auras des cibles.';

  return (
    <div className="animate-rise">
      <div className="card hero-glow overflow-hidden p-5">
        <div className="flex items-center gap-3">
          <span className="bg-brand flex h-12 w-12 shrink-0 animate-pop items-center justify-center rounded-2xl text-white shadow-lg shadow-accent/30">
            <Check size={26} strokeWidth={2.8} />
          </span>
          <div className="min-w-0">
            <div className="eyebrow">{fmtDate(session.startedAt, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <h1 className="title-lg truncate">{session.dayName}</h1>
          </div>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-mute">{headline}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Durée" value={fmtDuration(stats.durationMs)} />
          <Stat label="Sets durs" value={stats.hardSets} unit={`sur ${stats.sets}`} />
          <Stat label="Volume" value={fmt(stats.volumeLb / 1000, 1)} unit={`k lb${volDelta != null ? ` · ${fmtSigned(volDelta, 0)} %` : ''}`} />
          <Stat label="Records" value={prs} tone={prs ? 'gold' : undefined} />
        </div>
        {previous && <p className="mt-3 text-xs text-faint">Comparé à ta séance « {previous.dayName} » d’{ago(previous.startedAt).replace(/^il y a/, 'il y a')}.</p>}
      </div>

      <SectionHeader title="Exercice par exercice" />
      <div className="card divide-y divide-line/60 overflow-hidden">
        {rows.map(({ ex, cur, prev }) => {
          const d = prev ? (cur.bestE1rm / prev.bestE1rm - 1) * 100 : null;
          const pr = cur.isE1rmPR || cur.isWeightPR;
          return (
            <a key={ex.id} href={`#/progres/ex/${ex.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 active:bg-raised/60">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold">{ex.name}</span>
                  {pr && <Trophy size={14} className="shrink-0 text-gold" />}
                </span>
                <span className="num block truncate text-xs text-faint">
                  {cur.sets.map((s) => `${fmt(s.weight)}×${fmt(s.reps)}@${rirLabel(s.rir)}`).join('  ')}
                </span>
              </span>
              {d != null ? (
                <span className={cx('chip num', d > 0.4 ? 'tone-good' : d < -0.4 ? 'tone-bad' : 'tone-mute')}>{Math.abs(d) < 0.05 ? '=' : `${fmtSigned(d, 1)} %`}</span>
              ) : (
                <span className="chip tone-accent">Nouveau</span>
              )}
              <ChevronRight size={16} className="shrink-0 text-faint" />
            </a>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs text-faint">Le pourcentage compare ton meilleur 1RM estimé du jour à celui de ta séance précédente sur le même exercice.</p>

      <div className="mt-5 space-y-2">
        <a className="btn btn-primary btn-lg w-full" href="#/progres">
          Voir mes progrès
        </a>
        <a className="btn btn-secondary w-full" href={`#/historique/${session.id}`}>
          Détail et corrections
        </a>
        {canResume && (
          <button className="btn btn-secondary w-full" onClick={() => db.sessions.update(session.id, { endedAt: null })}>
            <RotateCcw size={18} /> Reprendre cette séance
          </button>
        )}
        <button className="btn btn-ghost w-full" onClick={onNew}>
          <Plus size={18} /> Démarrer une autre séance
        </button>
      </div>
    </div>
  );
}
