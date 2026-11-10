import { useState } from 'react';
import { markVersionSeen } from '../components/WhatsNew';
import { db, saveSettings } from '../db';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS, seedLibrary } from '../lib/defaults';
import { LEVEL_FR, levelFromYears } from '../lib/engine';
import { loadSplitV2 } from '../lib/mySplit';
import { fmt, uid } from '../lib/util';
import type { Goal, Unit } from '../types';
import { ArrowRight, Check, ChevronLeft, Database, Dumbbell, Lightbulb, Target } from '../ui/icons';
import { Field, NumInput, Segmented, Stepper, cx } from '../ui/kit';

type ProgramChoice = 'v2' | 'example' | 'empty';

const PROGRAMS: { id: ProgramChoice; title: string; text: string }[] = [
  { id: 'v2', title: 'Mon split V2', text: 'Push / Pull / Legs sur 6 jours, 3:00 de repos, 1 RIR, avec mes charges de départ.' },
  { id: 'example', title: 'Programme d’exemple', text: 'Haut / Bas sur 4 jours, à adapter à ta salle.' },
  { id: 'empty', title: 'Partir de zéro', text: 'Je construis mon programme moi-même.' }
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [years, setYears] = useState<number | null>(2);
  const [goal, setGoal] = useState<Goal>('maintain');
  const [unit, setUnit] = useState<Unit>('lb');
  const [bw, setBw] = useState<number | null>(null);
  const [program, setProgram] = useState<ProgramChoice>('v2');
  const [busy, setBusy] = useState(false);
  const level = levelFromYears(years ?? 0, DEFAULT_ENGINE);
  const range = level === 'beginner' ? DEFAULT_ENGINE.rateBeginner : level === 'intermediate' ? DEFAULT_ENGINE.rateIntermediate : DEFAULT_ENGINE.rateAdvanced;

  async function finish() {
    setBusy(true);
    try {
      if (program !== 'empty' && (await db.exercises.count()) === 0) {
        // La bibliothèque d'exemple sert aussi de réserve pour les swaps.
        const { exercises, days } = seedLibrary(unit);
        await db.exercises.bulkPut(exercises);
        if (program === 'example') await db.days.bulkPut(days);
      }
      if (program === 'v2') await loadSplitV2({ plateLb: DEFAULT_SETTINGS.plateLb, plateKg: DEFAULT_SETTINGS.plateKg });
      if (bw) await db.bodyweights.put({ id: uid(), date: Date.now(), weight: bw, unit });
      markVersionSeen();
      await saveSettings({ onboarded: true, trainingYears: years ?? 0, goal, defaultUnit: unit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-8 pt-safe">
      <div className="flex items-center gap-2 pb-2 pt-4">
        {step > 0 ? (
          <button className="btn btn-icon btn-secondary rounded-full" onClick={() => setStep(step - 1)} aria-label="Étape précédente">
            <ChevronLeft size={20} />
          </button>
        ) : (
          <span className="h-11" />
        )}
        <div className="flex flex-1 justify-center gap-1.5" aria-label={`Étape ${step + 1} sur 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cx('h-1.5 rounded-full transition-all duration-300', i === step ? 'w-8 bg-accent' : i < step ? 'w-4 bg-accent/50' : 'w-4 bg-hover')} />
          ))}
        </div>
        <span className="w-11" />
      </div>

      {step === 0 && (
        <div key="s0" className="flex flex-1 animate-rise flex-col">
          <div className="flex flex-1 flex-col justify-center py-6">
            <span className="bg-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-xl shadow-accent/30">
              <Dumbbell size={32} />
            </span>
            <h1 className="mt-6 text-[34px] font-extrabold leading-[1.1] tracking-tight">
              Ton carnet de muscu <span className="text-gradient">qui pense avec toi</span>.
            </h1>
            <ul className="mt-8 space-y-5">
              {[
                { Icon: Target, t: 'Une cible pour chaque set', d: 'Charge et reps calculées d’après tes dernières séances, avec le pourquoi.' },
                { Icon: Lightbulb, t: 'Un coach qui lit tes données', d: 'Volume, effort, repos, fatigue : il te dit quoi corriger en premier.' },
                { Icon: Database, t: 'Hors ligne, rien que pour toi', d: 'Tout reste sur ton téléphone. Pas de compte, pas de réseau au gym.' }
              ].map(({ Icon, t, d }) => (
                <li key={t} className="flex gap-3.5">
                  <span className="tone-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                    <Icon size={21} />
                  </span>
                  <span>
                    <span className="block text-[16px] font-semibold">{t}</span>
                    <span className="block text-sm leading-relaxed text-mute">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <button className="btn btn-primary btn-lg w-full" onClick={() => setStep(1)}>
            Commencer <ArrowRight size={20} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div key="s1" className="flex flex-1 animate-rise flex-col">
          <div className="flex-1 py-4">
            <h1 className="title-xl">Parle-moi de toi</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-mute">Trois réponses pour calibrer le moteur de progression. Tout reste modifiable.</p>
            <div className="mt-6 space-y-6">
              <div>
                <Stepper ariaLabel="Années de pratique" label="Années d’entraînement sérieux" value={years} onChange={setYears} step={0.5} min={0} max={60} unit={(years ?? 0) >= 2 ? 'ans' : 'an'} />
                <p className="mt-2 text-sm text-mute">
                  Niveau <b className="text-ink">{LEVEL_FR[level]}</b> : on part de {fmt(range[0], 2)} à {fmt(range[1], 2)} % de progression par semaine.
                </p>
              </div>
              <Field label="Objectif de poids de corps">
                <Segmented
                  value={goal}
                  onChange={setGoal}
                  size="lg"
                  options={[
                    { value: 'bulk', label: 'Prise' },
                    { value: 'maintain', label: 'Maintien' },
                    { value: 'cut', label: 'Sèche' }
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unité">
                  <Segmented
                    value={unit}
                    onChange={setUnit}
                    size="lg"
                    options={[
                      { value: 'lb', label: 'lb' },
                      { value: 'kg', label: 'kg' }
                    ]}
                  />
                </Field>
                <Field label={`Poids (${unit}), facultatif`} htmlFor="onb-bw">
                  <NumInput id="onb-bw" value={bw} onChange={setBw} placeholder="–" ariaLabel="Poids de corps" />
                </Field>
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-lg w-full" onClick={() => setStep(2)}>
            Continuer <ArrowRight size={20} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div key="s2" className="flex flex-1 animate-rise flex-col">
          <div className="flex-1 py-4">
            <h1 className="title-xl">Ton programme</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-mute">Choisis un point de départ. Tu pourras tout modifier ensuite.</p>
            <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Programme de départ">
              {PROGRAMS.map((pr) => {
                const on = program === pr.id;
                return (
                  <button
                    key={pr.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setProgram(pr.id)}
                    className={cx('flex w-full items-start gap-3 rounded-3xl border p-4 text-left transition', on ? 'border-accent bg-accent/10' : 'border-line/70 bg-surface')}
                  >
                    <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-accent bg-accent text-white' : 'border-hover')}>
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span>
                      <span className="block text-[16px] font-semibold">{pr.title}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-mute">{pr.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn btn-primary btn-lg w-full" onClick={finish} disabled={busy}>
            C’est parti <ArrowRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
