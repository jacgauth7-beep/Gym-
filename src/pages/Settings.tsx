import { useState } from 'react';
import { activateDeload } from '../components/Coach';
import { openWhatsNew } from '../components/WhatsNew';
import { db, exportAll, importAll, isBackup, saveSettings } from '../db';
import { getTheme, setTheme, type Theme } from '../hooks';
import { GOAL_FR, LEVEL_FR, levelFromYears } from '../lib/engine';
import { loadSplitV2 } from '../lib/mySplit';
import { APP_VERSION, BUILD_DATE, applyUpdate, checkForUpdate } from '../lib/pwa';
import { discardEmptyActive, isDeloadActive } from '../lib/session';
import { playDing, unlockAudio, vibrate, wakeLockSupported } from '../lib/timer';
import { ago, fmt, fmtClock, fmtDate, plural } from '../lib/util';
import type { Goal, Settings } from '../types';
import {
  BatteryCharging,
  Bell,
  BookOpen,
  CalendarDays,
  Database,
  Download,
  Gauge,
  Info,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  Weight
} from '../ui/icons';
import { ListGroup, ListRow, PageHeader, RestPicker, Segmented, Toggle } from '../ui/kit';
import { Sheet, dialog, toast } from '../ui/overlay';

const IOS_LIMITS = [
  'Le décompte se base sur l’heure de fin : il reste exact même si l’écran se verrouille.',
  'iOS met l’app en pause dès qu’elle quitte l’écran. Le son ne peut donc sonner que si l’app est affichée à la fin du repos. C’est pour ça que l’écran reste allumé pendant la séance.',
  'Le son se mélange à ta musique, mais il suit le bouton silencieux de l’iPhone : en mode silencieux, tu ne l’entendras pas.',
  'Safari sur iPhone ne sait pas faire vibrer le téléphone depuis une app web.',
  'Les notifications ne marchent que pour l’app installée sur l’écran d’accueil (iOS 16.4 ou plus). iOS ne permet pas de les programmer à l’avance : elles ne partent que si l’app tourne encore.'
];

