import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RestBar } from './components/RestBar';
import { WhatsNew } from './components/WhatsNew';
import { softMigrate } from './db';
import { useHashRoute, useSessions, useSettings } from './hooks';
import { applyUpdate, useNeedRefresh } from './lib/pwa';
import { cleanupSessions, hasDoneSets } from './lib/session';
import { useKeepAwake } from './lib/timer';
import { Body } from './pages/Body';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { EngineSettings } from './pages/EngineSettings';
import { Guide } from './pages/Guide';
import { History } from './pages/History';
import { Onboarding } from './pages/Onboarding';
import { Program } from './pages/Program';
import { Progress } from './pages/Progress';
import { SessionDetail } from './pages/SessionDetail';
import { SettingsPage } from './pages/Settings';
import { Workout } from './pages/Workout';
import { CalendarDays, Dumbbell, History as HistoryIcon, RefreshCw, Settings as SettingsIcon, TrendingUp } from './ui/icons';
import { cx } from './ui/kit';
import { DialogHost, ToastHost } from './ui/overlay';

const TABS = [
  { id: 'seance', label: 'Séance', Icon: Dumbbell },
  { id: 'programme', label: 'Programme', Icon: CalendarDays },
  { id: 'progres', label: 'Progrès', Icon: TrendingUp },
  { id: 'historique', label: 'Historique', Icon: HistoryIcon },
  { id: 'reglages', label: 'Réglages', Icon: SettingsIcon }
] as const;

export default function App() {
  const settings = useSettings();
  const sessions = useSessions();
  const [route, go] = useHashRoute();
  const tab = TABS.some((t) => t.id === route[0]) ? route[0] : 'seance';
  const routeKey = route.join('/') || 'seance';
  const needRefresh = useNeedRefresh();
  const navRef = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    softMigrate()
      .then(() => cleanupSessions())
      .finally(() => setReady(true));
    const onVisible = () => document.visibilityState === 'visible' && cleanupSessions();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Écran allumé tant qu'une séance est en cours (au moins un set validé, pas encore terminée).
  const training = !!sessions?.some((s) => s.endedAt == null && hasDoneSets(s));
  useKeepAwake(!!settings?.keepAwake && training);

  // La barre du bas change de hauteur quand le minuteur apparaît : le contenu suit.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--bottom-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings?.onboarded, ready]);

  // Chaque écran retrouve sa position de défilement quand on y revient.
  const scrolls = useRef<Record<string, number>>({});
  const current = useRef(routeKey);
  useEffect(() => {
    const onScroll = () => {
      scrolls.current[current.current] = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    current.current = routeKey;
    const y = scrolls.current[routeKey] ?? 0;
    window.scrollTo(0, y);
    const id = requestAnimationFrame(() => window.scrollTo(0, y));
    return () => cancelAnimationFrame(id);
  }, [routeKey]);

  if (!settings || !ready) return null;
  if (!settings.onboarded) {
    return (
      <>
        <Onboarding />
        <DialogHost />
        <ToastHost />
      </>
    );
  }

  const page = () => {
    switch (tab) {
      case 'programme':
        return <Program settings={settings} />;
      case 'progres':
        if (route[1] === 'ex' && route[2]) return <ExerciseDetail settings={settings} exerciseId={route[2]} />;
        if (route[1] === 'corps') return <Body settings={settings} />;
        return <Progress settings={settings} />;
      case 'historique':
        if (route[1]) return <SessionDetail settings={settings} sessionId={route[1]} />;
        return <History settings={settings} />;
      case 'reglages':
        if (route[1] === 'guide') return <Guide section={route[2]} />;
        if (route[1] === 'moteur') return <EngineSettings settings={settings} />;
        return <SettingsPage settings={settings} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-full pt-safe">
      <main className="mx-auto w-full max-w-xl px-4 pt-3" style={{ paddingBottom: 'calc(var(--bottom-h) + 24px)' }}>
        {/* La séance reste montée : tes saisies en cours survivent à un changement d'onglet. */}
        <div hidden={tab !== 'seance'}>
          <Workout settings={settings} visible={tab === 'seance'} />
        </div>
        {tab !== 'seance' && (
          <div key={routeKey} className="animate-fade-in">
            {page()}
          </div>
        )}
      </main>

      <nav ref={navRef} className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg pb-safe">
        <div className="mx-auto max-w-xl">
          {needRefresh && (
            <button className="flex w-full items-center justify-center gap-2 border-b border-line/70 bg-accent/15 px-4 py-2.5 text-sm font-semibold text-accent" onClick={applyUpdate}>
              <RefreshCw size={16} /> Nouvelle version prête. Toucher pour recharger.
            </button>
          )}
          <RestBar />
          <div className="flex">
            {TABS.map(({ id, label, Icon }) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className={cx('flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 pt-1.5 text-[10px] font-semibold tracking-wide transition-colors', on ? 'text-accent' : 'text-faint')}
                  aria-current={on ? 'page' : undefined}
                >
                  <Icon size={23} strokeWidth={on ? 2.4 : 1.9} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <WhatsNew />
      <DialogHost />
      <ToastHost />
    </div>
  );
}
