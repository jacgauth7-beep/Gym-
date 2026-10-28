import { useEffect } from 'react';
import { RestBanner } from './components/RestBanner';
import { useHashRoute, useSettings } from './hooks';
import { cleanupStale } from './lib/session';
import { Onboarding } from './pages/Onboarding';
import { Program } from './pages/Program';
import { Progress } from './pages/Progress';
import { SettingsPage } from './pages/Settings';
import { Workout } from './pages/Workout';

const TABS = [
  { id: 'seance', label: 'Séance', icon: '🏋️' },
  { id: 'programme', label: 'Programme', icon: '🗓️' },
  { id: 'progres', label: 'Progrès', icon: '📈' },
  { id: 'reglages', label: 'Réglages', icon: '⚙️' }
] as const;

export default function App() {
  const settings = useSettings();
  const [route, go] = useHashRoute();
  const tab = route[0] ?? 'seance';

  useEffect(() => {
    cleanupStale();
  }, []);

  if (!settings) return null;
  if (!settings.onboarded) return <Onboarding />;

  return (
    <div className="flex min-h-full flex-col pt-safe">
      <main className="mx-auto w-full max-w-xl flex-1 px-3 pb-52 pt-3">
        {tab === 'seance' && <Workout settings={settings} />}
        {tab === 'programme' && <Program settings={settings} />}
        {tab === 'progres' && <Progress settings={settings} exerciseId={route[1]} go={go} />}
        {tab === 'reglages' && <SettingsPage settings={settings} />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur pb-safe">
        <div className="mx-auto max-w-xl">
          <RestBanner />
        </div>
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 min-h-[56px] text-xs font-medium ${tab === t.id ? 'text-accent' : 'text-mute'}`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <span className="text-xl leading-none" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
