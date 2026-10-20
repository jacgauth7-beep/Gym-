import { useEffect } from 'react';
import { useNow, useSettings } from '../hooks';
import { notifyEnd, playDing, remainingMs, timer, useTimer, vibrate } from '../lib/timer';
import { fmtClock } from '../lib/util';

/** Bandeau persistant du minuteur de repos, visible sur tous les écrans. */
export function RestBanner() {
  const t = useTimer();
  const settings = useSettings();
  const active = t.endAt != null || t.pausedLeft != null;
  const now = useNow(250, active);
  const left = remainingMs(t, now);

  useEffect(() => {
    if (left == null || left > 0 || t.fired || t.pausedLeft != null) return;
    timer.markFired();
    // Si on revient longtemps après la fin (app suspendue par iOS), on ne sonne pas en retard.
    if (-left > 5000) return;
    if (settings?.sound !== false) playDing();
    if (settings?.vibrate !== false) vibrate();
    if (settings?.notify) notifyEnd(t.label);
  }, [left, t.fired, t.pausedLeft, t.label, settings]);

  if (!active || left == null) return null;
  const over = left <= 0;
  const pct = t.durationMs > 0 ? Math.min(1, Math.max(0, 1 - left / t.durationMs)) : 1;
  return (
    <div className="sticky top-0 z-40 pt-safe bg-bg/95 backdrop-blur border-b border-line">
      <div className="relative h-1 bg-line">
        <div className={`absolute inset-y-0 left-0 ${over ? 'bg-good' : 'bg-accent'}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className={`text-3xl font-bold tabular-nums leading-none ${over ? 'text-good' : ''}`} aria-live="polite">
            {over ? `+${fmtClock(-left / 1000)}` : fmtClock(Math.ceil(left / 1000))}
          </div>
          <div className="truncate text-xs text-mute">
            {over ? 'Repos terminé — à toi !' : t.pausedLeft != null ? 'En pause' : 'Repos'}
            {t.label ? ` · ${t.label}` : ''}
          </div>
        </div>
        {!over && (
          <>
            <button className="btn-ghost btn-sm w-12" onClick={() => timer.add(-15)} aria-label="Moins 15 secondes">
              −15
            </button>
            <button className="btn-ghost btn-sm w-12" onClick={() => timer.add(15)} aria-label="Plus 15 secondes">
              +15
            </button>
            <button className="btn-ghost btn-sm w-12" onClick={() => timer.togglePause()} aria-label={t.pausedLeft != null ? 'Reprendre' : 'Pause'}>
              {t.pausedLeft != null ? '▶' : '❚❚'}
            </button>
          </>
        )}
        <button className="btn-ghost btn-sm" onClick={() => timer.stop()}>
          {over ? 'OK' : 'Passer'}
        </button>
      </div>
    </div>
  );
}
