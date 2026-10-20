import { useState } from 'react';
import { db, exportAll, importAll, saveSettings } from '../db';
import { useBodyweights } from '../hooks';
import { Field, NumInput, Segmented, Toggle } from '../components/ui';
import { DEFAULT_ENGINE } from '../lib/defaults';
import { LEVEL_FR, bodyweightTrend, levelFromYears } from '../lib/engine';
import { playDing, unlockAudio, vibrate } from '../lib/timer';
import { fmt, fmtDate, uid } from '../lib/util';
import type { EngineParams, Settings } from '../types';

type NumKey = { [K in keyof EngineParams]: EngineParams[K] extends number ? K : never }[keyof EngineParams];
type RangeKey = { [K in keyof EngineParams]: EngineParams[K] extends [number, number] ? K : never }[keyof EngineParams];

const ENGINE_FIELDS: { title: string; fields: ({ k: NumKey; label: string } | { r: RangeKey; label: string })[] }[] = [
  {
    title: 'Vitesse de départ (% du 1RM estimé / semaine)',
    fields: [
      { r: 'rateBeginner', label: 'Débutant' },
      { r: 'rateIntermediate', label: 'Intermédiaire' },
      { r: 'rateAdvanced', label: 'Avancé' },
      { k: 'yearsIntermediate', label: 'Années → intermédiaire' },
      { k: 'yearsAdvanced', label: 'Années → avancé' }
    ]
  },
  {
    title: 'Ajustements',
    fields: [
      { k: 'compoundFactor', label: 'Facteur composé' },
      { k: 'isolationFactor', label: 'Facteur isolation' },
      { k: 'goalFactorBulk', label: 'Facteur prise de masse' },
      { k: 'goalFactorMaintain', label: 'Facteur maintien' },
      { k: 'goalFactorCut', label: 'Facteur sèche' },
      { k: 'bodyweightTrendK', label: 'Sensibilité à la tendance du poids (par %/sem)' },
      { k: 'bodyweightFactorMin', label: 'Facteur poids min' },
      { k: 'bodyweightFactorMax', label: 'Facteur poids max' },
      { k: 'gapK', label: 'Ralentissement selon gain depuis les débuts' },
      { k: 'gapFactorMin', label: 'Facteur de ralentissement min' },
      { k: 'maxGapDays', label: 'Pause max prise en compte (jours)' }
    ]
  },
  {
    title: 'Recalibrage sur ton historique',
    fields: [
      { k: 'recalMinWeeks', label: 'Semaines minimum' },
      { k: 'recalMinSessions', label: 'Séances minimum' },
      { k: 'recalFullTrustWeeks', label: 'Semaines pour confiance max' },
      { k: 'recalMaxWeight', label: 'Poids max de l’historique (0–1)' },
      { k: 'recalClampMax', label: 'Historique plafonné à × taux théorique' }
    ]
  },
  {
    title: 'Statut et graphiques',
    fields: [
      { k: 'tolerancePct', label: 'Zone de tolérance (± %)' },
      { k: 'statusWindowWeeks', label: 'Fenêtre glissante (semaines)' },
      { k: 'statusMinSessions', label: 'Séances min dans la fenêtre' },
      { k: 'aheadRatio', label: '« En avance » si ≥ × attendu' },
      { k: 'onTrackRatio', label: '« Dans la cible » si ≥ × attendu' },
      { k: 'stagnationPct', label: 'Stagnation si |pente| ≤ (%/sem)' },
      { k: 'regressionPct', label: 'Régression si pente < − (%/sem)' },
      { k: 'deloadAfterStalls', label: 'Fenêtres sans progrès avant décharge' },
      { k: 'deloadPct', label: 'Décharge (% de charge en moins)' },
      { k: 'rirDriftWarn', label: 'Alerte écart de RIR moyen' }
    ]
  },
  {
    title: 'Volume',
    fields: [
      { k: 'hardSetRir', label: 'Set dur si RIR ≤' },
      { k: 'secondaryWeight', label: 'Poids d’un muscle secondaire' },
      { k: 'volumeLow', label: 'Volume conseillé min' },
      { k: 'volumeHigh', label: 'Volume conseillé max' }
    ]
  }
];

