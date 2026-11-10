/**
 * Calques au-dessus de l'app : panneaux du bas (Sheet), dialogues de confirmation / saisie, toasts.
 * Tout est en bas de l'écran pour rester atteignable au pouce sur un grand iPhone.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------- clavier iOS

/** Hauteur occupée par le clavier virtuel (0 s'il est fermé). */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

let locks = 0;
function lockScroll() {
  locks++;
  document.documentElement.style.overflow = 'hidden';
  return () => {
    locks = Math.max(0, locks - 1);
    if (!locks) document.documentElement.style.overflow = '';
  };
}

// ---------------------------------------------------------------- Sheet

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Pied personnalisé (boutons d'action). Par défaut : un bouton « Fermer ». `null` : pas de pied. */
  footer?: ReactNode | null;
  closeLabel?: string;
}

/** Panneau qui monte du bas de l'écran. Se ferme en tapant à côté, avec le bouton du bas ou en le tirant vers le bas. */
export function Sheet({ open, onClose, title, subtitle, children, footer, closeLabel = 'Fermer' }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const kb = useKeyboardInset(mounted);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDrag(0);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => (mounted ? lockScroll() : undefined), [mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      startY.current = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (startY.current != null) setDrag(Math.max(0, e.clientY - startY.current));
    },
    onPointerUp: () => {
      if (startY.current == null) return;
      startY.current = null;
      if (drag > 90) onClose();
      else setDrag(0);
    },
    onPointerCancel: () => {
      startY.current = null;
      setDrag(0);
    },
    style: { touchAction: 'none' as const }
  };

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
        style={{ touchAction: 'none' }}
        onClick={onClose}
      />
      <div
        className={`sheet-max absolute inset-x-0 mx-auto flex max-w-xl flex-col rounded-t-[28px] border-t border-line bg-surface shadow-2xl ${
          drag ? '' : 'transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]'
        }`}
        style={{
          bottom: kb,
          transform: shown ? `translateY(${drag}px)` : 'translateY(105%)',
          ...(kb ? { maxHeight: `calc(100% - ${kb}px - 24px)` } : null)
        }}
      >
        <div className="shrink-0 cursor-grab" {...dragProps}>
          <div className="flex justify-center pb-1 pt-2.5">
            <div className="h-1.5 w-10 rounded-full bg-hover" />
          </div>
          <header className="px-5 pb-3 pt-1">
            <h2 className="title-lg">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-mute">{subtitle}</div>}
          </header>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer === null ? (
          <div className="shrink-0" style={{ height: kb ? 0 : 'env(safe-area-inset-bottom)' }} />
        ) : (
          <footer className="shrink-0 border-t border-line/60 px-5 pt-3" style={{ paddingBottom: kb ? 12 : 'max(16px, env(safe-area-inset-bottom))' }}>
            {footer ?? (
              <button className="btn btn-secondary w-full" onClick={onClose}>
                {closeLabel}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------- dialogues

interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts {
  title: string;
  message?: ReactNode;
  initial?: string;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: 'text' | 'decimal' | 'numeric';
  confirmLabel?: string;
}
type Req =
  | ({ kind: 'confirm'; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ kind: 'prompt'; resolve: (v: string | null) => void } & PromptOpts);

let pushDialog: ((r: Req) => void) | null = null;

/** Remplace confirm() / prompt() du navigateur par des panneaux au style de l'app. */
export const dialog = {
  confirm(opts: ConfirmOpts): Promise<boolean> {
    if (!pushDialog) return Promise.resolve(window.confirm(opts.title));
    return new Promise((resolve) => pushDialog!({ kind: 'confirm', resolve, ...opts }));
  },
  prompt(opts: PromptOpts): Promise<string | null> {
    if (!pushDialog) return Promise.resolve(window.prompt(opts.title, opts.initial ?? ''));
    return new Promise((resolve) => pushDialog!({ kind: 'prompt', resolve, ...opts }));
  }
};

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    pushDialog = (r) => {
      setReq(r);
      setText(r.kind === 'prompt' ? r.initial ?? '' : '');
      setOpen(true);
    };
    return () => {
      pushDialog = null;
    };
  }, []);

  if (!req) return null;
  const finish = (ok: boolean) => {
    setOpen(false);
    if (req.kind === 'confirm') req.resolve(ok);
    else req.resolve(ok ? text : null);
  };
  const confirmLabel = req.confirmLabel ?? (req.kind === 'confirm' ? 'Confirmer' : 'Enregistrer');
  const danger = req.kind === 'confirm' && req.danger;

  return (
    <Sheet
      open={open}
      onClose={() => finish(false)}
      title={req.title}
      footer={
        <div className="flex gap-2">
          <button className="btn btn-secondary flex-1" onClick={() => finish(false)}>
            {(req.kind === 'confirm' && req.cancelLabel) || 'Annuler'}
          </button>
          <button className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => finish(true)}>
            {confirmLabel}
          </button>
        </div>
      }
    >
      {req.message && <div className="text-[15px] leading-relaxed text-mute">{req.message}</div>}
      {req.kind === 'prompt' &&
        (req.multiline ? (
          <textarea className="input mt-3" rows={3} autoFocus value={text} placeholder={req.placeholder} onChange={(e) => setText(e.target.value)} />
        ) : (
          <input
            className="input mt-3"
            autoFocus
            value={text}
            inputMode={req.inputMode ?? 'text'}
            placeholder={req.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && finish(true)}
          />
        ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------- toasts

type Tone = 'default' | 'good' | 'gold' | 'bad';
interface ToastItem {
  id: number;
  text: ReactNode;
  tone: Tone;
  icon?: ReactNode;
}
let pushToast: ((t: ToastItem, ms: number) => void) | null = null;
let toastId = 0;

/** Message bref en bas de l'écran, juste au-dessus des onglets. */
export function toast(text: ReactNode, opts: { tone?: Tone; icon?: ReactNode; ms?: number } = {}) {
  pushToast?.({ id: ++toastId, text, tone: opts.tone ?? 'default', icon: opts.icon }, opts.ms ?? 2600);
}

const TOAST_TONE: Record<Tone, string> = {
  default: 'border-line bg-raised text-ink',
  good: 'border-good/40 bg-raised text-ink',
  gold: 'border-gold/50 bg-raised text-ink',
  bad: 'border-bad/40 bg-raised text-ink'
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    pushToast = (t, ms) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), ms);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  if (!items.length) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(var(--bottom-h) + 12px)' }} aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex max-w-full animate-toast-in items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl shadow-black/40 ${TOAST_TONE[t.tone]}`}
        >
          {t.icon}
          <span className="min-w-0">{t.text}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}
