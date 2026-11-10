import { useState } from 'react';
import { saveSettings } from '../db';
import type { Insight, InsightIcon, Severity } from '../lib/insights';
import { guideSection } from '../lib/science';
import { discardEmptyActive } from '../lib/session';
import { DAY_MS } from '../lib/util';
import {
  BatteryCharging,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  Database,
  Gauge,
  Moon,
  Scale,
  Sparkles,
  Target,
  Timer,
  TrendingUp
} from '../ui/icons';
import { WhyList, cx } from '../ui/kit';
import { Sheet, dialog, toast } from '../ui/overlay';

const ICONS: Record<InsightIcon, typeof Timer> = {
  volume: ChartColumn,
  effort: Gauge,
  rest: Timer,
  fatigue: BatteryCharging,
  progress: TrendingUp,
  body: Scale,
  sleep: Moon,
  adherence: CalendarDays,
  backup: Database,
  range: Target,
  deload: BatteryCharging,
  start: Sparkles
};
const TONE: Record<Severity, string> = { alert: 'tone-bad', warn: 'tone-warn', info: 'tone-accent', good: 'tone-good' };
const LABEL: Record<Severity, string> = { alert: 'Prioritaire', warn: 'À corriger', info: 'À savoir', good: 'Bien' };

export async function activateDeload() {
  const ok = await dialog.confirm({
    title: 'Semaine de décharge',
    message: 'Pendant 7 jours : moitié moins de sets, 2 reps de plus en réserve, mêmes charges. Ces séances ne comptent pas dans tes tendances.',
    confirmLabel: 'Activer'
  });
  if (!ok) return false;
  await saveSettings({ deloadUntil: Date.now() + 7 * DAY_MS });
  await discardEmptyActive();
  toast('Décharge activée pour 7 jours', { tone: 'good', icon: <BatteryCharging size={16} className="text-good" /> });
  return true;
}

function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[insight.icon];
  const guide = insight.guide ? guideSection(insight.guide) : undefined;
  return (
    <li className="px-4 py-3.5">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(true)} aria-label={`${insight.title}. Toucher pour le détail.`}>
        <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE[insight.severity])}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold leading-snug">{insight.title}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-mute">{insight.text}</span>
        </span>
      </button>
      {insight.action && (
        <div className="mt-2.5 pl-12">
          {insight.action.kind === 'deload' ? (
            <button className="btn btn-tonal btn-sm" onClick={activateDeload}>
              {insight.action.label}
            </button>
          ) : (
            <a className="btn btn-secondary btn-sm" href={insight.action.href}>
              {insight.action.label}
            </a>
          )}
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={insight.title} subtitle={<span className={cx('chip mt-1', TONE[insight.severity])}>{LABEL[insight.severity]}</span>} closeLabel="Compris">
        <p className="text-[15px] leading-relaxed">{insight.text}</p>
        <div className="eyebrow mb-2 mt-5">Ce que l’app a mesuré</div>
        <WhyList lines={insight.why} />
        {guide && (
          <a className="inset mt-5 flex items-center gap-3 px-3.5 py-3 active:opacity-80" href={`#/reglages/guide/${guide.id}`}>
            <BookOpen size={18} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="eyebrow block">Ce que dit la recherche</span>
              <span className="block text-sm font-medium">{guide.short}</span>
            </span>
          </a>
        )}
      </Sheet>
    </li>
  );
}

/** Liste des conseils du coach, les plus importants d'abord. */
export function Coach({ insights, limit = 3 }: { insights: Insight[]; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!insights.length) return null;
  const shown = all ? insights : insights.slice(0, limit);
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line/60">
        {shown.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </ul>
      {insights.length > limit && (
        <button className="flex min-h-[46px] w-full items-center justify-center gap-1.5 border-t border-line/60 text-sm font-semibold text-accent" onClick={() => setAll(!all)}>
          {all ? 'Réduire' : `Voir les ${insights.length} conseils`}
          <ChevronDown size={16} className={cx('transition-transform', all && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
