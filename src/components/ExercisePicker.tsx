import { useMemo, useState } from 'react';
import type { Exercise } from '../types';
import { Sheet } from './ui';

/** Liste filtrable : un tap sur un exercice le choisit. Les exercices du même muscle sont en tête. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  exercises,
  title,
  preferMuscle,
  excludeId,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
  exercises: Exercise[];
  title: string;
  preferMuscle?: string;
  excludeId?: string;
  onCreate?: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const nq = norm(q);
    return exercises
      .filter((e) => e.id !== excludeId && (!nq || norm(e.name).includes(nq) || norm(e.primaryMuscle).includes(nq)))
      .sort((a, b) => Number(b.primaryMuscle === preferMuscle) - Number(a.primaryMuscle === preferMuscle) || a.name.localeCompare(b.name, 'fr'));
  }, [exercises, q, preferMuscle, excludeId]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input className="input mb-3" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="divide-y divide-line/60">
        {list.map((e) => (
          <li key={e.id}>
            <button
              className="flex w-full items-center justify-between py-3 text-left min-h-[56px]"
              onClick={() => {
                onPick(e);
                setQ('');
              }}
            >
              <span className="font-medium">{e.name}</span>
              <span className={`chip ${e.primaryMuscle === preferMuscle ? 'bg-accent/30' : ''}`}>{e.primaryMuscle}</span>
            </button>
          </li>
        ))}
      </ul>
      {onCreate && q.trim() && (
        <button className="btn-primary mt-3 w-full" onClick={() => (onCreate(q.trim()), setQ(''))}>
          + Créer « {q.trim()} »
        </button>
      )}
    </Sheet>
  );
}
