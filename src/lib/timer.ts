/**
 * Minuteur de repos basé sur l'horodatage : on stocke l'instant de fin,
 * pas un compteur. Le temps restant est toujours recalculé depuis Date.now(),
 * il reste donc juste même si iOS met l'app en pause (écran verrouillé, arrière-plan).
 * L'état est persisté dans localStorage pour survivre à un rechargement.
 */
import { useSyncExternalStore } from 'react';

export interface TimerState {
  /** Fin prévue (ms) si en cours. */
  endAt: number | null;
  /** Temps restant figé (ms) si en pause. */
  pausedLeft: number | null;
  durationMs: number;
  label: string;
  /** Fin déjà signalée (son/vibration) ? */
  fired: boolean;
}

const KEY = 'rest-timer';
const idle: TimerState = { endAt: null, pausedLeft: null, durationMs: 0, label: '', fired: true };

function load(): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...idle, ...JSON.parse(raw) } : idle;
  } catch {
    return idle;
  }
}

let state: TimerState = typeof localStorage !== 'undefined' ? load() : idle;
const listeners = new Set<() => void>();

function set(next: TimerState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : le minuteur marche quand même en mémoire */
  }
  listeners.forEach((l) => l());
}

export const timer = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  start(sec: number, label: string) {
    set({ endAt: Date.now() + sec * 1000, pausedLeft: null, durationMs: sec * 1000, label, fired: false });
  },
  add(sec: number) {
    if (state.pausedLeft != null) set({ ...state, pausedLeft: Math.max(0, state.pausedLeft + sec * 1000), durationMs: state.durationMs + sec * 1000 });
    else if (state.endAt != null) {
      const endAt = Math.max(Date.now(), state.endAt + sec * 1000);
      set({ ...state, endAt, durationMs: Math.max(1000, state.durationMs + sec * 1000), fired: endAt <= Date.now() ? state.fired : false });
    }
  },
  togglePause() {
    if (state.pausedLeft != null) set({ ...state, endAt: Date.now() + state.pausedLeft, pausedLeft: null });
    else if (state.endAt != null) set({ ...state, pausedLeft: Math.max(0, state.endAt - Date.now()), endAt: null });
  },
  stop() {
    set(idle);
  },
  markFired() {
    set({ ...state, fired: true });
  }
};

export function remainingMs(s: TimerState, now = Date.now()): number | null {
  if (s.pausedLeft != null) return s.pausedLeft;
  if (s.endAt != null) return s.endAt - now;
  return null;
}

export function useTimer() {
  return useSyncExternalStore(timer.subscribe, timer.get, timer.get);
}

// ---------------------------------------------------------------- alertes

let audioCtx: AudioContext | null = null;
let dingBuffer: AudioBuffer | null = null;

/**
 * iOS n'autorise le son qu'après un geste de l'utilisateur :
 * on « déverrouille » l'audio à chaque validation de set.
 */
export async function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (!dingBuffer) {
      const res = await fetch(`${import.meta.env.BASE_URL}ding.wav`);
      dingBuffer = await audioCtx.decodeAudioData(await res.arrayBuffer());
    }
  } catch {
    /* pas de son disponible */
  }
}

export function playDing() {
  if (!audioCtx || !dingBuffer) return;
  const src = audioCtx.createBufferSource();
  src.buffer = dingBuffer;
  src.connect(audioCtx.destination);
  src.start();
}

export function vibrate() {
  // Non supporté par Safari iOS : sans effet là-bas, utile sur Android.
  if ('vibrate' in navigator) navigator.vibrate([300, 150, 300]);
}

export async function notifyEnd(label: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const body = label ? `Prochain set : ${label}` : 'Prochain set !';
    if (reg) await reg.showNotification('Repos terminé', { body, tag: 'rest', icon: `${import.meta.env.BASE_URL}icon-192.png` });
    else new Notification('Repos terminé', { body });
  } catch {
    /* notifications indisponibles */
  }
}
