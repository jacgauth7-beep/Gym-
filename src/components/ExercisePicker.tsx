import { useMemo, useState } from 'react';
import type { Exercise } from '../types';
import { Plus, Search } from '../ui/icons';
import { Sheet } from '../ui/overlay';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Liste filtrable : un tap sur un exercice le choisit. Les exercices du même muscle sont en tête. */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  exercises,
  title,
  subtitle,
  preferMuscle,
  excludeId,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
  exercises: Exercise[];
  title: string;
  subtitle?: string;
  preferMuscle?: string;
  excludeId?: string;
  onCreate?: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const { same, others } = useMemo(() => {
    const nq = norm(q);
    const list = exercises
      .filter((e) => e.id !== excludeId && (!nq || norm(e.name).includes(nq) || norm(e.primaryMuscle).includes(nq)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { same: list.filter((e) => e.primaryMuscle === preferMuscle), others: list.filter((e) => e.primaryMuscle !== preferMuscle) };
  }, [exercises, q, preferMuscle, excludeId]);

  const row = (e: Exercise) => (
    <li key={e.id}>
      <button
        className="flex min-h-[56px] w-full items-center justify-between gap-3 py-2 text-left active:opacity-70"
        onClick={() => {
          onPick(e);
          setQ('');
        }}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{e.name}</span>
          <span className="block truncate text-xs text-faint">
            {e.primaryMuscle} · {e.type === 'compound' ? 'composé' : 'isolation'}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle} closeLabel="Annuler">
      <div className="relative mb-2">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input className="input pl-10" placeholder="Rechercher un exercice ou un muscle" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {same.length > 0 && (
        <>
          <div className="eyebrow mt-3">Même muscle · {preferMuscle}</div>
          <ul className="divide-y divide-line/60">{same.map(row)}</ul>
          {others.length > 0 && <div className="eyebrow mt-4">Autres</div>}
        </>
      )}
      <ul className="divide-y divide-line/60">{others.map(row)}</ul>
      {!same.length && !others.length && <p className="py-6 text-center text-sm text-mute">Aucun exercice trouvé.</p>}
      {onCreate && q.trim() && (
        <button className="btn btn-tonal mt-3 w-full" onClick={() => (onCreate(q.trim()), setQ(''))}>
          <Plus size={18} /> Créer « {q.trim()} »
        </button>
      )}
    </Sheet>
  );
}