export function SettingsPage({ settings }: { settings: Settings }) {
  const bws = useBodyweights() ?? [];
  const [bw, setBw] = useState<number | null>(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') ?? 'dark';
    } catch {
      return 'dark';
    }
  });
  const e = settings.engine;
  const setE = (patch: Partial<EngineParams>) => saveSettings({ engine: { ...e, ...patch } });
  const level = levelFromYears(settings.trainingYears, e);
  const trend = bodyweightTrend(bws, Date.now());
  const notifSupported = typeof Notification !== 'undefined';

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const name = `muscu-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    // Sur iPhone, la feuille de partage permet d'enregistrer dans Fichiers / iCloud.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch {
        /* annulé : on retombe sur le téléchargement */
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  async function doImport(f: File) {
    try {
      const data = JSON.parse(await f.text());
      if (!confirm('Remplacer TOUTES les données actuelles par celles du fichier ?')) return;
      await importAll(data);
      alert('Import terminé.');
    } catch {
      alert('Fichier invalide.');
    }
  }

  return (
    <div className="space-y-3">
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Profil</h2>
        <Field label="Années de pratique">
          <NumInput value={settings.trainingYears} onChange={(v) => v != null && saveSettings({ trainingYears: v })} />
        </Field>
        <p className="text-sm text-mute">Niveau : {LEVEL_FR[level]}</p>
        <Field label="Objectif">
          <Segmented
            value={settings.goal}
            onChange={(goal) => saveSettings({ goal })}
            options={[
              { value: 'bulk', label: 'Prise' },
              { value: 'maintain', label: 'Maintien' },
              { value: 'cut', label: 'Sèche' }
            ]}
          />
        </Field>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Poids de corps</h2>
        <div className="flex gap-2">
          <NumInput value={bw} onChange={setBw} placeholder={`Pesée du jour (${settings.defaultUnit})`} className="flex-1" />
          <button
            className="btn-primary"
            disabled={!bw}
            onClick={async () => {
              await db.bodyweights.put({ id: uid(), date: Date.now(), weight: bw!, unit: settings.defaultUnit });
              setBw(null);
            }}
          >
            Ajouter
          </button>
        </div>
        <p className="text-sm text-mute">
          {trend != null
            ? `Tendance sur 4 semaines : ${trend >= 0 ? '+' : ''}${fmt(trend, 2)} %/sem — utilisée à la place de l’objectif par le moteur.`
            : 'Pèse-toi 2–3 fois par semaine : après 10 jours, le moteur utilise ta vraie tendance.'}
        </p>
        <ul className="max-h-40 overflow-y-auto text-sm divide-y divide-line/60">
          {[...bws].reverse().map((b) => (
            <li key={b.id} className="flex items-center justify-between py-1">
              <span>{fmtDate(b.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>
                {fmt(b.weight)} {b.unit}
                <button className="ml-3 text-mute" onClick={() => db.bodyweights.delete(b.id)} aria-label="Supprimer la pesée">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Séance et minuteur</h2>
        <Field label="Repos par défaut (secondes)">
          <NumInput value={settings.defaultRestSec} onChange={(v) => v != null && v > 0 && saveSettings({ defaultRestSec: Math.round(v) })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="1 plate (lb)">
            <NumInput value={settings.plateLb} onChange={(v) => v && saveSettings({ plateLb: v })} />
          </Field>
          <Field label="1 plate (kg)">
            <NumInput value={settings.plateKg} onChange={(v) => v && saveSettings({ plateKg: v })} />
          </Field>
        </div>
        <Field label="Unité par défaut (nouveaux exercices)">
          <Segmented
            value={settings.defaultUnit}
            onChange={(defaultUnit) => saveSettings({ defaultUnit })}
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' }
            ]}
          />
        </Field>
        <Toggle label="Son à la fin du repos" checked={settings.sound} onChange={(sound) => saveSettings({ sound })} />
        <Toggle label="Vibration (Android uniquement)" checked={settings.vibrate} onChange={(v) => saveSettings({ vibrate: v })} />
        <Toggle
          label="Notification"
          checked={settings.notify}
          onChange={async (notify) => {
            if (notify && notifSupported && Notification.permission !== 'granted') {
              const r = await Notification.requestPermission();
              if (r !== 'granted') return alert('Notifications refusées. Active-les dans Réglages iOS → Notifications → Muscu.');
            }
            if (notify && !notifSupported) return alert('Notifications indisponibles : installe d’abord l’app sur l’écran d’accueil (iOS 16.4+).');
            saveSettings({ notify });
          }}
        />
        <button
          className="btn-ghost w-full"
          onClick={async () => {
            await unlockAudio();
            playDing();
            vibrate();
          }}
        >
          Tester le son
        </button>
        <details className="text-xs text-mute">
          <summary className="py-2 text-accent">Limites d’iOS</summary>
          <ul className="list-disc space-y-1 pl-4">
            <li>Le décompte se base sur l’heure de fin : il reste exact écran verrouillé, mais iOS suspend l’app en arrière-plan, donc aucun son ne peut être joué tant qu’elle n’est pas à l’écran.</li>
            <li>Safari iOS ne supporte pas la vibration web.</li>
            <li>Les notifications web ne marchent que pour l’app installée sur l’écran d’accueil (iOS 16.4+) et ne peuvent pas être programmées à l’avance sans serveur : elles s’affichent seulement si l’app tourne encore à la fin du repos.</li>
            <li>Le son suit le volume « sonnerie/média » et le mode silencieux peut le couper.</li>
            <li>Astuce : garde l’écran allumé (Réglages iOS → Luminosité → Verrouillage auto) pendant la séance.</li>
          </ul>
        </details>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Moteur de progression</h2>
          <button className="btn-ghost btn-sm" onClick={() => confirm('Remettre tous les paramètres du moteur par défaut ?') && saveSettings({ engine: DEFAULT_ENGINE })}>
            Réinitialiser
          </button>
        </div>
        {ENGINE_FIELDS.map((g) => (
          <details key={g.title} className="rounded-xl border border-line px-3">
            <summary className="py-3 font-semibold">{g.title}</summary>
            <div className="space-y-2 pb-3">
              {g.fields.map((f) =>
                'r' in f ? (
                  <div key={f.r}>
                    <span className="label">{f.label}</span>
                    <div className="flex items-center gap-2">
                      <NumInput value={e[f.r][0]} onChange={(v) => v != null && setE({ [f.r]: [v, e[f.r][1]] } as Partial<EngineParams>)} />
                      <span>–</span>
                      <NumInput value={e[f.r][1]} onChange={(v) => v != null && setE({ [f.r]: [e[f.r][0], v] } as Partial<EngineParams>)} />
                    </div>
                  </div>
                ) : (
                  <Field key={f.k} label={f.label}>
                    <NumInput value={e[f.k]} onChange={(v) => v != null && setE({ [f.k]: v } as Partial<EngineParams>)} />
                  </Field>
                )
              )}
            </div>
          </details>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Affichage</h2>
        <Segmented
          value={theme}
          onChange={(t) => {
            setTheme(t);
            document.documentElement.dataset.theme = t;
            try {
              localStorage.setItem('theme', t);
            } catch {
              /* ignore */
            }
          }}
          options={[
            { value: 'dark', label: 'Sombre' },
            { value: 'light', label: 'Clair' }
          ]}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Données</h2>
        <p className="text-sm text-mute">Tout est stocké sur ce téléphone. Exporte régulièrement une sauvegarde (Fichiers / iCloud).</p>
        <button className="btn-primary w-full" onClick={doExport}>
          Exporter une sauvegarde
        </button>
        <label className="btn-ghost w-full">
          Importer une sauvegarde
          <input type="file" accept="application/json,.json" className="hidden" onChange={(ev) => ev.target.files?.[0] && doImport(ev.target.files[0])} />
        </label>
        <button
          className="btn-ghost w-full text-bad"
          onClick={async () => {
            if (!confirm('Tout effacer (programme, historique, réglages) ?')) return;
            await db.delete();
            location.reload();
          }}
        >
          Tout effacer
        </button>
      </section>
    </div>
  );
}
