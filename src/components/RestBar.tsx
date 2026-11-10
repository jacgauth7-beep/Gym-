import { useEffect } from 'react';
import { useNow, useSettings } from '../hooks';
import { notifyEnd, playDing, remainingMs, timer, useTimer, vibrate } from '../lib/timer';
import { fmtClock } from '../lib/util';
import { Check, Pause, Play, SkipForward } from '../ui/icons';
import { ProgressRing, cx } from '../ui/kit';

/** Bandeau persistant du minuteur de repos, juste au-dessus des onglets (zone du pouce), visible sur tous les écrans. */
export function RestBar() {
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
  const paused = t.pausedLeft != null;
  const pct = t.durationMs > 0 ? Math.min(1, Math.max(0, 1 - left / t.durationMs)) : 1;
  const caption = over ? (t.sub ? `À toi : ${t.sub}` : 'Repos terminé') : `${paused ? 'En pause' : 'Repos'}${t.sub ? ` · ensuite ${t.sub}` : t.label ? ` · ${t.label}` : ''}`;
  return (
    <div className={cx('border-b border-line/70 transition-colors duration-500', over && 'bg-good/10')} role="timer" aria-label="Minuteur de repos">
      <div className={cx('truncate px-4 pt-2 text-xs font-medium', over ? 'text-good' : 'text-mute')}>{caption}</div>
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-1">
        <ProgressRing value={over ? 1 : pct} size={44} stroke={5} tone={over ? 'good' : 'accent'}>
          {over ? <Check size={18} className="text-good" /> : paused ? <Pause size={14} className="text-mute" /> : null}
        </ProgressRing>
        <div className={cx('num min-w-0 flex-1 text-[32px] font-bold leading-none', over && 'text-good')} aria-live="off">
          {over ? `+${fmtClock(-left / 1000)}` : fmtClock(Math.ceil(left / 1000))}
        </div>
        {!over && (
          <>
            <button className="btn btn-secondary num w-[52px] px-0" onClick={() => timer.add(-15)} aria-label="Moins 15 secondes">
              −15
            </button>
            <button className="btn btn-secondary num w-[52px] px-0" onClick={() => timer.add(15)} aria-label="Plus 15 secondes">
              +15
            </button>
            <button className="btn btn-secondary w-[48px] px-0" onClick={() => timer.togglePause()} aria-label={paused ? 'Reprendre' : 'Pause'}>
              {paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          </>
        )}
        <button className={cx('btn px-3.5', over ? 'btn-good' : 'btn-secondary')} onClick={() => timer.stop()} aria-label={over ? 'Fermer le minuteur' : 'Passer le repos'}>
          {over ? 'OK' : <SkipForward size={18} />}
        </button>
      </div>
    </div>
  );
}
