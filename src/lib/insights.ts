/**
 * Coach : lit tes données et en tire des conseils classés par priorité.
 * Chaque conseil dit ce qu'il a mesuré (« pourquoi ») et renvoie à la section du guide qui le justifie.
 */
import { MAJOR_MUSCLES, type BodyWeight, type Checkin, type Exercise, type ProgramDay, type Session, type Settings } from '../types';
import { assessBodyweight, bodyweightTrend } from './body';
import { repsFor, rirForCalc } from './e1rm';
import {
  exerciseHistory,
  exerciseStatus,
  expectedRate,
  isDone,
  levelFromYears,
  plannedWeekly,
  weeklyMuscleStats,
  type EngineContext,
  type ExerciseSession,
  type RateResult,
  type StatusResult
} from './engine';
import { DAY_MS, WEEK_MS, fmt, fmtClock, fmtDate, mean, median, plural, weekStart } from './util';

export type Severity = 'alert' | 'warn' | 'info' | 'good';
export type InsightIcon = 'volume' | 'effort' | 'rest' | 'fatigue' | 'progress' | 'body' | 'sleep' | 'adherence' | 'backup' | 'range' | 'deload' | 'start';

export interface Insight {
  id: string;
  severity: Severity;
  icon: InsightIcon;
  title: string;
  text: string;
  why: string[];
  /** Section du guide scientifique qui appuie le conseil. */
  guide?: string;
  action?: { label: string; kind: 'deload' | 'link'; href?: string };
}

export interface AnalysisInput {
  /** Séances terminées, ou en cours avec au moins un set validé. */
  sessions: Session[];
  exercises: Map<string, Exercise>;
  days: ProgramDay[];
  bodyweights: BodyWeight[];
  checkins: Checkin[];
  settings: Settings;
  now: number;
}

export interface ExerciseAnalysis {
  ex: Exercise;
  history: ExerciseSession[];
  rate: RateResult;
  status: StatusResult;
  plan: { repMin: number; repMax: number; rirTarget: number };
  inProgram: boolean;
}

/** Plan (fourchette, RIR) de l'exercice : celui du programme s'il y figure. */
export function planFor(exId: string, days: ProgramDay[]): { repMin: number; repMax: number; rirTarget: number } | null {
  for (const d of days) for (const it of d.items) if (it.exerciseId === exId) return it;
  return null;
}

export function analyzeExercises(input: AnalysisInput): ExerciseAnalysis[] {
  const ctx: EngineContext = { settings: input.settings, bodyweights: input.bodyweights, now: input.now };
  const ids = new Set<string>();
  for (const s of input.sessions) for (const e of s.exercises) if (!e.skipped && e.sets.some(isDone)) ids.add(e.exerciseId);
  const out: ExerciseAnalysis[] = [];
  for (const id of ids) {
    const ex = input.exercises.get(id);
    if (!ex) continue;
    const history = exerciseHistory(input.sessions, id);
    if (!history.length) continue;
    const p = planFor(id, input.days);
    const plan = p ?? { repMin: 8, repMax: 12, rirTarget: 1 };
    const rate = expectedRate(ex, history, ctx);
    const status = exerciseStatus(history, rate.rate, plan.rirTarget, input.settings.engine);
    out.push({ ex, history, rate, status, plan, inProgram: !!p });
  }
  return out.sort((a, b) => a.ex.name.localeCompare(b.ex.name, 'fr'));
}

// ---------------------------------------------------------------- résumé de la semaine

export interface WeekSummary {
  done: number;
  /** Séances prévues par semaine, si le programme est calé sur des jours. */
  planned: number | null;
  hardSets: number;
  prs: number;
  minutes: number;
  /** Semaines d'affilée où l'objectif de séances a été tenu. */
  streak: number;
}

export const plannedPerWeek = (days: ProgramDay[]): number | null => {
  const n = days.reduce((a, d) => a + d.weekdays.length, 0);
  return n > 0 ? n : null;
};

