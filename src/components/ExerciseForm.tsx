import { useState } from 'react';
import { usesPlates } from '../db';
import { MUSCLES, type Exercise } from '../types';
import { Field, NumInput, RestPicker, Segmented, Toggle, cx } from '../ui/kit';

/** Édition des propriétés d'un exercice de la bibliothèque. */
export function ExerciseForm({ value, globalRest, onSave, onCancel }: { value: Exercise; globalRest: number; onSave: (e: Exercise) => void; onCancel: () => void }) {
  const [e, setE] = useState<Exercise>({ ...value, plates: usesPlates(value) });
  const up = (patch: Partial<Exercise>) => setE({ ...e, ...patch });
  const toggleSecondary = (m: string) =>
    up({ secondaryMuscles: e.secondaryMuscles.includes(m) ? e.secondaryMuscles.filter((x) => x !== m) : [...e.secondaryMuscles, m] });
  return (
    <div className="space-y-5">
      <Field label="Nom" htmlFor="ex-name">
        <input id="ex-name" className="input" value={e.name} onChange={(ev) => up({ name: ev.target.value })} placeholder="Nom de l’exercice" />
      </Field>
      <Field label="Muscle principal" htmlFor="ex-muscle">
        <select id="ex-muscle" className="input" value={e.primaryMuscle} onChange={(ev) => up({ primaryMuscle: ev.target.value, secondaryMuscles: e.secondaryMuscles.filter((m) => m !== ev.target.value) })}>
          {MUSCLES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <div>
        <span className="eyebrow mb-1.5 block">Muscles secondaires (comptent pour un demi-set)</span>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.filter((m) => m !== e.primaryMuscle).map((m) => (
            <button
              key={m}
              onClick={() => toggleSecondary(m)}
              className={cx('rounded-full px-3 py-2 text-sm font-medium transition', e.secondaryMuscles.includes(m) ? 'bg-accent text-white' : 'bg-raised text-mute')}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <Field label="Type" hint="Un exercice d’isolation progresse plus lentement en charge : le moteur en tient compte.">
        <Segmented
          value={e.type}
          onChange={(type) => up({ type })}
          options={[
            { value: 'compound', label: 'Composé' },
            { value: 'isolation', label: 'Isolation' }
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unité">
          <Segmented
            value={e.unit}
            onChange={(unit) => up({ unit })}
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' }
            ]}
          />
        </Field>
        <Field label={`Plus petit saut (${e.unit})`} htmlFor="ex-inc">
          <NumInput id="ex-inc" value={e.increment} onChange={(v) => up({ increment: v && v > 0 ? v : 1 })} />
        </Field>
      </div>
      <div className="inset px-4">
        <Toggle label="Chargé avec des plates" hint="La charge se saisit en « plates + extra »." checked={!!e.plates} onChange={(plates) => up({ plates })} />
        {e.plates && (
          <div className="space-y-4 pb-4">
            <Field label="Les plates comptent…">
              <Segmented
                value={e.loadMode}
                onChange={(loadMode) => up({ loadMode })}
                options={[
                  { value: 'perSide', label: 'Par côté (× 2)' },
                  { value: 'total', label: 'Au total' }
                ]}
              />
            </Field>
            <Field label={`Charge à vide (${e.unit})`} htmlFor="ex-base" hint="Poids de la barre ou du chariot, ajouté au total. Laisse 0 si tu ne le comptes pas.">
              <NumInput id="ex-base" value={e.baseWeight} onChange={(v) => up({ baseWeight: v ?? 0 })} placeholder="0" />
            </Field>
          </div>
        )}
      </div>
      <Field label="Temps de repos (tous les jours)">
        <RestPicker value={e.restSec} onChange={(restSec) => up({ restSec })} defaultSec={globalRest} defaultLabel="repos global" />
      </Field>
      <Field label="Réglages machine" htmlFor="ex-setup" hint="Affichés pendant la séance pour retrouver la même position.">
        <textarea id="ex-setup" className="input" rows={2} value={e.setupNotes} onChange={(ev) => up({ setupNotes: ev.target.value })} placeholder="Siège cran 4, dossier 2…" />
      </Field>
      <div className="flex gap-2 pt-1">
        <button className="btn btn-secondary flex-1" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary flex-1" disabled={!e.name.trim()} onClick={() => onSave({ ...e, name: e.name.trim() })}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
