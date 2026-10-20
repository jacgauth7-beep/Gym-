import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db } from '../db';
import { useDays, useExercises } from '../hooks';
import { ExerciseForm } from '../components/ExerciseForm';
import { ExercisePicker } from '../components/ExercisePicker';
import { Field, NumInput, Segmented, Sheet } from '../components/ui';
import { WEEKDAYS_FR, fmtClock, uid } from '../lib/util';
import type { Exercise, ProgramDay, ProgramItem, Settings } from '../types';

export function newExercise(name: string, settings: Settings): Exercise {
  return {
    id: uid(),
    name,
    primaryMuscle: 'Pectoraux',
    secondaryMuscles: [],
    type: 'compound',
    unit: settings.defaultUnit,
    increment: settings.defaultUnit === 'kg' ? 2 : 5,
    loadMode: 'total',
    baseWeight: 0,
    restSec: null,
    setupNotes: ''
  };
}

export function Program({ settings }: { settings: Settings }) {
  const days = useDays();
  const { list: library, map: exMap } = useExercises();
  const [view, setView] = useState<'split' | 'library'>('split');
  const [dayId, setDayId] = useState<string | null>(null);
  if (!days || !library) return null;
  const day = days.find((d) => d.id === dayId) ?? days[0];

  async function addDay() {
    const name = prompt('Nom du jour', `Jour ${days!.length + 1}`);
    if (!name) return;
    const d: ProgramDay = { id: uid(), name, order: days!.length, weekdays: [], items: [] };
    await db.days.put(d);
    setDayId(d.id);
  }

  return (
    <div className="space-y-3">
      <Segmented
        value={view}
        onChange={setView}
        size="lg"
        options={[
          { value: 'split', label: 'Split' },
          { value: 'library', label: 'Bibliothèque' }
        ]}
      />
      {view === 'library' ? (
        <Library library={library} settings={settings} />
      ) : (
        <>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {days.map((d) => (
              <button
                key={d.id}
                onClick={() => setDayId(d.id)}
                className={`btn-sm btn whitespace-nowrap ${d.id === day?.id ? 'bg-accent text-white' : 'bg-line/50'}`}
              >
                {d.name}
              </button>
            ))}
            <button className="btn-sm btn-ghost whitespace-nowrap" onClick={addDay}>
              + Jour
            </button>
          </div>
          {day ? <DayEditor key={day.id} day={day} days={days} library={library} exMap={exMap} settings={settings} onDeleted={() => setDayId(null)} /> : <p className="text-mute">Ajoute un premier jour.</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- jour

function DayEditor({
  day,
  days,
  library,
  exMap,
  settings,
  onDeleted
}: {
  day: ProgramDay;
  days: ProgramDay[];
  library: Exercise[];
  exMap: Map<string, Exercise>;
  settings: Settings;
  onDeleted: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<ProgramItem | null>(null);
  const [editing, setEditing] = useState<ProgramItem | null>(null);
  const [moving, setMoving] = useState<ProgramItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const save = (patch: Partial<ProgramDay>) => db.days.update(day.id, patch);
  const setItems = (items: ProgramItem[]) => save({ items });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = day.items.findIndex((i) => i.id === e.active.id);
    const to = day.items.findIndex((i) => i.id === e.over!.id);
    setItems(arrayMove(day.items, from, to));
  }

  async function moveDay(dir: -1 | 1) {
    const sorted = [...days].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((d) => d.id === day.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    await db.transaction('rw', db.days, () => Promise.all(sorted.map((d, k) => db.days.update(d.id, { order: k }))));
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="flex gap-2">
          <input className="input flex-1 font-bold" defaultValue={day.name} onBlur={(e) => e.target.value.trim() && save({ name: e.target.value.trim() })} aria-label="Nom du jour" />
          <button className="btn-ghost btn-sm" onClick={() => moveDay(-1)} aria-label="Jour précédent">
            ←
          </button>
          <button className="btn-ghost btn-sm" onClick={() => moveDay(1)} aria-label="Jour suivant">
            →
          </button>
        </div>
        <div>
          <span className="label">Jours de la semaine (vide = rotation)</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <button
                key={wd}
                onClick={() => save({ weekdays: day.weekdays.includes(wd) ? day.weekdays.filter((x) => x !== wd) : [...day.weekdays, wd] })}
                className={`flex-1 rounded-lg min-h-[40px] text-sm font-semibold ${day.weekdays.includes(wd) ? 'bg-accent text-white' : 'bg-line/50 text-mute'}`}
              >
                {WEEKDAYS_FR[wd]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-mute">Maintiens ⠿ puis glisse pour réordonner.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={day.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {day.items.map((it) => (
              <SortableItem
                key={it.id}
                item={it}
                ex={exMap.get(it.exerciseId)}
                globalRest={settings.defaultRestSec}
                onEdit={() => setEditing(it)}
                onReplace={() => setReplacing(it)}
                onMove={() => setMoving(it)}
                onDelete={() => confirm('Retirer cet exercice du jour ?') && setItems(day.items.filter((x) => x.id !== it.id))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <button className="btn-primary w-full" onClick={() => setAdding(true)}>
        + Ajouter un exercice
      </button>
      <button
        className="btn-ghost w-full text-bad"
        onClick={async () => {
          if (!confirm(`Supprimer le jour « ${day.name} » ? L’historique des séances est conservé.`)) return;
          await db.days.delete(day.id);
          onDeleted();
        }}
      >
        Supprimer ce jour
      </button>

      <ExercisePicker
        open={adding}
        onClose={() => setAdding(false)}
        exercises={library}
        title="Ajouter au jour"
        onCreate={async (name) => {
          const e = newExercise(name, settings);
          await db.exercises.put(e);
          setAdding(false);
          setItems([...day.items, makeItem(e.id)]);
        }}
        onPick={(e) => {
          setAdding(false);
          setItems([...day.items, makeItem(e.id)]);
        }}
      />
      <ExercisePicker
        open={!!replacing}
        onClose={() => setReplacing(null)}
        exercises={library}
        excludeId={replacing?.exerciseId}
        preferMuscle={replacing ? exMap.get(replacing.exerciseId)?.primaryMuscle : undefined}
        title="Remplacer par…"
        onPick={(e) => {
          const r = replacing!;
          setReplacing(null);
          setItems(day.items.map((x) => (x.id === r.id ? { ...x, exerciseId: e.id } : x)));
        }}
      />
      <Sheet open={!!moving} onClose={() => setMoving(null)} title="Déplacer vers…">
        <div className="space-y-2">
          {days
            .filter((d) => d.id !== day.id)
            .map((d) => (
              <button
                key={d.id}
                className="btn-ghost w-full"
                onClick={async () => {
                  const it = moving!;
                  setMoving(null);
                  await db.transaction('rw', db.days, async () => {
                    await db.days.update(day.id, { items: day.items.filter((x) => x.id !== it.id) });
                    const target = await db.days.get(d.id);
                    if (target) await db.days.update(d.id, { items: [...target.items, it] });
                  });
                }}
              >
                {d.name}
              </button>
            ))}
        </div>
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? exMap.get(editing.exerciseId)?.name ?? '' : ''}>
        {editing && (
          <ItemForm
            item={editing}
            ex={exMap.get(editing.exerciseId)}
            onSave={(it) => {
              setEditing(null);
              setItems(day.items.map((x) => (x.id === it.id ? it : x)));
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

const makeItem = (exerciseId: string): ProgramItem => ({ id: uid(), exerciseId, sets: 3, repMin: 8, repMax: 12, rirTarget: 1, restSec: null, notes: '' });

function SortableItem({
  item,
  ex,
  globalRest,
  onEdit,
  onReplace,
  onMove,
  onDelete
}: {
  item: ProgramItem;
  ex: Exercise | undefined;
  globalRest: number;
  onEdit: () => void;
  onReplace: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const rest = item.restSec ?? ex?.restSec ?? globalRest;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card p-3 ${isDragging ? 'z-10 ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="touch-none px-2 text-2xl text-mute min-h-[48px]"
          aria-label="Glisser pour réordonner"
        >
          ⠿
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <div className="font-semibold truncate">{ex?.name ?? 'Exercice supprimé'}</div>
          <div className="text-xs text-mute">
            {item.sets} × {item.repMin}–{item.repMax} · {item.rirTarget} RIR · repos {fmtClock(rest)}
          </div>
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="btn-ghost btn-sm px-2" onClick={onReplace}>
          🔄 Remplacer
        </button>
        <button className="btn-ghost btn-sm px-2" onClick={onMove}>
          ↪ Déplacer
        </button>
        <button className="btn-ghost btn-sm px-2 text-bad" onClick={onDelete}>
          Retirer
        </button>
      </div>
    </li>
  );
}

function ItemForm({ item, ex, onSave }: { item: ProgramItem; ex: Exercise | undefined; onSave: (i: ProgramItem) => void }) {
  const [it, setIt] = useState(item);
  const up = (p: Partial<ProgramItem>) => setIt({ ...it, ...p });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Sets">
          <NumInput value={it.sets} onChange={(v) => up({ sets: Math.max(1, Math.round(v ?? 1)) })} />
        </Field>
        <Field label="Reps min">
          <NumInput value={it.repMin} onChange={(v) => up({ repMin: v ?? 1 })} />
        </Field>
        <Field label="Reps max">
          <NumInput value={it.repMax} onChange={(v) => up({ repMax: v ?? 1 })} />
        </Field>
      </div>
      <Field label="RIR cible">
        <Segmented value={it.rirTarget} onChange={(rirTarget) => up({ rirTarget })} options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} size="lg" />
      </Field>
      <Field label={`Repos (s) — vide = ${ex?.restSec != null ? 'celui de l’exercice' : 'réglage global'}`}>
        <NumInput value={it.restSec} onChange={(v) => up({ restSec: v })} placeholder="par défaut" />
      </Field>
      <Field label="Notes (affichées en séance)">
        <textarea className="input py-2" rows={2} value={it.notes} onChange={(e) => up({ notes: e.target.value })} />
      </Field>
      <p className="text-xs text-mute">Unité, incrément, muscles et réglages machine se modifient dans la Bibliothèque.</p>
      <button className="btn-primary w-full" disabled={it.repMax < it.repMin} onClick={() => onSave(it)}>
        Enregistrer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- bibliothèque

function Library({ library, settings }: { library: Exercise[]; settings: Settings }) {
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [q, setQ] = useState('');
  const shown = library.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()) || e.primaryMuscle.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" onClick={() => setEditing(newExercise(q.trim() || '', settings))}>
          + Nouveau
        </button>
      </div>
      <ul className="card divide-y divide-line/60 p-0">
        {shown.map((e) => (
          <li key={e.id}>
            <button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left min-h-[56px]" onClick={() => setEditing(e)}>
              <div className="min-w-0">
                <div className="font-medium truncate">{e.name}</div>
                <div className="text-xs text-mute truncate">
                  {e.type === 'compound' ? 'Composé' : 'Isolation'} · {e.unit} · +{e.increment} · plates {e.loadMode === 'perSide' ? 'par côté' : 'au total'}
                  {e.secondaryMuscles.length ? ` · ${e.secondaryMuscles.join(', ')}` : ''}
                </div>
              </div>
              <span className="chip whitespace-nowrap">{e.primaryMuscle}</span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.name || 'Nouvel exercice'}>
        {editing && (
          <>
            <ExerciseForm
              key={editing.id}
              value={editing}
              onCancel={() => setEditing(null)}
              onSave={async (e) => {
                await db.exercises.put(e);
                setEditing(null);
              }}
            />
            {library.some((x) => x.id === editing.id) && (
              <button
                className="btn-ghost mt-3 w-full text-bad"
                onClick={async () => {
                  const used = (await db.days.toArray()).some((d) => d.items.some((i) => i.exerciseId === editing.id));
                  if (used) return alert('Cet exercice est utilisé dans le programme : retire-le des jours d’abord.');
                  if (!confirm('Archiver cet exercice ? Son historique reste dans Progrès.')) return;
                  await db.exercises.update(editing.id, { archived: true });
                  setEditing(null);
                }}
              >
                Archiver l’exercice
              </button>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