export function SettingsPage({ settings }: { settings: Settings }) {
  const [sheet, setSheet] = useState<null | 'goal' | 'rest' | 'ios'>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const p = settings.engine;
  const level = levelFromYears(settings.trainingYears, p);
  const deload = isDeloadActive(settings);
  const notifSupported = typeof Notification !== 'undefined';

  async function askNumber(title: string, initial: number, message?: string): Promise<number | null> {
    const v = await dialog.prompt({ title, message, initial: String(initial), inputMode: 'decimal', confirmLabel: 'OK' });
    if (v == null) return null;
    const n = parseFloat(v.replace(',', '.'));
    return isFinite(n) && n >= 0 ? n : null;
  }

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `muscu-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    let shared = false;
    // Sur iPhone, la feuille de partage permet d'enregistrer dans Fichiers ou iCloud.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        shared = true;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    if (!shared) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
    await saveSettings({ lastBackupAt: Date.now() });
    toast('Sauvegarde exportée', { tone: 'good', icon: <Download size={16} className="text-good" /> });
  }

  async function doImport(f: File) {
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      data = null;
    }
    if (!isBackup(data)) {
      toast('Ce fichier n’est pas une sauvegarde de l’app.', { tone: 'bad' });
      return;
    }
    const ok = await dialog.confirm({
      title: 'Remplacer toutes les données ?',
      message: `La sauvegarde contient ${data.sessions.length} ${plural(data.sessions.length, 'séance')} et ${data.exercises.length} exercices. Tout ce qui est sur ce téléphone sera remplacé.`,
      confirmLabel: 'Remplacer',
      danger: true
    });
    if (!ok) return;
    await importAll(data);
    toast('Sauvegarde restaurée', { tone: 'good' });
  }

  return (
    <div>
      <PageHeader title="Réglages" />

      <ListGroup title="Profil" footer="Ton niveau fixe la vitesse de progression attendue au départ. Le moteur la recalibre ensuite sur tes propres résultats.">
        <ListRow
          icon={<UserRound size={18} />}
          title="Expérience"
          value={`${fmt(settings.trainingYears)} ${plural(settings.trainingYears, 'an')} · ${LEVEL_FR[level]}`}
          onClick={async () => {
            const n = await askNumber('Années de pratique', settings.trainingYears, 'Depuis combien d’années t’entraînes-tu sérieusement ?');
            if (n != null) saveSettings({ trainingYears: n });
          }}
        />
        <ListRow icon={<Target size={18} />} title="Objectif" value={GOAL_FR[settings.goal]} onClick={() => setSheet('goal')} />
        <ListRow icon={<Weight size={18} />} iconTone="mute" title="Poids de corps, protéines, sommeil" href="#/progres/corps" />
      </ListGroup>

      <ListGroup title="Séance">
        <ListRow icon={<Timer size={18} />} title="Repos par défaut" value={fmtClock(settings.defaultRestSec)} onClick={() => setSheet('rest')} />
        <div className="px-4">
          <Toggle label="Check-in du jour" hint="Sommeil et pesée en un tap sur l’écran Séance" checked={settings.dailyCheckin} onChange={(dailyCheckin) => saveSettings({ dailyCheckin })} />
        </div>
        <div className="px-4">
          <Toggle
            label="Écran allumé pendant la séance"
            hint={wakeLockSupported() ? 'Indispensable pour entendre la fin du repos' : 'Non disponible sur cet appareil'}
            checked={settings.keepAwake}
            onChange={(keepAwake) => saveSettings({ keepAwake })}
          />
        </div>
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
          <span className="text-[15px]">Unité des nouveaux exercices</span>
          <div className="w-28">
            <Segmented
              value={settings.defaultUnit}
              onChange={(defaultUnit) => saveSettings({ defaultUnit })}
              size="sm"
              options={[
                { value: 'lb', label: 'lb' },
                { value: 'kg', label: 'kg' }
              ]}
            />
          </div>
        </div>
        <ListRow
          title="Poids d’une plate"
          value={`${fmt(settings.plateLb)} lb · ${fmt(settings.plateKg)} kg`}
          onClick={async () => {
            const lb = await askNumber('Poids d’une plate en lb', settings.plateLb);
            if (lb == null || lb <= 0) return;
            const kg = await askNumber('Poids d’une plate en kg', settings.plateKg);
            saveSettings({ plateLb: lb, ...(kg != null && kg > 0 ? { plateKg: kg } : {}) });
          }}
        />
      </ListGroup>

      <ListGroup title="Fin du repos">
        <div className="px-4">
          <Toggle label="Son" checked={settings.sound} onChange={(sound) => saveSettings({ sound })} />
        </div>
        <div className="px-4">
          <Toggle label="Vibration" hint="Android seulement" checked={settings.vibrate} onChange={(v) => saveSettings({ vibrate: v })} />
        </div>
        <div className="px-4">
          <Toggle
            label="Notification"
            hint={notifSupported ? 'Seulement si l’app tourne encore' : 'Installe d’abord l’app sur l’écran d’accueil'}
            checked={settings.notify && notifSupported}
            onChange={async (notify) => {
              if (notify && !notifSupported) {
                toast('Notifications indisponibles : installe l’app sur l’écran d’accueil (iOS 16.4 ou plus).', { tone: 'bad', ms: 4000 });
                return;
              }
              if (notify && Notification.permission !== 'granted') {
                const r = await Notification.requestPermission();
                if (r !== 'granted') {
                  toast('Notifications refusées. Autorise-les dans Réglages iOS, Notifications.', { tone: 'bad', ms: 4000 });
                  return;
                }
              }
              saveSettings({ notify });
            }}
          />
        </div>
        <ListRow
          icon={<Volume2 size={18} />}
          title="Tester le son"
          chevron={false}
          onClick={async () => {
            await unlockAudio();
            playDing();
            vibrate();
          }}
        />
        <ListRow icon={<Info size={18} />} iconTone="mute" title="Les limites d’iOS" subtitle="Pourquoi le son ne sonne pas écran verrouillé" onClick={() => setSheet('ios')} />
      </ListGroup>

      <ListGroup title="Progression">
        <ListRow
          icon={<BatteryCharging size={18} />}
          iconTone="good"
          title="Semaine de décharge"
          subtitle={deload ? `Active jusqu’au ${fmtDate(settings.deloadUntil!)}` : 'Moins de sets, plus loin de l’échec, 7 jours'}
          chevron={false}
          right={<span className={deload ? 'chip tone-good' : 'chip'}>{deload ? 'Arrêter' : 'Activer'}</span>}
          onClick={async () => {
            if (!deload) return void activateDeload();
            await saveSettings({ deloadUntil: null });
            await discardEmptyActive();
            toast('Décharge arrêtée');
          }}
        />
        <ListRow icon={<SlidersHorizontal size={18} />} title="Moteur de progression" subtitle="Toutes les règles et tous les seuils" href="#/reglages/moteur" />
        <ListRow icon={<BookOpen size={18} />} title="Guide scientifique" subtitle="Ce que dit la recherche, avec les références" href="#/reglages/guide" />
      </ListGroup>

      <ListGroup title="Apparence">
        <div className="p-3">
          <Segmented
            value={theme}
            onChange={(t) => {
              setThemeState(t);
              setTheme(t);
            }}
            size="lg"
            ariaLabel="Thème"
            options={[
              { value: 'dark', label: 'Sombre' },
              { value: 'light', label: 'Clair' },
              { value: 'auto', label: 'Auto' }
            ]}
          />
        </div>
      </ListGroup>

      <ListGroup title="Données" footer="Tout est stocké sur ce téléphone, rien n’est envoyé ailleurs. Si tu supprimes l’icône de l’écran d’accueil, iOS efface les données : exporte une sauvegarde de temps en temps.">
        <ListRow
          icon={<Download size={18} />}
          iconTone="good"
          title="Exporter une sauvegarde"
          subtitle={settings.lastBackupAt ? `Dernière : ${ago(settings.lastBackupAt)}` : 'Jamais exportée'}
          chevron={false}
          onClick={doExport}
        />
        <label className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 active:bg-raised/60">
          <span className="tone-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <Upload size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Restaurer une sauvegarde</span>
            <span className="block text-xs text-faint">Remplace toutes les données</span>
          </span>
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = '';
              if (f) doImport(f);
            }}
          />
        </label>
        <ListRow
          icon={<CalendarDays size={18} />}
          iconTone="mute"
          title="Recharger mon split V2"
          subtitle="Remet le programme Push / Pull / Legs d’origine"
          chevron={false}
          onClick={async () => {
            const ok = await dialog.confirm({
              title: 'Recharger le split V2 ?',
              message: 'Ton programme actuel est remplacé par le split V2 d’origine (6 jours). Ton historique de séances est conservé.',
              confirmLabel: 'Recharger'
            });
            if (!ok) return;
            await loadSplitV2({ plateLb: settings.plateLb, plateKg: settings.plateKg });
            toast('Split V2 rechargé', { tone: 'good' });
          }}
        />
        <ListRow
          icon={<Trash2 size={18} />}
          iconTone="bad"
          danger
          title="Tout effacer"
          chevron={false}
          onClick={async () => {
            const ok = await dialog.confirm({ title: 'Tout effacer ?', message: 'Programme, historique, pesées et réglages seront supprimés définitivement de ce téléphone.', confirmLabel: 'Tout effacer', danger: true });
            if (!ok) return;
            await db.delete();
            try {
              localStorage.clear();
            } catch {
              /* ignoré */
            }
            window.location.hash = '';
            window.location.reload();
          }}
        />
      </ListGroup>

      <ListGroup title="À propos">
        <ListRow icon={<Gauge size={18} />} iconTone="mute" title="Version" value={`${APP_VERSION} · ${fmtDate(Date.parse(BUILD_DATE), { day: 'numeric', month: 'short' })}`} />
        <ListRow
          icon={<RefreshCw size={18} />}
          title="Rechercher une mise à jour"
          chevron={false}
          onClick={async () => {
            toast('Recherche…');
            const found = await checkForUpdate();
            if (found) {
              toast('Nouvelle version trouvée, rechargement…', { tone: 'good' });
              setTimeout(applyUpdate, 1500);
            } else toast('Tu as la dernière version.', { tone: 'good' });
          }}
        />
        <ListRow icon={<Sparkles size={18} />} title="Quoi de neuf" onClick={openWhatsNew} />
        <ListRow icon={<Database size={18} />} iconTone="mute" title="Confidentialité" subtitle="100 % local, hors ligne, sans compte" />
        <ListRow icon={<Bell size={18} />} iconTone="mute" title="Installation" subtitle="Safari, Partager, Sur l’écran d’accueil" />
      </ListGroup>

      <Sheet open={sheet === 'goal'} onClose={() => setSheet(null)} title="Objectif" subtitle="Il ajuste la vitesse de progression attendue et la cible de poids par semaine." closeLabel="OK">
        <Segmented
          value={settings.goal}
          onChange={(goal: Goal) => saveSettings({ goal })}
          size="lg"
          options={[
            { value: 'bulk', label: 'Prise' },
            { value: 'maintain', label: 'Maintien' },
            { value: 'cut', label: 'Sèche' }
          ]}
        />
        <p className="mt-4 text-sm leading-relaxed text-mute">
          {settings.goal === 'bulk' && `Prise de masse : léger surplus, +${fmt(p.bulkRate[0], 2)} à +${fmt(p.bulkRate[1], 2)} % du poids par semaine. La progression attendue est un peu plus rapide.`}
          {settings.goal === 'maintain' && 'Maintien : poids stable. La progression attendue suit ton niveau.'}
          {settings.goal === 'cut' && `Sèche : déficit, −${fmt(p.cutRate[0], 2)} à −${fmt(p.cutRate[1], 2)} % du poids par semaine. Garder ta force est déjà une réussite : la progression attendue est divisée par deux.`}
        </p>
      </Sheet>

      <Sheet open={sheet === 'rest'} onClose={() => setSheet(null)} title="Repos par défaut" subtitle="Utilisé par tous les exercices qui n’ont pas leur propre réglage." closeLabel="OK">
        <RestPicker value={settings.defaultRestSec} onChange={(v) => saveSettings({ defaultRestSec: v ?? 180 })} defaultSec={180} defaultLabel="réglage d’origine" />
      </Sheet>

      <Sheet open={sheet === 'ios'} onClose={() => setSheet(null)} title="Les limites d’iOS" closeLabel="Compris">
        <ul className="space-y-3">
          {IOS_LIMITS.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-mute">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