export function weekSummary(input: AnalysisInput, analyses: ExerciseAnalysis[]): WeekSummary {
  const wk = weekStart(input.now);
  const finished = input.sessions.filter((s) => s.exercises.some((e) => e.sets.some(isDone)));
  const mine = finished.filter((s) => weekStart(s.startedAt) === wk);
  const p = input.settings.engine;
  const hardSets = mine.reduce(
    (a, s) => a + s.exercises.reduce((b, e) => b + (e.skipped ? 0 : e.sets.filter((x) => isDone(x) && rirForCalc(x.rir) <= p.hardSetRir).length), 0),
    0
  );
  const minutes = mine.reduce((a, s) => a + (s.endedAt ? (s.endedAt - s.startedAt) / 60000 : 0), 0);
  const prs = analyses.reduce((a, an) => a + an.history.filter((h) => h.isE1rmPR && weekStart(h.date) === wk).length, 0);
  const planned = plannedPerWeek(input.days);
  const need = planned ? Math.max(1, Math.ceil(planned * 0.75)) : 1;
  const perWeek = new Map<number, number>();
  for (const s of finished) perWeek.set(weekStart(s.startedAt), (perWeek.get(weekStart(s.startedAt)) ?? 0) + 1);
  let streak = (perWeek.get(wk) ?? 0) >= need ? 1 : 0;
  for (let w = weekStart(wk - DAY_MS); (perWeek.get(w) ?? 0) >= need; w = weekStart(w - DAY_MS)) streak++;
  return { done: mine.length, planned, hardSets, prs, minutes: Math.round(minutes), streak };
}

// ---------------------------------------------------------------- conseils

const ORDER: Record<Severity, number> = { alert: 0, warn: 1, info: 2, good: 3 };

