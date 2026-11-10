# Carnet de muscu

Application de suivi d'entraînement pour iPhone (PWA), hors ligne, pensée pour une seule main au gym.
Elle calcule une cible pour chaque set, explique pourquoi, et un coach lit tes données pour te dire quoi corriger.

**App en ligne : https://jacgauth7-beep.github.io/Gym-/**

Toutes les données restent **sur le téléphone** (IndexedDB). Rien n'est envoyé ailleurs. Pense à exporter une sauvegarde de temps en temps (Réglages → Données).

## Ce que fait l'app

| Onglet | Contenu |
|---|---|
| **Séance** | La séance du jour s'ouvre toute seule. Saisie sans clavier (boutons + et −, plates, demi-reps, RIR), cible et « dernière fois » pour chaque set, minuteur de repos automatique, échauffement suggéré, swap ponctuel, bilan de fin de séance. Les jours sans séance affichent un écran de repos. |
| **Programme** | Split modifiable (glisser-déposer, remplacer en 2 taps, déplacer entre jours), analyse du volume prévu par muscle et de la durée des séances, bibliothèque d'exercices. |
| **Progrès** | Semaine en cours, conseils du coach, volume réel par muscle, poids de corps, records, courbe de 1RM estimé réelle et attendue pour chaque exercice. |
| **Historique** | Calendrier des séances, détail, correction ou suppression d'un set après coup. |
| **Réglages** | Profil, minuteur, tous les seuils du moteur, guide scientifique avec références, sauvegarde. |

## Développement

```bash
npm install
npm run dev        # http://localhost:5173 (accessible depuis le téléphone sur le même Wi-Fi)
npm test           # 57 tests : moteur, coach, poids de corps, base de données, sauvegarde
npm run build      # vérification TypeScript + build de production dans dist/
```

Stack : React + TypeScript + Vite, `vite-plugin-pwa`, Dexie (IndexedDB), Recharts, Tailwind, dnd-kit, icônes Lucide.

## Structure

| Fichier | Rôle |
|---|---|
| `src/lib/engine.ts` | Moteur de progression : vitesse attendue, recalibrage, cibles par set, autorégulation, décharge, records, projections, statut, volume. Chaque calcul renvoie son « pourquoi ». |
| `src/lib/insights.ts` | Coach : conseils classés par priorité à partir des données (volume, effort, repos, fatigue, régularité, poids, sommeil). |
| `src/lib/body.ts` | Poids de corps : tendance lissée, vitesse de prise ou de perte, cible de protéines. |
| `src/lib/science.ts` | Guide scientifique et références. |
| `src/lib/e1rm.ts` | Epley corrigé par le RIR : `charge × (1 + (reps + RIR) / 30)`. |
| `src/lib/plates.ts` | Notation « 2 plates + 25 » ↔ charge totale. |
| `src/lib/session.ts` | Séance du jour (jour calé, rotation ou repos), brouillon non enregistré tant qu'aucune action, nettoyage des séances oubliées. |
| `src/lib/timer.ts` | Minuteur basé sur l'horodatage de fin, son, notification, écran allumé (Wake Lock). |
| `src/lib/pwa.ts` | Service worker et mises à jour (rechargement automatique au lancement, bandeau en pleine séance). |
| `src/lib/defaults.ts` | Tous les seuils paramétrables + programme d'exemple. |
| `src/db.ts` | Schéma Dexie, réglages, sauvegarde et restauration. |
| `src/ui/` | Système de design : composants de base, panneaux, dialogues, toasts, icônes. |
| `src/pages/` | Écrans. |

## Moteur de progression

1. **Vitesse attendue** (% de 1RM estimé par semaine) = milieu de la fourchette du niveau × facteur composé/isolation × facteur poids de corps × facteur « gain déjà fait ».
   Le facteur poids de corps vient de la tendance réelle des pesées (au moins 4 pesées sur 14 jours) ou, à défaut, de l'objectif.
2. **Recalibrage** : après 4 semaines et 4 séances, régression linéaire du meilleur 1RM estimé par séance. Le taux final mélange théorie et historique (jusqu'à 70 % d'historique à 12 semaines).
3. **Cible par set**, en reps entières :
   - référence = le même set de la dernière séance, ou la médiane des 3 dernières si la dernière était sous ton niveau (jamais plus de +5 % d'une séance à l'autre) ;
   - on y ajoute la progression attendue ; sur un plateau elle s'accumule depuis le début du plateau, plafonnée à une rep ;
   - l'arrondi est réparti entre les sets (méthode du plus fort reste) : le « +1 rep » va au set qui en est le plus proche ;
   - au-dessus de la fourchette, la charge monte du plus petit incrément, sauf si l'incrément est trop gros ; nettement en dessous, elle baisse du minimum nécessaire ;
   - après plus de 3 semaines sans faire l'exercice, la cible repart un peu plus bas.
4. **Autorégulation** : pendant la séance, les sets restants s'ajustent à la forme du jour (zone morte d'environ une rep, ajustement plafonné à 10 %) et à la charge réellement choisie.
5. **Statut** sur une fenêtre glissante de 4 semaines : En avance, Dans la cible, Progression lente, Stagnation, Régression.
6. **Décharge** : proposée quand la majorité des exercices bloque en même temps. Pendant 7 jours : moitié moins de sets, 2 reps de plus en réserve, mêmes charges. Ces séances sont exclues des tendances et des records.

Tous les seuils se règlent dans **Réglages → Moteur de progression**. Les sources scientifiques sont dans **Réglages → Guide scientifique** (`src/lib/science.ts`).

## Déploiement

Chaque push sur `main` lance `.github/workflows/deploy.yml` : tests, build, puis publication dans la branche `gh-pages`, servie par GitHub Pages. Le dépôt doit être public (Pages gratuit ne sert pas les dépôts privés).

Pour Vercel : importer le dépôt, framework Vite, rien d'autre à régler (la base `/` est celle par défaut).

### Installer sur l'iPhone

1. Ouvrir l'URL dans **Safari**.
2. Partager → **Sur l'écran d'accueil** → Ajouter.
3. Lancer l'app une fois avec du réseau : tout est mis en cache, elle marche ensuite hors ligne.

Les mises à jour s'installent toutes seules au lancement. En pleine séance, un bandeau « Nouvelle version prête » apparaît à la place : rien ne se recharge sans ton accord.

Les données de l'app installée sont séparées de celles de Safari. Supprimer l'icône efface les données : exporter une sauvegarde avant.

## Minuteur : les limites d'iOS

- **Exactitude** : le minuteur stocke l'heure de fin, pas un compteur. Il reste juste après un verrouillage d'écran.
- **Son** : iOS met une app web en pause dès qu'elle quitte l'écran. Le son ne sonne que si l'app est affichée à la fin du repos. L'app garde donc l'écran allumé pendant la séance (Wake Lock, réglable). Le son se mélange à la musique mais suit le bouton silencieux.
- **Vibration** : l'API Vibration n'existe pas dans Safari iOS.
- **Notifications** : seulement pour l'app installée (iOS 16.4+), et seulement si l'app tourne encore à la fin du repos. iOS ne permet pas de programmer une notification locale. Une alerte fiable écran verrouillé demanderait un serveur Web Push.

## Compatibilité des données

Le schéma IndexedDB est versionné (`src/db.ts`). La version 2 ajoute une table sans toucher aux données existantes ; `src/db.test.ts` vérifie le passage v1 → v2 et la restauration d'anciennes sauvegardes.
