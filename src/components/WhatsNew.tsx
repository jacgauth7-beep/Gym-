import { useEffect, useSyncExternalStore } from 'react';
import { APP_VERSION } from '../lib/pwa';
import { BatteryCharging, BookOpen, ChartColumn, Dumbbell, History, Lightbulb, Scale, Smartphone, Sparkles, Target } from '../ui/icons';
import { Sheet } from '../ui/overlay';

let open = false;
const listeners = new Set<() => void>();
const set = (v: boolean) => {
  open = v;
  listeners.forEach((l) => l());
};
export const openWhatsNew = () => set(true);

const KEY = 'seenVersion';
export function markVersionSeen() {
  try {
    localStorage.setItem(KEY, APP_VERSION);
  } catch {
    /* ignoré */
  }
}

const NEWS = [
  { Icon: Sparkles, title: 'Nouveau design', text: 'Plus lisible, plus rapide, pensé pour une seule main.' },
  { Icon: Dumbbell, title: 'Saisie sans clavier', text: 'Boutons + et − pour la charge et les reps. Les plates se règlent directement : « 2 plates + 25 ».' },
  { Icon: Target, title: 'Cibles plus justes', text: 'En reps entières, réparties sur tes sets, et ajustées à ta forme du jour après chaque set validé.' },
  { Icon: Lightbulb, title: 'Coach', text: 'Il lit ton volume, ton effort, tes repos et ta fatigue, et te dit quoi corriger en premier.' },
  { Icon: ChartColumn, title: 'Analyse du programme', text: 'Le volume prévu par muscle et la durée de chaque séance, avant même de t’entraîner.' },
  { Icon: History, title: 'Historique', text: 'Toutes tes séances dans un calendrier. Tu peux corriger ou supprimer un set après coup.' },
  { Icon: Scale, title: 'Poids, protéines et sommeil', text: 'Tendance lissée, vitesse de prise ou de perte, cible de protéines, sommeil en un tap.' },
  { Icon: BatteryCharging, title: 'Semaine de décharge', text: 'Proposée quand la fatigue s’installe. Moins de sets, plus loin de l’échec, mêmes charges.' },
  { Icon: Smartphone, title: 'Écran allumé', text: 'L’écran reste allumé pendant la séance et le minuteur indique ce qui vient ensuite.' },
  { Icon: BookOpen, title: 'Guide scientifique', text: 'Ce que dit la recherche récente et comment l’app l’applique, avec les références.' }
];

/** Présente les nouveautés une seule fois après une mise à jour (et à la demande depuis Réglages). */
export function WhatsNew() {
  const isOpen = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open
  );
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== APP_VERSION) set(true);
    } catch {
      /* stockage indisponible : on n'insiste pas */
    }
  }, []);
  const close = () => {
    markVersionSeen();
    set(false);
  };
  return (
    <Sheet open={isOpen} onClose={close} title="Quoi de neuf" subtitle={`Version ${APP_VERSION}. Tes données sont intactes.`} closeLabel="C’est parti">
      <ul className="space-y-4">
        {NEWS.map(({ Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="tone-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Icon size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="block text-[13px] leading-relaxed text-mute">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
