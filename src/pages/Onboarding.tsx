import { useState } from 'react';
import { db, saveSettings } from '../db';
import { Field, NumInput, Segmented } from '../components/ui';
import { DEFAULT_ENGINE, DEFAULT_SETTINGS, seedLibrary } from '../lib/defaults';
import { loadSplitV2 } from '../lib/mySplit';
import { LEVEL_FR, levelFromYears } from '../lib/engine';
import type { Goal, Unit } from '../types';
import { fmt } from '../lib/util';

export function Onboarding() {
  const [years, setYears] = useState<number | null>(1);
  const [goal, setGoal] = useState<Goal>('maintain');
  const [unit, setUnit] = useState<Unit>('lb');
  const [bw, setBw] = useState<number | null>(null);
  const [program, setProgram] = useState<'v2' | 'example' | 'empty'>('v2');
  const level = levelFromYears(years ?? 0, DEFAULT_ENGINE);
  const range = level === 'beginner' ? DEFAULT_ENGINE.rateBeginner : level === 'intermediate' ? DEFAULT_ENGINE.rateIntermediate : DEFAULT_ENGINE.rateAdvanced;

  async function finish() {
    if (program !== 'empty' && (await db.exercises.count()) === 0) {
      // La bibliothèque d'exemple sert aussi de réserve pour les swaps.
      const { exercises, days } = seedLibrary(unit);
      await db.exercises.bulkPut(exercises);
      if (program === 'example') await db.days.bulkPut(days);
    }
    if (program === 'v2') await loadSplitV2({ plateLb: DEFAULT_SETTINGS.plateLb, plateKg: DEFAULT_SETTINGS.plateKg });
    if (bw) await db.bodyweights.put({ id: crypto.randomUUID(), date: Date.now(), weight: bw, unit });
    await saveSettings({ onboarded: true, trainingYears: years ?? 0, goal, defaultUnit: unit });
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pt-safe pb-10">
      <h1 className="pt-8 text-3xl font-bold">Bienvenue 💪</h1>
      <p className="text-mute">Trois questions pour calibrer le moteur de progression. Tout reste modifiable dans Réglages.</p>
      <div className="card space-y-4">
        <Field label="Depuis combien d'années fais-tu de la musculation sérieusement ?">
          <NumInput value={years} onChange={setYears} placeholder="ex. 2,5" />
        </Field>
        <p className="text-sm text-mute">
          Niveau estimé : <b className="text-ink">{LEVEL_FR[level]}</b> → progression de départ ≈ {fmt(range[0], 2)}–{fmt(range[1], 2)} % du 1RM estimé par semaine.
        </p>
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
        <Field label="Unité par défaut">
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
        <Field label={`Poids de corps actuel (${unit}, facultatif)`}>
          <NumInput value={bw} onChange={setBw} />
        </Field>
        <Field label="Programme de départ">
          <Segmented
            value={program}
            onChange={setProgram}
            options={[
              { value: 'v2', label: 'Mon split V2' },
              { value: 'example', label: 'Exemple' },
              { value: 'empty', label: 'Vide' }
            ]}
          />
        </Field>
        <p className="text-sm text-mute">
          {program === 'v2'
            ? 'Push/Pull/Legs sur 6 jours, 3:00 de repos, 1 RIR, avec tes charges de la semaine dernière comme point de départ.'
            : program === 'example'
              ? 'Haut/bas sur 4 jours, à adapter.'
              : 'Tu construis ton programme toi-même.'}
        </p>
      </div>
      <button className="btn-primary w-full text-lg" onClick={finish}>
        C'est parti
      </button>
    </div>
  );
}
