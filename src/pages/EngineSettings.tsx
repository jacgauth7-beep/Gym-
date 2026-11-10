import { BackButton } from '../components/BackButton';
import { saveSettings } from '../db';
import { DEFAULT_ENGINE } from '../lib/defaults';
import type { EngineParams, Settings } from '../types';
import { RotateCcw } from '../ui/icons';
import { NumInput, PageHeader, SectionHeader } from '../ui/kit';
import { dialog, toast } from '../ui/overlay';

type NumKey = { [K in keyof EngineParams]: EngineParams[K] extends number ? K : never }[keyof EngineParams];
type RangeKey = { [K in keyof EngineParams]: EngineParams[K] extends [number, number] ? K : never }[keyof EngineParams];
type FieldDef = { k: NumKey; label: string; hint?: string } | { r: RangeKey; label: string; hint?: string };

const GROUPS: { title: string; intro?: string; fields: FieldDef[] }[] = [
  {
    title: 'Vitesse de départ',
    intro: 'En % du 1RM estimé par semaine. Le moteur prend le milieu de la fourchette de ton niveau.',
    fields: [
      { r: 'rateBeginner', label: 'Débutant' },
      { r: 'rateIntermediate', label: 'Intermédiaire' },
      { r: 'rateAdvanced', label: 'Avancé' },
      { k: 'yearsIntermediate', label: 'Années de pratique pour devenir intermédiaire' },
      { k: 'yearsAdvanced', label: 'Années de pratique pour devenir avancé' }
    ]
  },
  {
    title: 'Ajustements de la vitesse',
    fields: [
      { k: 'compoundFactor', label: 'Facteur exercice composé' },
      { k: 'isolationFactor', label: 'Facteur exercice d’isolation' },
      { k: 'goalFactorBulk', label: 'Facteur prise de masse', hint: 'Utilisé tant que ta tendance de poids n’est pas mesurable.' },
      { k: 'goalFactorMaintain', label: 'Facteur maintien' },
      { k: 'goalFactorCut', label: 'Facteur sèche' },
      { k: 'bodyweightTrendK', label: 'Sensibilité à la tendance du poids', hint: 'Facteur = 1 + sensibilité × tendance en %/sem.' },
      { k: 'bodyweightFactorMin', label: 'Facteur poids minimum' },
      { k: 'bodyweightFactorMax', label: 'Facteur poids maximum' },
      { k: 'bwMinPoints', label: 'Pesées minimum pour mesurer la tendance' },
      { k: 'bwMinDays', label: 'Étendue minimum des pesées (jours)' },
      { k: 'gapK', label: 'Ralentissement selon le gain déjà fait' },
      { k: 'gapFactorMin', label: 'Facteur de ralentissement minimum' }
    ]
  },
  {
    title: 'Recalibrage sur ton historique',
    fields: [
      { k: 'recalMinWeeks', label: 'Semaines de données minimum' },
      { k: 'recalMinSessions', label: 'Séances minimum' },
      { k: 'recalFullTrustWeeks', label: 'Semaines pour la confiance maximale' },
      { k: 'recalMaxWeight', label: 'Poids maximum de l’historique (0 à 1)' },
      { k: 'recalClampMax', label: 'Plafond du taux observé (× taux théorique)' }
    ]
  },
  {
    title: 'Cibles de séance',
    fields: [
      { k: 'maxGapDays', label: 'Jours de pause au-delà desquels la cible ne monte plus' },
      { k: 'maxJumpPct', label: 'Hausse maximum d’une séance à l’autre (%)', hint: 'Après une séance très en dessous de ton niveau, la cible remonte par paliers.' },
      { k: 'plateauCapReps', label: 'Reps accumulées au maximum sur un plateau', hint: '1,49 = jamais plus d’une rep demandée en plus.' },
      { k: 'belowRangeTolerance', label: 'Reps tolérées sous la fourchette avant de baisser la charge' },
      { k: 'autoRegDeadPct', label: 'Forme du jour : écart ignoré (%)', hint: 'En dessous, les sets suivants ne bougent pas. 3,5 % ≈ une rep.' },
      { k: 'autoRegMaxPct', label: 'Forme du jour : ajustement maximum (%)' },
      { k: 'layoffDays', label: 'Reprise : jours sans faire l’exercice' },
      { k: 'layoffDropPctPerWeek', label: 'Reprise : baisse par semaine d’arrêt (%)' },
      { k: 'layoffMaxDropPct', label: 'Reprise : baisse maximum (%)' }
    ]
  },
  {
    title: 'Statut et graphiques',
    fields: [
      { k: 'tolerancePct', label: 'Zone de tolérance autour de la courbe attendue (± %)' },
      { k: 'statusWindowWeeks', label: 'Fenêtre glissante du statut (semaines)' },
      { k: 'statusMinSessions', label: 'Séances minimum dans la fenêtre' },
      { k: 'aheadRatio', label: '« En avance » à partir de (× rythme attendu)' },
      { k: 'onTrackRatio', label: '« Dans la cible » à partir de (× rythme attendu)' },
      { k: 'stagnationPct', label: 'Stagnation sous (% par semaine)' },
      { k: 'regressionPct', label: 'Régression sous (− % par semaine)' },
      { k: 'rirDriftWarn', label: 'Écart de RIR moyen qui déclenche un conseil' }
    ]
  },
  {
    title: 'Fatigue et décharge',
    fields: [
      { k: 'deloadAfterStalls', label: 'Périodes sans progrès avant de proposer une décharge' },
      { k: 'fatigueShare', label: 'Part d’exercices bloqués qui signale une fatigue générale (0 à 1)' },
      { k: 'deloadSetFactor', label: 'Décharge : part des sets conservée (0 à 1)' },
      { k: 'deloadRirBonus', label: 'Décharge : reps en réserve ajoutées' }
    ]
  },
  {
    title: 'Volume',
    fields: [
      { k: 'hardSetRir', label: 'Un set est « dur » jusqu’à (RIR)' },
      { k: 'secondaryWeight', label: 'Valeur d’un set pour un muscle secondaire' },
      { k: 'volumeLow', label: 'Bas de la zone conseillée (sets par semaine)' },
      { k: 'volumeHigh', label: 'Haut de la zone conseillée (sets par semaine)' }
    ]
  },
  {
    title: 'Corps et récupération',
    intro: 'Vitesses en % du poids de corps par semaine, protéines en g par kg et par jour.',
    fields: [
      { r: 'bulkRate', label: 'Prise de masse : vitesse conseillée' },
      { r: 'cutRate', label: 'Sèche : vitesse conseillée' },
      { r: 'proteinRange', label: 'Protéines (maintien et prise)' },
      { r: 'proteinCutRange', label: 'Protéines (sèche)' },
      { k: 'sleepTarget', label: 'Sommeil conseillé (heures)' }
    ]
  }
];

