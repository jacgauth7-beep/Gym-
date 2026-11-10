import { useState } from 'react';
import { db } from '../../db';
import { useBodyweights, useCheckins } from '../../hooks';
import { dateKey, fmt, startOfDay, uid } from '../../lib/util';
import type { Settings } from '../../types';
import { Check, Moon, Scale } from '../../ui/icons';
import { NumInput, cx } from '../../ui/kit';
import { Sheet, toast } from '../../ui/overlay';

const SLEEP = [
  { h: 5.5, label: 'Moins de 6 h' },
  { h: 6.5, label: '6 à 7 h' },
  { h: 7.5, label: '7 à 8 h' },
  { h: 8.5, label: '8 h ou plus' }
];
export const sleepLabel = (h: number) => SLEEP.find((s) => s.h === h)?.label ?? `${fmt(h)} h`;

/**
 * Check-in du jour : sommeil et pesée, un tap chacun.
 * Le coach s'en sert pour expliquer tes bonnes et mauvaises séances, et le moteur pour ajuster ta vitesse attendue.
 */
export function DailyCheckin({ settings }: { settings: Settings }) {
  const checkins = useCheckins();
  const bodyweights = useBodyweights();
  const [sheet, setSheet] = useState<null | 'sleep' | 'weight'>(null);
  const [w, setW] = useState<number | null>(null);
  if (!checkins || !bodyweights) return null;

  const now = Date.now();
  const key = dateKey(now);
  const today = checkins.find((c) => c.id === key);
  const weighed = [...bodyweights].reverse().find((b) => b.date >= startOfDay(now));
  const lastWeight = bodyweights[bodyweights.length - 1];

  const pill = (done: boolean) => cx('flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold transition active:scale-[0.98]', done ? 'bg-good/10 text-good' : 'bg-raised text-mute');

  return (
    <div className="flex gap-2">
      <button className={pill(today?.sleepH != null)} onClick={() => setSheet('sleep')}>
        {today?.sleepH != null ? <Check size={16} strokeWidth={2.6} /> : <Moon size={16} />}
        <span className="truncate">{today?.sleepH != null ? sleepLabel(today.sleepH) : 'Sommeil ?'}</span>
      </button>
      <button
        className={pill(!!weighed)}
        onClick={() => {
          setW(weighed?.weight ?? null);
          setSheet('weight');
        }}
      >
        {weighed ? <Check size={16} strokeWidth={2.6} /> : <Scale size={16} />}
        <span className="num truncate">{weighed ? `${fmt(weighed.weight)} ${weighed.unit}` : 'Pesée ?'}</span>
      </button>

      <Sheet open={sheet === 'sleep'} onClose={() => setSheet(null)} title="Ta nuit dernière" subtitle="Le sommeil explique beaucoup de bonnes et de mauvaises séances." closeLabel="Passer">
        <div className="grid grid-cols-2 gap-2">
          {SLEEP.map((s) => (
            <button
              key={s.h}
              className={cx('btn btn-lg', today?.sleepH === s.h ? 'bg-accent text-white' : 'btn-secondary')}
              onClick={async () => {
                await db.checkins.put({ id: key, date: startOfDay(now), sleepH: s.h });
                setSheet(null);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'weight'}
        onClose={() => setSheet(null)}
        title="Pesée du jour"
        subtitle="Le matin à jeun, 2 à 4 fois par semaine. Le moteur en tire ta vraie tendance."
        footer={
          <div className="flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => setSheet(null)}>
              Annuler
            </button>
            <button
              className="btn btn-primary flex-1"
              disabled={!w || w <= 0}
              onClick={async () => {
                if (weighed) await db.bodyweights.update(weighed.id, { weight: w! });
                else await db.bodyweights.put({ id: uid(), date: now, weight: w!, unit: settings.defaultUnit });
                setSheet(null);
                toast('Pesée enregistrée', { tone: 'good', icon: <Check size={16} className="text-good" /> });
              }}
            >
              Enregistrer
            </button>
          </div>
        }
      >
        <NumInput value={w} onChange={setW} placeholder={lastWeight ? `Dernière : ${fmt(lastWeight.weight)} ${lastWeight.unit}` : `Poids en ${settings.defaultUnit}`} className="text-center text-2xl font-bold" ariaLabel="Poids de corps" />
        <p className="mt-2 text-center text-xs text-faint">en {weighed?.unit ?? settings.defaultUnit}</p>
      </Sheet>
    </div>
  );
}
