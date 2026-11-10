import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db, usesPlates } from '../db';
import { useDays, useExercises } from '../hooks';
import { ExerciseForm } from '../components/ExerciseForm';
import { ExercisePicker } from '../components/ExercisePicker';
import { MuscleBars } from '../components/MuscleBars';
import { estimateDayMinutes, plannedWeekly } from '../lib/engine';
import { discardEmptyActive } from '../lib/session';
import { WEEKDAYS_FR, fmt, fmtClock, plural, uid } from '../lib/util';
import { MAJOR_MUSCLES, MUSCLES, type Exercise, type ProgramDay, type ProgramItem, type Settings } from '../types';
import { ArrowLeftRight, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Ellipsis, GripVertical, Library as LibraryIcon, Pencil, Plus, Search, Trash2 } from '../ui/icons';
import { EmptyState, Field, IconButton, ListRow, PageHeader, RestPicker, SectionHeader, Segmented, Stepper, cx } from '../ui/kit';
import { Sheet, dialog, toast } from '../ui/overlay';

export function newExercise(name: string, settings: Settings): Exercise {
  return {
    id: uid(),
    name,
    primaryMuscle: 'Pectoraux',
    secondaryMuscles: [],
    type: 'compound',
    unit: settings.defaultUnit,
    increment: settings.defaultUnit === 'kg' ? 2.5 : 5,
    loadMode: 'total',
    baseWeight: 0,
    restSec: null,
    setupNotes: '',
    plates: false
  };
}

const makeItem = (exerciseId: string): ProgramItem => ({ id: uid(), exerciseId, sets: 3, repMin: 8, repMax: 12, rirTarget: 1, restSec: null, notes: '' });

/** Toute modification du programme invalide un éventuel brouillon de séance déjà créé. */
async function saveDay(id: string, patch: Partial<ProgramDay>) {
  await db.days.update(id, patch);
  await discardEmptyActive();
}

type View = 'split' | 'analyse' | 'library';

