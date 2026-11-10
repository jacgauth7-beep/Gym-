/**
 * Service worker et mises à jour.
 *
 * Le service worker s'active tout seul dès qu'une nouvelle version est téléchargée (fiable sur iOS).
 * Côté page : si tu viens d'ouvrir l'app, on recharge sans rien demander ; si tu es en pleine séance,
 * on affiche un bandeau et tu recharges quand tu veux. Rien n'est perdu : tout est en base.
 */
import { useSyncExternalStore } from 'react';

let needRefresh = false;
let interacted = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function initPWA() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller;
  const loadedAt = Date.now();
  window.addEventListener('pointerdown', () => (interacted = true), { once: true, capture: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // première installation : rien à recharger
    if (!interacted && Date.now() - loadedAt < 15_000) window.location.reload();
    else {
      needRefresh = true;
      emit();
    }
  });

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
      let lastCheck = Date.now();
      // iOS revérifie rarement de lui-même : on le fait au retour au premier plan (au plus toutes les 30 min).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30 * 60_000) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
      });
    } catch {
      /* hors ligne ou navigateur sans service worker : l'app marche quand même */
    }
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export const applyUpdate = () => window.location.reload();

/** Cherche tout de suite une nouvelle version (bouton dans Réglages). Renvoie true si une mise à jour arrive. */
export async function checkForUpdate(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return false;
    await reg.update();
    return !!(reg.installing || reg.waiting) || needRefresh;
  } catch {
    return false;
  }
}

export function useNeedRefresh() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => needRefresh,
    () => needRefresh
  );
}

export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_DATE: string = __BUILD_DATE__;