export function buildInsights(input: AnalysisInput, analyses: ExerciseAnalysis[] = analyzeExercises(input)): Insight[] {
  const { settings, now } = input;
  const p = settings.engine;
  const out: (Insight & { rank: number })[] = [];
  const push = (rank: number, i: Insight) => out.push({ ...i, rank });
  const worked = input.sessions.filter((s) => s.exercises.some((e) => e.sets.some(isDone)));

  if (worked.length < 2) {
    push(0, {
      id: 'start',
      severity: 'info',
      icon: 'start',
      title: 'Le coach s’échauffe',
      text: 'Encore une ou deux séances et il aura de quoi analyser ton volume, ton effort et ta progression.',
      why: ['Les conseils s’appuient sur tes séances enregistrées : il en faut au moins deux pour dégager une tendance.']
    });
  }

  const deloadActive = settings.deloadUntil != null && settings.deloadUntil > now;
  if (deloadActive) {
    push(0, {
      id: 'deload-active',
      severity: 'info',
      icon: 'deload',
      title: 'Semaine de décharge en cours',
      text: `Jusqu’au ${fmtDate(settings.deloadUntil!)} : moitié moins de sets, plus loin de l’échec, mêmes charges. Ces séances ne comptent pas dans tes tendances.`,
      why: ['Une décharge réduit le stress d’entraînement pour dissiper la fatigue sans perdre le geste ni la force.'],
      guide: 'decharge'
    });
  }

  // ---------- fatigue générale / exercices bloqués
  const evaluated = analyses.filter((a) => a.inProgram && a.status.kind !== 'insufficient');
  const stuck = evaluated.filter((a) => a.status.kind === 'stall' || a.status.kind === 'regress');
  if (!deloadActive && evaluated.length >= 4 && stuck.length / evaluated.length >= p.fatigueShare) {
    push(0, {
      id: 'fatigue',
      severity: 'alert',
      icon: 'fatigue',
      title: 'Fatigue générale probable',
      text: `${stuck.length} exercices sur ${evaluated.length} stagnent ou reculent en même temps. Quand tout bloque à la fois, la cause est rarement l’exercice : une semaine de décharge est le meilleur levier.`,
      why: [
        ...stuck.slice(0, 5).map((a) => `${a.ex.name} : ${a.status.observed != null ? `${a.status.observed >= 0 ? '+' : ''}${fmt(a.status.observed, 2)} %/sem` : a.status.label} pour +${fmt(a.rate.rate, 2)} attendus.`),
        'Vérifie aussi ton sommeil et tes calories : un déficit ou des nuits courtes produisent le même tableau.'
      ],
      guide: 'decharge',
      action: { label: 'Activer une semaine de décharge', kind: 'deload' }
    });
  } else {
    const long = stuck.filter((a) => a.status.stalls >= p.deloadAfterStalls);
    if (long.length) {
      push(1, {
        id: 'stalls',
        severity: 'warn',
        icon: 'fatigue',
        title: long.length === 1 ? `${long[0].ex.name} est bloqué` : `${long.length} exercices bloqués`,
        text:
          long.length === 1
            ? `Aucun progrès depuis ${long[0].status.stalls * p.statusWindowWeeks} semaines alors que le reste avance. Change de variante, de fourchette de reps ou de place dans la séance.`
            : 'Ces exercices ne progressent plus alors que le reste avance. Change de variante, de fourchette de reps ou de place dans la séance.',
        why: long.map((a) => `${a.ex.name} : ${a.status.stalls} périodes de ${p.statusWindowWeeks} semaines sans progrès.`),
        guide: 'progression'
      });
    }
  }

  // ---------- progression
  if (evaluated.length >= 3) {
    const ok = evaluated.filter((a) => a.status.kind === 'ahead' || a.status.kind === 'ontrack');
    if (ok.length / evaluated.length >= 0.6) {
      push(1, {
        id: 'progress',
        severity: 'good',
        icon: 'progress',
        title: 'Ta progression est au rendez-vous',
        text: `${ok.length} exercices sur ${evaluated.length} avancent au rythme attendu ou plus vite. Ne change rien.`,
        why: ok.slice(0, 6).map((a) => `${a.ex.name} : ${a.status.observed != null ? `+${fmt(a.status.observed, 2)} %/sem` : ''} pour +${fmt(a.rate.rate, 2)} attendus.`),
        guide: 'progression'
      });
    }
  }

  // ---------- volume par muscle
  const stats = weeklyMuscleStats(worked, input.exercises, p);
  const thisWeek = weekStart(now);
  const fullWeeks = [weekStart(thisWeek - DAY_MS), weekStart(thisWeek - 8 * DAY_MS)].filter((w) => stats.has(w) && worked.some((s) => weekStart(s.startedAt) === w));
  const planned = plannedWeekly(input.days, input.exercises, p);
  const primaries = [...planned.entries()].filter(([m, v]) => v.direct > 0 && MAJOR_MUSCLES.has(m)).map(([m]) => m);
  if (fullWeeks.length && primaries.length) {
    const avg = (m: string) => mean(fullWeeks.map((w) => stats.get(w)?.get(m)?.sets ?? 0));
    const low = primaries.map((m) => ({ m, sets: avg(m), plan: planned.get(m)!.sets })).filter((x) => x.sets < p.volumeLow - 0.25).sort((a, b) => a.sets - b.sets);
    const high = primaries.map((m) => ({ m, sets: avg(m) })).filter((x) => x.sets > p.volumeHigh * 1.25);
    const span = fullWeeks.length > 1 ? 'en moyenne sur 2 semaines' : 'la semaine dernière';
    if (low.length) {
      const programLow = low.filter((x) => x.plan < p.volumeLow - 0.25);
      push(2, {
        id: 'volume-low',
        severity: low.some((x) => x.sets < p.volumeLow * 0.6) ? 'warn' : 'info',
        icon: 'volume',
        title: low.length === 1 ? `Volume bas : ${low[0].m}` : `Volume bas sur ${low.length} muscles`,
        text: programLow.length
          ? `Ton programme prévoit moins de ${p.volumeLow} sets durs par semaine pour ${programLow.map((x) => x.m).slice(0, 3).join(', ')}. Ajoute 2 à 4 sets si tu veux développer ${programLow.length > 1 ? 'ces muscles' : 'ce muscle'}.`
          : `Tu as fait moins de sets durs que prévu ${span}. Des séances ou des sets ont sauté : c’est le premier levier à remettre en place.`,
        why: [
          ...low.slice(0, 6).map((x) => `${x.m} : ${fmt(x.sets)} sets durs ${span} (programme : ${fmt(x.plan)}, zone ${p.volumeLow}–${p.volumeHigh}).`),
          `Un set est « dur » à ${p.hardSetRir} RIR ou moins. Un muscle secondaire compte pour ${fmt(p.secondaryWeight, 2)} set.`
        ],
        guide: 'volume',
        action: programLow.length ? { label: 'Voir le programme', kind: 'link', href: '#/programme' } : undefined
      });
    } else {
      push(3, {
        id: 'volume-ok',
        severity: 'good',
        icon: 'volume',
        title: 'Volume dans la zone',
        text: `Tous tes muscles prioritaires reçoivent au moins ${p.volumeLow} sets durs par semaine.`,
        why: primaries.slice(0, 8).map((m) => `${m} : ${fmt(avg(m))} sets durs ${span}.`),
        guide: 'volume'
      });
    }
    if (high.length) {
      push(3, {
        id: 'volume-high',
        severity: 'info',
        icon: 'volume',
        title: `Volume très élevé : ${high.map((x) => x.m).slice(0, 2).join(', ')}`,
        text: 'Au-delà de la zone, chaque set ajouté rapporte de moins en moins et coûte de la récupération. Garde ce volume seulement si tu progresses et récupères bien.',
        why: high.map((x) => `${x.m} : ${fmt(x.sets)} sets durs ${span} (zone ${p.volumeLow}–${p.volumeHigh}).`),
        guide: 'volume'
      });
    }
  }

  // ---------- effort (proximité de l'échec) et repos, sur 14 jours
  const recent = worked.filter((s) => s.startedAt >= now - 14 * DAY_MS && !s.deload);
  const rirs: number[] = [];
  const targets: number[] = [];
  const restRatios: number[] = [];
  const restActual: number[] = [];
  const restPlan: number[] = [];
  for (const s of recent)
    for (const e of s.exercises) {
      if (e.skipped) continue;
      const ex = input.exercises.get(e.exerciseId);
      const planRest = e.restSec ?? ex?.restSec ?? settings.defaultRestSec;
      e.sets.forEach((x, i) => {
        if (!isDone(x)) return;
        rirs.push(rirForCalc(x.rir));
        targets.push(e.rirTarget);
        // repos mesuré seulement entre deux sets du même exercice, hors pauses anormales
        if (i > 0 && e.sets[i - 1].done && x.restTakenSec != null && x.restTakenSec > 20 && x.restTakenSec < 900) {
          restRatios.push(x.restTakenSec / planRest);
          restActual.push(x.restTakenSec);
          restPlan.push(planRest);
        }
      });
    }
  if (rirs.length >= 20) {
    const far = rirs.filter((r) => r > p.hardSetRir).length / rirs.length;
    const fail = rirs.filter((r) => r === 0).length / rirs.length;
    const target = mean(targets);
    if (far > 0.2) {
      push(2, {
        id: 'effort-low',
        severity: 'warn',
        icon: 'effort',
        title: 'Trop de sets loin de l’échec',
        text: `${fmt(far * 100, 0)} % de tes sets s’arrêtent à plus de ${p.hardSetRir} reps de l’échec. Ils fatiguent sans vraiment stimuler : rapproche-toi de ta cible de RIR.`,
        why: [`${rirs.length} sets analysés sur 14 jours, RIR moyen ${fmt(mean(rirs))} pour ${fmt(target)} visé.`, 'La croissance musculaire augmente à mesure que les sets se terminent près de l’échec.'],
        guide: 'effort'
      });
    } else if (fail > 0.7 && target >= 0.75) {
      push(3, {
        id: 'effort-failure',
        severity: 'info',
        icon: 'effort',
        title: 'Tu vas à l’échec presque partout',
        text: `${fmt(fail * 100, 0)} % de tes sets sont notés à 0 RIR alors que ton programme vise ${fmt(target)}. S’arrêter 1 ou 2 reps avant l’échec donne des gains très proches, avec moins de fatigue : garde l’échec pour le dernier set et les isolations.`,
        why: [
          `${rirs.length} sets analysés sur 14 jours.`,
          'C’est pour ça que tes cibles affichent parfois une rep de moins que la dernière fois : 5 reps à 1 RIR valent 6 reps à l’échec.'
        ],
        guide: 'effort'
      });
    }
  }
  if (restRatios.length >= 12) {
    const ratio = median(restRatios);
    const actual = median(restActual);
    const plan = median(restPlan);
    if (ratio < 0.7 && actual < 120) {
      push(3, {
        id: 'rest-short',
        severity: 'info',
        icon: 'rest',
        title: 'Repos plus courts que prévu',
        text: `Tu repars en ${fmtClock(actual)} en médiane pour ${fmtClock(plan)} prévus. Des repos trop courts font perdre des reps aux sets suivants : laisse le minuteur aller au bout sur les gros exercices.`,
        why: [`${restRatios.length} repos mesurés sur 14 jours entre deux sets du même exercice.`],
        guide: 'repos'
      });
    } else if (ratio > 1.4) {
      push(4, {
        id: 'rest-long',
        severity: 'info',
        icon: 'rest',
        title: 'Repos plus longs que le minuteur',
        text: `Tu repars en ${fmtClock(actual)} en médiane pour ${fmtClock(plan)} prévus. Ce n’est pas un problème pour progresser, mais règle le minuteur sur ta vraie durée si c’est voulu.`,
        why: [`${restRatios.length} repos mesurés sur 14 jours entre deux sets du même exercice.`],
        guide: 'repos'
      });
    }
  }

  // ---------- fourchettes de reps
  const below = analyses.filter((a) => {
    if (!a.inProgram) return false;
    const last = a.history[a.history.length - 1];
    const under = last.sets.filter((s) => Math.round(repsFor(s.e1rm, s.weight, a.plan.rirTarget)) < a.plan.repMin - p.belowRangeTolerance).length;
    return under >= Math.ceil(last.sets.length / 2);
  });
  if (below.length >= 3) {
    push(3, {
      id: 'range',
      severity: 'info',
      icon: 'range',
      title: `Charges trop lourdes pour ta fourchette sur ${below.length} exercices`,
      text: 'Tes reps tombent sous le bas de la fourchette. Le moteur propose donc de baisser un peu la charge. Si tu préfères rester lourd, élargis plutôt la fourchette dans Programme : les deux approches construisent du muscle.',
      why: below.slice(0, 6).map((a) => {
        const last = a.history[a.history.length - 1];
        return `${a.ex.name} : ${last.sets.map((s) => `${fmt(s.reps)}`).join(', ')} reps pour ${a.plan.repMin}–${a.plan.repMax} prévues.`;
      }),
      guide: 'charges',
      action: { label: 'Ajuster les fourchettes', kind: 'link', href: '#/programme' }
    });
  }

  // ---------- régularité
  const plannedN = plannedPerWeek(input.days);
  if (plannedN) {
    const weeks = [1, 2, 3].map((k) => weekStart(thisWeek - (k * 7 - 1) * DAY_MS));
    const first = worked.length ? Math.min(...worked.map((s) => s.startedAt)) : now;
    const usable = weeks.filter((w) => w >= weekStart(first));
    if (usable.length >= 2) {
      const counts = usable.map((w) => worked.filter((s) => weekStart(s.startedAt) === w).length);
      const avg = mean(counts);
      if (avg / plannedN < 0.7) {
        push(1, {
          id: 'adherence',
          severity: 'warn',
          icon: 'adherence',
          title: 'La régularité décroche',
          text: `${fmt(avg)} séances par semaine en moyenne pour ${plannedN} prévues. Si ${plannedN} jours ne tiennent pas dans ta vie, passe à un split plus court : un programme suivi bat un programme parfait.`,
          why: usable.map((w, i) => `Semaine du ${fmtDate(w)} : ${counts[i]} ${plural(counts[i], 'séance')}.`),
          action: { label: 'Voir le programme', kind: 'link', href: '#/programme' }
        });
      } else if (avg / plannedN >= 0.9) {
        push(4, {
          id: 'adherence-ok',
          severity: 'good',
          icon: 'adherence',
          title: 'Régularité solide',
          text: `${fmt(avg)} séances par semaine en moyenne pour ${plannedN} prévues. C’est le facteur numéro un.`,
          why: usable.map((w, i) => `Semaine du ${fmtDate(w)} : ${counts[i]} ${plural(counts[i], 'séance')}.`)
        });
      }
    }
  }

  // ---------- poids de corps
  const level = levelFromYears(settings.trainingYears, p);
  const lastBw = input.bodyweights.length ? Math.max(...input.bodyweights.map((b) => b.date)) : null;
  const trend = bodyweightTrend(input.bodyweights, now, p);
  if (trend != null) {
    const a = assessBodyweight(trend, settings.goal, level, p);
    push(a.tone === 'good' ? 4 : 2, {
      id: 'bodyweight',
      severity: a.tone === 'good' ? 'good' : 'warn',
      icon: 'body',
      title: a.title,
      text: a.text,
      why: ['Tendance calculée par régression sur tes pesées des 4 dernières semaines.', 'Le moteur ajuste ta vitesse de progression attendue à cette tendance.'],
      guide: 'nutrition',
      action: { label: 'Voir mon poids', kind: 'link', href: '#/progres/corps' }
    });
  } else if (worked.length >= 3 && (lastBw == null || now - lastBw > 10 * DAY_MS)) {
    push(4, {
      id: 'weigh-in',
      severity: 'info',
      icon: 'body',
      title: lastBw == null ? 'Ajoute ton poids de corps' : 'Pas de pesée récente',
      text: 'Pèse-toi 2 à 4 fois par semaine, le matin à jeun. Le moteur s’en sert pour savoir si tu es vraiment en surplus ou en déficit, et ajuste tes cibles.',
      why: [`Il faut ${p.bwMinPoints} pesées étalées sur ${p.bwMinDays} jours pour mesurer une tendance fiable. Sans elles, le moteur se fie seulement à ton objectif déclaré.`],
      guide: 'nutrition',
      action: { label: 'Ajouter une pesée', kind: 'link', href: '#/progres/corps' }
    });
  }

  // ---------- sommeil
  const sleeps = input.checkins.filter((c) => c.sleepH != null && c.date >= now - 7 * DAY_MS).map((c) => c.sleepH!);
  if (sleeps.length >= 3) {
    const avg = mean(sleeps);
    if (avg < p.sleepTarget - 0.25) {
      push(2, {
        id: 'sleep',
        severity: 'warn',
        icon: 'sleep',
        title: 'Sommeil trop court',
        text: `${fmt(avg)} h par nuit en moyenne cette semaine. Plusieurs nuits courtes d’affilée font baisser la force sur les exercices composés. Vise ${p.sleepTarget} h ou plus avant de toucher au programme.`,
        why: [`${sleeps.length} nuits notées sur les 7 derniers jours.`],
        guide: 'sommeil'
      });
    } else {
      push(5, {
        id: 'sleep-ok',
        severity: 'good',
        icon: 'sleep',
        title: 'Sommeil suffisant',
        text: `${fmt(avg)} h par nuit en moyenne cette semaine : ta récupération a ce qu’il lui faut.`,
        why: [`${sleeps.length} nuits notées sur les 7 derniers jours.`],
        guide: 'sommeil'
      });
    }
  }

  // ---------- sauvegarde
  if (worked.length >= 6 && (settings.lastBackupAt == null || now - settings.lastBackupAt > 30 * DAY_MS)) {
    push(5, {
      id: 'backup',
      severity: 'info',
      icon: 'backup',
      title: settings.lastBackupAt == null ? 'Aucune sauvegarde' : 'Sauvegarde ancienne',
      text: 'Tes données vivent seulement sur ce téléphone. Exporte une sauvegarde vers Fichiers ou iCloud : ça prend dix secondes.',
      why: [
        settings.lastBackupAt == null ? 'Aucun export depuis l’installation.' : `Dernier export le ${fmtDate(settings.lastBackupAt)}.`,
        'Si tu supprimes l’icône de l’écran d’accueil, iOS efface les données de l’app.'
      ],
      action: { label: 'Sauvegarder', kind: 'link', href: '#/reglages' }
    });
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.rank - b.rank).map(({ rank: _rank, ...i }) => i);
}

/** Semaines écoulées depuis la première séance (pour savoir si une analyse a du sens). */
export const weeksOfData = (sessions: Session[], now: number) => (sessions.length ? (now - Math.min(...sessions.map((s) => s.startedAt))) / WEEK_MS : 0);
