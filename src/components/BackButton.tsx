import { ChevronLeft } from '../ui/icons';

/** Retour à l'écran précédent (le geste de balayage d'iOS fait la même chose). */
export function BackButton({ fallback, label = 'Retour' }: { fallback: string; label?: string }) {
  return (
    <button
      className="btn btn-secondary btn-sm mb-3 pl-2"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.hash = '/' + fallback;
      }}
    >
      <ChevronLeft size={18} /> {label}
    </button>
  );
}