export function Program({ settings }: { settings: Settings }) {
  const days = useDays();
  const { list: library, map: exMap } = useExercises();
  const [view, setView] = useState<View>('split');
  const [dayId, setDayId] = useState<string | null>(null);
  if (!days || !library) return null;
  const today = new Date().getDay();
  const day = days.find((d) => d.id === dayId) ?? days.find((d) => d.weekdays.includes(today)) ?? days[0];

  async function addDay() {
    const name = await dialog.prompt({ title: 'Nouveau jour', initial: `Jour ${days!.length + 1}`, placeholder: 'Push, Jambes, Haut du corps…', confirmLabel: 'Créer' });
    if (!name?.trim()) return;
    const d: ProgramDay = { id: uid(), name: name.trim(), order: days!.length, weekdays: [], items: [] };
    await db.days.put(d);
    await discardEmptyActive();
    setDayId(d.id);
  }

  return (
    <div>
      <PageHeader title="Programme" />
      <Segmented
        value={view}
        onChange={setView}
        size="lg"
        tone="neutral"
        ariaLabel="Vue du programme"
        options={[
          { value: 'split', label: 'Split' },
          { value: 'analyse', label: 'Analyse' },
          { value: 'library', label: 'Exercices' }
        ]}
      />
      <div className="mt-4">
        {view === 'library' && <Library library={library} settings={settings} />}
        {view === 'analyse' && <Analysis days={days} exMap={exMap} settings={settings} />}
        {view === 'split' &&
          (days.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={26} />}
              title="Ton split est vide"
              action={
                <button className="btn btn-primary w-full" onClick={addDay}>
                  <Plus size={18} /> Créer un premier jour
                </button>
              }
            >
              Crée un jour par séance (Push, Pull, Jambes…), puis ajoute ses exercices.
            </EmptyState>
          ) : (
            <>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {days.map((d) => (
                  <button key={d.id} onClick={() => setDayId(d.id)} className={cx('btn btn-sm shrink-0', d.id === day?.id ? 'bg-accent text-white' : 'btn-secondary')}>
                    {d.name}
                  </button>
                ))}
                <button className="btn btn-sm btn-tonal shrink-0" onClick={addDay}>
                  <Plus size={16} /> Jour
                </button>
              </div>
              {day && <DayEditor key={day.id} day={day} days={days} library={library} exMap={exMap} settings={settings} onDeleted={() => setDayId(null)} />}
            </>
          ))}
      </div>
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
  const [sheet, setSheet] = useState<null | 'add' | 'menu'>(null);
  const [replacing, setReplacing] = useState<ProgramItem | null>(null);
  const [editing, setEditing] = useState<ProgramItem | null>(null);
  const [moving, setMoving] = useState<ProgramItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const setItems = (items: ProgramItem[]) => saveDay(day.id, { items });

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

  const totalSets = day.items.reduce((a, it) => a + it.sets, 0);
  const idx = [...days].sort((a, b) => a.order - b.order).findIndex((d) => d.id === day.id);

  return (
    <div className="mt-3">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="title-lg break-words">{day.name}</h2>
            <p className="num mt-0.5 text-xs text-faint">
              {day.items.length} {plural(day.items.length, 'exercice')} · {totalSets} sets · ≈ {estimateDayMinutes(day, exMap, settings.defaultRestSec)} min
            </p>
          </div>
          <IconButton label="Options du jour" onClick={() => setSheet('menu')}>
            <Ellipsis size={20} />
          </IconButton>
        </div>
        <div className="mt-3">
          <div className="eyebrow mb-1.5">Jours de la semaine</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
              const on = day.weekdays.includes(wd);
              const taken = !on && days.some((d) => d.id !== day.id && d.weekdays.includes(wd));
              return (
                <button
                  key={wd}
                  onClick={() => saveDay(day.id, { weekdays: on ? day.weekdays.filter((x) => x !== wd) : [...day.weekdays, wd] })}
                  className={cx('min-h-[40px] flex-1 rounded-xl text-[13px] font-semibold transition', on ? 'bg-accent text-white' : taken ? 'bg-raised/50 text-faint/60' : 'bg-raised text-mute')}
                  aria-pressed={on}
                  aria-label={`${WEEKDAYS_FR[wd]}${taken ? ' (déjà pris par un autre jour)' : ''}`}
                >
                  {WEEKDAYS_FR[wd]}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">Sans jour coché, les séances s’enchaînent dans l’ordre (rotation).</p>
        </div>
      </div>

      {day.items.length > 1 && (
        <p className="mb-2 mt-4 flex items-center gap-1.5 px-1 text-xs text-faint">
          <GripVertical size={14} /> Maintiens la poignée puis glisse pour réordonner.
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={day.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className={cx('space-y-2', day.items.length <= 1 && 'mt-3')}>
            {day.items.map((it, i) => (
              <SortableItem key={it.id} n={i + 1} item={it} ex={exMap.get(it.exerciseId)} globalRest={settings.defaultRestSec} onEdit={() => setEditing(it)} onReplace={() => setReplacing(it)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <button className="btn btn-primary mt-3 w-full" onClick={() => setSheet('add')}>
        <Plus size={18} /> Ajouter un exercice
      </button>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={day.name} subtitle="Options du jour">
        <div className="card divide-y divide-line/60 overflow-hidden">
          <ListRow
            icon={<Pencil size={18} />}
            title="Renommer"
            onClick={async () => {
              setSheet(null);
              const name = await dialog.prompt({ title: 'Nom du jour', initial: day.name });
              if (name?.trim()) saveDay(day.id, { name: name.trim() });
            }}
          />
          <ListRow icon={<ChevronLeft size={18} />} iconTone="mute" title="Avancer dans l’ordre" subtitle={`Position ${idx + 1} sur ${days.length}`} onClick={() => moveDay(-1)} chevron={false} />
          <ListRow icon={<ChevronRight size={18} />} iconTone="mute" title="Reculer dans l’ordre" onClick={() => moveDay(1)} chevron={false} />
          <ListRow
            icon={<Trash2 size={18} />}
            iconTone="bad"
            danger
            title="Supprimer ce jour"
            chevron={false}
            onClick={async () => {
              setSheet(null);
              if (!(await dialog.confirm({ title: `Supprimer « ${day.name} » ?`, message: 'L’historique de tes séances est conservé.', confirmLabel: 'Supprimer', danger: true }))) return;
              await db.days.delete(day.id);
              await discardEmptyActive();
              onDeleted();
            }}
          />
        </div>
      </Sheet>

      <ExercisePicker
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        exercises={library}
        title="Ajouter au jour"
        subtitle={day.name}
        onCreate={async (name) => {
          const e = newExercise(name, settings);
          await db.exercises.put(e);
          setSheet(null);
          await setItems([...day.items, makeItem(e.id)]);
          toast('Exercice créé. Règle ses détails dans « Exercices ».');
        }}
        onPick={(e) => {
          setSheet(null);
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
        subtitle="Sets, reps et repos sont conservés."
        onPick={(e) => {
          const r = replacing!;
          setReplacing(null);
          setItems(day.items.map((x) => (x.id === r.id ? { ...x, exerciseId: e.id } : x)));
        }}
      />
      <Sheet open={!!moving} onClose={() => setMoving(null)} title="Déplacer vers…" subtitle={moving ? exMap.get(moving.exerciseId)?.name : undefined} closeLabel="Annuler">
        <div className="space-y-2">
          {days
            .filter((d) => d.id !== day.id)
            .map((d) => (
              <button
                key={d.id}
                className="btn btn-secondary w-full justify-between"
                onClick={async () => {
                  const it = moving!;
                  setMoving(null);
                  await db.transaction('rw', db.days, async () => {
                    await db.days.update(day.id, { items: day.items.filter((x) => x.id !== it.id) });
                    const target = await db.days.get(d.id);
                    if (target) await db.days.update(d.id, { items: [...target.items, it] });
                  });
                  await discardEmptyActive();
                  toast(`Déplacé vers ${d.name}`);
                }}
              >
                {d.name} <ArrowRight size={18} className="text-faint" />
              </button>
            ))}
        </div>
      </Sheet>
      {editing && (
        <ItemSheet
          item={editing}
          ex={exMap.get(editing.exerciseId)}
          globalRest={settings.defaultRestSec}
          canMove={days.length > 1}
          onClose={() => setEditing(null)}
          onSave={(it) => {
            setEditing(null);
            setItems(day.items.map((x) => (x.id === it.id ? it : x)));
          }}
          onMove={() => {
            setMoving(editing);
            setEditing(null);
          }}
          onReplace={() => {
            setReplacing(editing);
            setEditing(null);
          }}
          onRemove={() => {
            const it = editing;
            setEditing(null);
            setItems(day.items.filter((x) => x.id !== it.id));
          }}
        />
      )}
    </div>
  );
}

function SortableItem({
  n,
  item,
  ex,
  globalRest,
  onEdit,
  onReplace
}: {
  n: number;
  item: ProgramItem;
  ex: Exercise | undefined;
  globalRest: number;
  onEdit: () => void;
  onReplace: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const rest = item.restSec ?? ex?.restSec ?? globalRest;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('card flex items-center', isDragging && 'relative z-10 shadow-2xl shadow-black/50 ring-2 ring-accent')}>
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="flex min-h-[64px] w-11 shrink-0 touch-none items-center justify-center text-faint" aria-label="Glisser pour réordonner">
        <GripVertical size={20} />
      </button>
      <button className="min-w-0 flex-1 py-2.5 text-left" onClick={onEdit}>
        <span className="block truncate text-[15px] font-semibold">
          <span className="num mr-1.5 text-faint">{n}</span>
          {ex?.name ?? 'Exercice supprimé'}
        </span>
        <span className="num block truncate text-xs text-faint">
          {item.sets} × {item.repMin}–{item.repMax} · {item.rirTarget} RIR · {fmtClock(rest)}
          {ex && ` · ${ex.primaryMuscle}`}
        </span>
      </button>
      <button className="flex min-h-[64px] w-12 shrink-0 items-center justify-center text-mute active:text-accent" onClick={onReplace} aria-label="Remplacer cet exercice">
        <ArrowLeftRight size={19} />
      </button>
    </li>
  );
}

function ItemSheet({
  item,
  ex,
  globalRest,
  canMove,
  onClose,
  onSave,
  onMove,
  onReplace,
  onRemove
}: {
  item: ProgramItem;
  ex: Exercise | undefined;
  globalRest: number;
  canMove: boolean;
  onClose: () => void;
  onSave: (i: ProgramItem) => void;
  onMove: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const [it, setIt] = useState(item);
  const up = (p: Partial<ProgramItem>) => setIt({ ...it, ...p });
  const valid = it.sets >= 1 && it.repMin >= 1 && it.repMax >= it.repMin;
  return (
    <Sheet
      open
      onClose={onClose}
      title={ex?.name ?? 'Exercice'}
      subtitle={ex ? `${ex.primaryMuscle} · ${ex.type === 'compound' ? 'composé' : 'isolation'} · ${ex.unit}` : undefined}
      footer={
        <div className="flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary flex-1" disabled={!valid} onClick={() => onSave(it)}>
            Enregistrer
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <Stepper ariaLabel="Nombre de sets" label="Sets" value={it.sets} onChange={(v) => up({ sets: Math.max(1, Math.round(v ?? 1)) })} min={1} max={12} format={(v) => String(v)} />
        <div>
          <div className="eyebrow mb-1.5">Fourchette de reps</div>
          <div className="grid grid-cols-2 gap-2">
            <Stepper ariaLabel="Reps minimum" value={it.repMin} onChange={(v) => up({ repMin: Math.max(1, Math.round(v ?? 1)), repMax: Math.max(it.repMax, Math.round(v ?? 1)) })} min={1} max={50} unit="minimum" format={(v) => String(v)} />
            <Stepper ariaLabel="Reps maximum" value={it.repMax} onChange={(v) => up({ repMax: Math.max(1, Math.round(v ?? 1)), repMin: Math.min(it.repMin, Math.max(1, Math.round(v ?? 1))) })} min={1} max={50} unit="maximum" format={(v) => String(v)} />
          </div>
          <p className="mt-1.5 text-xs text-faint">Le moteur monte les reps jusqu’au maximum, puis la charge.</p>
        </div>
        <Field label="Reps en réserve visées (RIR)" hint="0 = échec. 1 à 2 donne presque les mêmes gains avec moins de fatigue.">
          <Segmented value={it.rirTarget} onChange={(rirTarget) => up({ rirTarget })} options={[0, 1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))} size="lg" />
        </Field>
        <Field label="Temps de repos">
          <RestPicker value={it.restSec} onChange={(restSec) => up({ restSec })} defaultSec={ex?.restSec ?? globalRest} defaultLabel={ex?.restSec != null ? 'repos de l’exercice' : 'repos global'} />
        </Field>
        <Field label="Note affichée en séance" htmlFor="item-note">
          <textarea id="item-note" className="input" rows={2} value={it.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Consigne technique, variante…" />
        </Field>
        <div className="card divide-y divide-line/60 overflow-hidden">
          <ListRow icon={<ArrowLeftRight size={18} />} title="Remplacer par un autre exercice" onClick={onReplace} />
          {canMove && <ListRow icon={<ArrowRight size={18} />} iconTone="mute" title="Déplacer vers un autre jour" onClick={onMove} />}
          <ListRow icon={<Trash2 size={18} />} iconTone="bad" danger title="Retirer de ce jour" onClick={onRemove} chevron={false} />
        </div>
        <p className="text-xs text-faint">Unité, incrément, plates, muscles et réglages machine se modifient dans l’onglet « Exercices ».</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- analyse

function Analysis({ days, exMap, settings }: { days: ProgramDay[]; exMap: Map<string, Exercise>; settings: Settings }) {
  const p = settings.engine;
  const planned = plannedWeekly(days, exMap, p);
  const rows = [...planned.entries()].map(([muscle, v]) => ({ muscle, sets: v.sets, freq: v.freq }));
  const usesWeek = days.some((d) => d.weekdays.length > 0);
  const low = rows.filter((r) => MAJOR_MUSCLES.has(r.muscle) && r.sets < p.volumeLow - 0.25).sort((a, b) => a.sets - b.sets);
  const high = rows.filter((r) => MAJOR_MUSCLES.has(r.muscle) && r.sets > p.volumeHigh * 1.25);
  const once = rows.filter((r) => MAJOR_MUSCLES.has(r.muscle) && r.freq === 1 && (planned.get(r.muscle)?.direct ?? 0) > 0);
  const missing = MUSCLES.filter((m) => MAJOR_MUSCLES.has(m) && !planned.has(m));

  if (!days.length || !rows.length) {
    return (
      <EmptyState icon={<CalendarDays size={26} />} title="Rien à analyser">
        Ajoute des exercices à ton split : tu verras ici le volume par muscle avant même de t’entraîner.
      </EmptyState>
    );
  }
  return (
    <div>
      <div className="card p-4">
        <h2 className="headline">Volume prévu par {usesWeek ? 'semaine' : 'cycle'}</h2>
        <p className="mb-3 mt-0.5 text-xs text-faint">
          Sets durs par muscle si tu fais toutes tes séances. Muscle secondaire = {fmt(p.secondaryWeight, 2)} set. Le « 2× » est le nombre de séances qui le travaillent.
        </p>
        <MuscleBars rows={rows} low={p.volumeLow} high={p.volumeHigh} />
      </div>

      <SectionHeader title="Lecture" />
      <div className="card space-y-3 p-4 text-sm leading-relaxed">
        {low.length === 0 && high.length === 0 && missing.length === 0 ? (
          <p>
            <b className="text-good">Programme équilibré.</b> Tous tes muscles principaux sont dans la zone {p.volumeLow}–{p.volumeHigh} sets.
          </p>
        ) : (
          <>
            {low.length > 0 && (
              <p>
                <b className="text-warn">Sous la zone :</b> {low.map((r) => `${r.muscle} (${fmt(r.sets)})`).join(', ')}. Ajoute 2 à 4 sets par semaine si tu veux développer {low.length > 1 ? 'ces muscles' : 'ce muscle'}.
              </p>
            )}
            {missing.length > 0 && (
              <p>
                <b className="text-warn">Aucun travail prévu :</b> {missing.join(', ')}.
              </p>
            )}
            {high.length > 0 && (
              <p>
                <b>Très élevé :</b> {high.map((r) => `${r.muscle} (${fmt(r.sets)})`).join(', ')}. Au-delà de {p.volumeHigh} sets, chaque set rapporte moins : garde ce volume seulement si tu récupères bien.
              </p>
            )}
          </>
        )}
        {usesWeek && once.length > 0 && (
          <p className="text-mute">
            Travaillé une seule fois par semaine : {once.map((r) => r.muscle).join(', ')}. Ce n’est pas un problème si le volume y est, mais deux séances gardent des sets de meilleure qualité.
          </p>
        )}
        <a className="inline-flex items-center gap-1 font-semibold text-accent" href="#/reglages/guide/volume">
          Ce que dit la recherche <ChevronRight size={15} />
        </a>
      </div>

      <SectionHeader title="Durée estimée" />
      <div className="card divide-y divide-line/60 overflow-hidden">
        {days.map((d) => (
          <div key={d.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{d.name}</span>
              <span className="block truncate text-xs text-faint">
                {d.weekdays.length ? [...d.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((w) => WEEKDAYS_FR[w]).join(', ') : 'Rotation'} · {d.items.reduce((a, it) => a + it.sets, 0)} sets
              </span>
            </span>
            <span className="num text-sm font-semibold">≈ {estimateDayMinutes(d, exMap, settings.defaultRestSec)} min</span>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-faint">Estimation : tes temps de repos, environ 45 s d’effort par set et 2 min d’installation par exercice.</p>
    </div>
  );
}

// ---------------------------------------------------------------- bibliothèque

function Library({ library, settings }: { library: Exercise[]; settings: Settings }) {
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [q, setQ] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const shown = library.filter((e) => norm(e.name).includes(norm(q)) || norm(e.primaryMuscle).includes(norm(q)));
  const groups = new Map<string, Exercise[]>();
  for (const e of shown) groups.set(e.primaryMuscle, [...(groups.get(e.primaryMuscle) ?? []), e]);
  const order = [...groups.keys()].sort((a, b) => (MUSCLES as readonly string[]).indexOf(a) - (MUSCLES as readonly string[]).indexOf(b));
  const isNew = !!editing && !library.some((x) => x.id === editing.id);

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input pl-10" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary shrink-0" onClick={() => setEditing(newExercise(q.trim(), settings))}>
          <Plus size={18} /> Nouveau
        </button>
      </div>
      {shown.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={<LibraryIcon size={26} />} title="Aucun exercice">
            Crée ton premier exercice avec le bouton « Nouveau ».
          </EmptyState>
        </div>
      )}
      {order.map((muscle) => (
        <section key={muscle}>
          <SectionHeader title={muscle} />
          <ul className="card divide-y divide-line/60 overflow-hidden">
            {groups.get(muscle)!.map((e) => (
              <li key={e.id}>
                <button className="flex min-h-[58px] w-full items-center gap-3 px-4 py-2 text-left active:bg-raised/60" onClick={() => setEditing(e)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{e.name}</span>
                    <span className="num block truncate text-xs text-faint">
                      {e.type === 'compound' ? 'Composé' : 'Isolation'} · saut {fmt(e.increment)} {e.unit}
                      {usesPlates(e) ? ` · plates ${e.loadMode === 'perSide' ? 'par côté' : 'au total'}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={isNew ? 'Nouvel exercice' : (editing?.name ?? '')} footer={null}>
        {editing && (
          <>
            <ExerciseForm
              key={editing.id}
              value={editing}
              globalRest={settings.defaultRestSec}
              onCancel={() => setEditing(null)}
              onSave={async (e) => {
                await db.exercises.put(e);
                setEditing(null);
                toast('Exercice enregistré');
              }}
            />
            {!isNew && (
              <button
                className="btn btn-danger mt-3 w-full"
                onClick={async () => {
                  const used = (await db.days.toArray()).some((d) => d.items.some((i) => i.exerciseId === editing.id));
                  if (used) {
                    toast('Exercice utilisé dans ton split : retire-le d’abord des jours.', { tone: 'bad' });
                    return;
                  }
                  if (!(await dialog.confirm({ title: 'Archiver cet exercice ?', message: 'Il disparaît des listes, mais son historique reste visible dans Progrès.', confirmLabel: 'Archiver', danger: true }))) return;
                  await db.exercises.update(editing.id, { archived: true });
                  setEditing(null);
                }}
              >
                <Trash2 size={18} /> Archiver l’exercice
              </button>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