/** Tous les seuils du moteur, modifiables. */
export function EngineSettings({ settings }: { settings: Settings }) {
  const e = settings.engine;
  const setE = (patch: Partial<EngineParams>) => saveSettings({ engine: { ...e, ...patch } });
  return (
    <div>
      <BackButton fallback="reglages" />
      <PageHeader title="Moteur de progression">
        <p className="mt-2 text-[15px] leading-relaxed text-mute">Chaque règle et chaque seuil du moteur. Les valeurs par défaut conviennent à la plupart des pratiquants : ne les change que si tu sais pourquoi.</p>
      </PageHeader>

      {GROUPS.map((g) => (
        <section key={g.title}>
          <SectionHeader title={g.title} />
          <div className="card space-y-4 p-4">
            {g.intro && <p className="text-xs leading-relaxed text-faint">{g.intro}</p>}
            {g.fields.map((f) =>
              'r' in f ? (
                <div key={f.r}>
                  <div className="mb-1.5 text-sm text-mute">{f.label}</div>
                  <div className="flex items-center gap-2">
                    <NumInput ariaLabel={`${f.label} minimum`} value={e[f.r][0]} onChange={(v) => v != null && setE({ [f.r]: [v, e[f.r][1]] } as Partial<EngineParams>)} />
                    <span className="text-faint">à</span>
                    <NumInput ariaLabel={`${f.label} maximum`} value={e[f.r][1]} onChange={(v) => v != null && setE({ [f.r]: [e[f.r][0], v] } as Partial<EngineParams>)} />
                  </div>
                  {f.hint && <p className="mt-1 text-xs text-faint">{f.hint}</p>}
                </div>
              ) : (
                <label key={f.k} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-mute">{f.label}</span>
                    {f.hint && <span className="block text-xs text-faint">{f.hint}</span>}
                  </span>
                  <NumInput className="w-24 shrink-0 text-center" ariaLabel={f.label} value={e[f.k]} onChange={(v) => v != null && setE({ [f.k]: v } as Partial<EngineParams>)} />
                </label>
              )
            )}
          </div>
        </section>
      ))}

      <button
        className="btn btn-danger mt-6 w-full"
        onClick={async () => {
          if (!(await dialog.confirm({ title: 'Rétablir les valeurs par défaut ?', message: 'Tous les seuils du moteur reviennent à leur réglage d’origine.', confirmLabel: 'Rétablir', danger: true }))) return;
          await saveSettings({ engine: DEFAULT_ENGINE });
          toast('Moteur réinitialisé');
        }}
      >
        <RotateCcw size={18} /> Rétablir les valeurs par défaut
      </button>
    </div>
  );
}
