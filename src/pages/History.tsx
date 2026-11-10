import { useMemo, useState } from 'react';
import { useExercises, useSessions } from '../hooks';
import { exerciseHistory, isDone } from '../lib/engine';
import { sessionStats } from '../lib/session';
import { fmt, fmtDate, fmtDuration, plural, startOfDay } from '../lib/util';
import type { Session, Settings } from '../types';
import { BatteryCharging, ChevronLeft, ChevronRight, History as HistoryIcon, Trophy } from '../ui/icons';
import { EmptyState, PageHeader, SectionHeader, cx } from '../ui/kit';

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const monthStart = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
const addMonths = (ts: number, n: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
};

export function History({ settings }: { settings: Settings }) {
  const sessions = useSessions();
  const { map: exMap, loaded } = useExercises();
  const [month, setMonth] = useState(() => monthStart(Date.now()));

  const worked = useMemo(() => (sessions ?? []).filter((s) => s.exercises.some((e) => e.sets.some(isDone))), [sessions]);
  // Nombre de records (1RM estimé) battus dans chaque séance.
  const prBySession = useMemo(() => {
    const out = new Map<string, number>();
    const ids = new Set(worked.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
    for (const id of ids) for (const h of exerciseHistory(worked, id)) if (h.isE1rmPR) out.set(h.sessionId, (out.get(h.sessionId) ?? 0) + 1);
    return out;
  }, [worked]);

  if (!sessions || !loaded) return null;
  if (!worked.length) {
    return (
      <div>
        <PageHeader title="Historique" />
        <EmptyState
          icon={<HistoryIcon size={26} />}
          title="Aucune séance pour l’instant"
          action={
            <a className="btn btn-primary w-full" href="#/seance">
              Aller à la séance du jour
            </a>
          }
        >
          Chaque séance terminée arrive ici. Tu pourras la relire, la corriger ou la supprimer.
        </EmptyState>
      </div>
    );
  }

  const now = Date.now();
  const next = addMonths(month, 1);
  const inMonth = worked.filter((s) => s.startedAt >= month && s.startedAt < next).sort((a, b) => b.startedAt - a.startedAt);
  const byDay = new Map<number, Session[]>();
  for (const s of inMonth) byDay.set(startOfDay(s.startedAt), [...(byDay.get(startOfDay(s.startedAt)) ?? []), s]);

  const first = new Date(month);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = startOfDay(now);
  const earliest = monthStart(worked[0].startedAt);
  const totalMs = inMonth.reduce((a, s) => a + sessionStats(s, exMap, settings.engine.hardSetRir).durationMs, 0);
  const monthPrs = inMonth.reduce((a, s) => a + (prBySession.get(s.id) ?? 0), 0);

  return (
    <div>
      <PageHeader title="Historique" />

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <button className="btn btn-icon btn-secondary rounded-full" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= earliest} aria-label="Mois précédent">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <div className="headline capitalize">{fmtDate(month, { month: 'long', year: 'numeric' })}</div>
            <div className="num text-xs text-faint">
              {inMonth.length} {plural(inMonth.length, 'séance')}
              {totalMs > 0 && ` · ${fmtDuration(totalMs)}`}
              {monthPrs > 0 && ` · ${monthPrs} ${plural(monthPrs, 'record')}`}
            </div>
          </div>
          <button className="btn btn-icon btn-secondary rounded-full" onClick={() => setMonth(next)} disabled={next > now} aria-label="Mois suivant">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-y-1.5 text-center">
          {LETTERS.map((l, i) => (
            <div key={i} className="pb-1 text-[10px] font-semibold text-faint">
              {l}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <div key={i} />;
            const t = new Date(first.getFullYear(), first.getMonth(), d).getTime();
            const list = byDay.get(t);
            const cls = cx(
              'num mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold',
              list ? (list.some((s) => s.deload) ? 'bg-good/20 text-good' : 'bg-accent text-white') : t === today ? 'text-accent ring-2 ring-accent' : t > today ? 'text-faint/50' : 'text-mute'
            );
            return list ? (
              <a key={i} href={`#/historique/${list[0].id}`} className={cls} aria-label={`${fmtDate(t)} : ${list[0].dayName}`}>
                {d}
              </a>
            ) : (
              <div key={i} className={cls}>
                {d}
              </div>
            );
          })}
        </div>
      </div>

      <SectionHeader title={inMonth.length ? 'Séances du mois' : 'Aucune séance ce mois-ci'} />
      {inMonth.length > 0 && (
        <ul className="card divide-y divide-line/60 overflow-hidden">
          {inMonth.map((s) => {
            const st = sessionStats(s, exMap, settings.engine.hardSetRir);
            const prs = prBySession.get(s.id) ?? 0;
            const d = new Date(s.startedAt);
            return (
              <li key={s.id}>
                <a className="flex min-h-[68px] items-center gap-3 px-4 py-2.5 active:bg-raised/60" href={`#/historique/${s.id}`}>
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-raised leading-none">
                    <span className="text-[9px] font-bold uppercase text-faint">{fmtDate(s.startedAt, { weekday: 'short' }).replace('.', '')}</span>
                    <span className="num mt-0.5 text-[17px] font-bold">{d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-semibold">{s.dayName}</span>
                      {s.endedAt == null && <span className="chip tone-accent">En cours</span>}
                      {s.deload && <BatteryCharging size={14} className="shrink-0 text-good" />}
                    </span>
                    <span className="num block truncate text-xs text-faint">
                      {s.endedAt != null && `${fmtDuration(st.durationMs)} · `}
                      {st.sets} {plural(st.sets, 'set')} · {fmt(st.volumeLb / 1000, 1)}k lb
                    </span>
                  </span>
                  {prs > 0 && (
                    <span className="chip tone-gold num">
                      <Trophy size={12} /> {prs}
                    </span>
                  )}
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 px-1 text-xs text-faint">
        {worked.length} {plural(worked.length, 'séance')} depuis le {fmtDate(worked[0].startedAt, { day: 'numeric', month: 'long', year: 'numeric' })}.
      </p>
    </div>
  );
}
