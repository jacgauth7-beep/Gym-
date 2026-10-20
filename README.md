# Carnet de muscu — PWA iPhone

Application de suivi d'entraînement, hors ligne, pensée pour une main au gym.
React + TypeScript + Vite, `vite-plugin-pwa`, Dexie (IndexedDB), Recharts, Tailwind, dnd-kit.

Toutes les données restent **sur le téléphone** (IndexedDB). Pense à exporter une sauvegarde de temps en temps (Réglages → Données).

## Développement

```bash
npm install
npm run dev        # http://localhost:5173 (accessible depuis le téléphone sur le même Wi-Fi)
npm test           # tests du moteur de progression et du parseur de plates
npm run build      # build de production dans dist/
```

## Structure

| Fichier | Rôle |
|---|---|
| `src/lib/engine.ts` | Moteur de progression : vitesse attendue, recalibrage, cibles par set, projections, statut, volume. Chaque calcul renvoie son « pourquoi ». |
| `src/lib/e1rm.ts` | Epley corrigé par le RIR : `charge × (1 + (reps + RIR) / 30)` |
| `src/lib/plates.ts` | Notation « 2 plates + 25 » → total |
| `src/lib/timer.ts` | Minuteur de repos basé sur l'horodatage de fin + son / vibration / notification |
| `src/lib/defaults.ts` | Tous les seuils paramétrables + programme de départ |
| `src/pages/*` | Séance, Programme (split + bibliothèque), Progrès, Réglages |

## Déployer gratuitement

### Option A : GitHub Pages (déjà configuré)

1. Fusionne cette branche dans `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Chaque push sur `main` lance `.github/workflows/deploy.yml` (tests, build, publication).
4. L'app est servie à `https://<ton-utilisateur>.github.io/<nom-du-repo>/`.

### Option B : Vercel

1. Sur vercel.com, **Add New → Project** puis importe le dépôt GitHub.
2. Framework : Vite (détecté). Build : `npm run build`, dossier de sortie : `dist`. Rien d'autre à changer : la base `/` est celle par défaut.
3. Deploy. Chaque push redéploie automatiquement.

### Installer sur l'iPhone

1. Ouvre l'URL dans **Safari** (pas Chrome : sur iOS, seul Safari installe les PWA de façon fiable).
2. Bouton Partager → **Sur l'écran d'accueil** → Ajouter.
3. Lance l'app une fois avec du réseau : le service worker met tout en cache. Elle marche ensuite hors ligne.
4. Les mises à jour s'installent toutes seules à l'ouverture suivante quand tu as du réseau.

⚠️ Les données de la PWA installée sont **séparées** de celles de Safari. Si tu supprimes l'icône, les données sont effacées. Exporte une sauvegarde avant.

## Minuteur : les limites d'iOS

- **Exactitude** : le minuteur stocke l'heure de fin, pas un compteur. Il reste donc juste après un verrouillage d'écran ou un passage en arrière-plan.
- **Son** : iOS suspend le JavaScript d'une PWA en arrière-plan ou écran verrouillé. Le son ne joue que si l'app est à l'écran à la fin du repos. Il dépend aussi du volume, et le mode silencieux peut le couper. L'audio est « déverrouillé » à chaque validation de set, parce qu'iOS exige un geste de l'utilisateur.
- **Vibration** : l'API Vibration n'existe pas dans Safari iOS. Elle ne marche que sur Android.
- **Notifications** : possibles seulement pour une PWA installée sur l'écran d'accueil (iOS 16.4+), après autorisation (Réglages → Notification). iOS ne permet pas de programmer une notification locale à l'avance, et le JS est gelé en arrière-plan : la notification ne part donc que si l'app tourne encore à ce moment-là. Une alerte fiable écran verrouillé demanderait un serveur Web Push qui envoie la notification au bon moment. Ça sort du cadre « 100 % local et gratuit ».
- **Conseil pratique** : pendant la séance, garde l'app au premier plan et règle le verrouillage automatique sur 5 min ou « Jamais ».

## Moteur de progression (résumé)

1. **Taux théorique** (%/sem du 1RM estimé) = milieu de la fourchette du niveau × facteur composé/isolation × facteur poids de corps × facteur « gain déjà fait depuis les débuts ».
   - Le facteur poids de corps vient de la tendance réelle des pesées (≥ 10 jours sur les 4 dernières semaines) ou, à défaut, de l'objectif (prise, maintien, sèche).
2. **Recalibrage** : après 4 semaines et 4 séances, régression linéaire du meilleur 1RM estimé par séance. Le taux final mélange théorie et historique, avec un poids de l'historique qui monte jusqu'à 70 % à 12 semaines. Le taux observé est borné.
3. **Cible par set** : 1RM estimé du set de référence de la dernière séance × (1 + taux)^(semaines écoulées). On calcule les reps nécessaires au même poids au RIR cible (arrondies à la demi-rep au-dessus). Au-delà du haut de la fourchette, on ajoute le plus petit incrément de charge (double progression).
4. **Statut** sur une fenêtre glissante (4 semaines, ≥ 3 séances) : En avance / Dans la cible / Progression lente / Stagnation / Régression. Une décharge est proposée après 2 fenêtres sans progrès. L'app avertit aussi si le RIR moyen s'éloigne de la cible.

Tous les seuils se règlent dans **Réglages → Moteur de progression**.
