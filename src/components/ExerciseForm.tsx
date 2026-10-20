import { useState } from 'react';
import { MUSCLES, type Exercise } from '../types';
import { Field, NumInput, Segmented } from './ui';

/** Édition des propriétés d'un exercice de la bibliothèque. */
export function ExerciseForm({ value, onSave, onCancel }: { value: Exercise; onSave: (e: Exercise) => void; onCancel: () => void }) {
  const [e, setE] = useState<Exercise>(value);
  const up = (patch: Partial<Exercise>) => setE({ ...e, ...patch });
  const toggleSecondary = (m: string) =>
    up({ secondaryMuscles: e.secondaryMuscles.includes(m) ? e.secondaryMuscles.filter((x) => x !== m) : [...e.secondaryMuscles, m] });
  return (
    <div className="space-y-4">
      <Field label="Nom">
        <input className="input" value={e.name} onChange={(ev) => up({ name: ev.target.value })} />
      </Field>
      <Field label="Muscle principal">
        <select className="input" value={e.primaryMuscle} onChange={(ev) => up({ primaryMuscle: ev.target.value })}>
          {MUSCLES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <div>
        <span className="label">Muscles secondaires</span>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.filter((m) => m !== e.primaryMuscle).map((m) => (
            <button
              key={m}
              onClick={() => toggleSecondary(m)}
              className={`rounded-full px-3 py-2 text-sm ${e.secondaryMuscles.includes(m) ? 'bg-accent text-white' : 'bg-line/60 text-mute'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <Field label="Type">
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
        <Field label="Incrément minimal">
          <NumInput value={e.increment} onChange={(v) => up({ increment: v ?? 1 })} />
        </Field>
      </div>
      <Field label="Les plates comptent…">
        <Segmented
          value={e.loadMode}
          onChange={(loadMode) => up({ loadMode })}
          options={[
            { value: 'perSide', label: 'Par côté (×2)' },
            { value: 'total', label: 'Au total' }
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Charge à vide (${e.unit})`}>
          <NumInput value={e.baseWeight} onChange={(v) => up({ baseWeight: v ?? 0 })} placeholder="barre, chariot" />
        </Field>
        <Field label="Repos (s) — vide = global">
          <NumInput value={e.restSec} onChange={(v) => up({ restSec: v })} placeholder="global" />
        </Field>
      </div>
      <Field label="Réglages machine">
        <textarea className="input py-2" rows={2} value={e.setupNotes} onChange={(ev) => up({ setupNotes: ev.target.value })} placeholder="Siège cran 4, dossier 2…" />
      </Field>
      <div className="flex gap-2 pt-2">
        <button className="btn-ghost flex-1" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn-primary flex-1" disabled={!e.name.trim()} onClick={() => onSave({ ...e, name: e.name.trim() })}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
