/**
 * Guide scientifique : ce que dit la recherche et comment l'app l'applique.
 * Les références sont des publications évaluées par les pairs (sauf mention contraire).
 */

export interface GuideSection {
  id: string;
  title: string;
  /** L'essentiel en une phrase. */
  short: string;
  research: string[];
  inApp: string[];
  refs: string[];
}

const ACSM_2026 =
  'American College of Sports Medicine (2026). Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Medicine & Science in Sports & Exercise, 58(4), 851–872.';
const PELLAND_2026 =
  'Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC (2026). The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. Sports Medicine, 56, 481–505.';

export const GUIDE: GuideSection[] = [
  {
    id: 'volume',
    title: 'Volume : combien de sets par muscle',
    short: 'Vise 10 à 20 sets durs par muscle et par semaine.',
    research: [
      'Plus tu fais de sets par semaine pour un muscle, plus il grossit, mais chaque set ajouté rapporte un peu moins que le précédent (méta-régression de 67 études, Pelland et coll., 2026).',
      'La prise de position 2026 de l’ACSM retient qu’au moins 10 sets par muscle et par semaine favorisent l’hypertrophie.',
      'Un set où le muscle n’est que secondaire (le biceps dans un rowing) compte aussi, à peu près pour moitié.'
    ],
    inApp: [
      'Zone conseillée : 10 à 20 sets durs par muscle et par semaine. Tu peux la changer dans les réglages du moteur.',
      'Un set est « dur » à 3 RIR ou moins. Un muscle secondaire reçoit 0,5 set.',
      'Progrès montre ton volume réel semaine par semaine. Programme montre le volume prévu avant même de t’entraîner.'
    ],
    refs: [
      PELLAND_2026,
      ACSM_2026,
      'Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. Journal of Sports Sciences, 35(11), 1073–1082.'
    ]
  },
  {
    id: 'effort',
    title: 'Effort : jusqu’où pousser un set',
    short: 'Termine tes sets à 0–3 reps de l’échec. L’échec systématique n’est pas nécessaire.',
    research: [
      'Plus un set se termine près de l’échec, plus il stimule la croissance. Pour la force, la proximité de l’échec compte peu (Robinson et coll., 2024).',
      'S’arrêter 1 ou 2 reps avant l’échec a donné la même hypertrophie que l’échec chez des pratiquants entraînés (Refalo et coll., 2024). L’ACSM (2026) conclut que l’échec n’améliore pas les résultats de façon constante.',
      'On sous-estime en moyenne d’environ une rep ce qu’il nous reste. L’estimation est meilleure près de l’échec et sur les sets courts (Halperin et coll., 2022).'
    ],
    inApp: [
      'Chaque exercice a un RIR cible (reps en réserve). Tu notes ton RIR réel d’un tap : 0, 1, 2, 3 ou 4+.',
      'Le 1RM estimé tient compte du RIR : 5 reps à 1 RIR valent 6 reps à l’échec. C’est pour ça qu’une cible peut afficher une rep de moins que ta dernière séance.',
      'Les sets à plus de 3 RIR ne comptent pas dans ton volume. Le coach te prévient si tu t’éloignes de ta cible, dans un sens ou dans l’autre.'
    ],
    refs: [
      'Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC (2024). Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. Sports Medicine, 54(9), 2209–2231.',
      'Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ (2023). Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. Sports Medicine.',
      'Refalo MC, Helms ER, Robinson ZP, Hamilton DL, Fyfe JJ (2024). Similar muscle hypertrophy following eight weeks of resistance training to momentary muscular failure or with repetitions-in-reserve in resistance-trained individuals. Journal of Sports Sciences.',
      'Halperin I, Malleron T, Har-Nir I, et al. (2022). Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. Sports Medicine, 52(2), 377–390.',
      ACSM_2026
    ]
  },
  {
    id: 'charges',
    title: 'Charges et fourchettes de reps',
    short: 'Pour le muscle, la fourchette compte peu si l’effort est là. Pour la force, il faut du lourd.',
    research: [
      'Des charges légères ou lourdes donnent une hypertrophie comparable quand les sets sont poussés assez près de l’échec (Schoenfeld et coll., 2017).',
      'Pour la force maximale, les charges lourdes restent supérieures : 80 % du 1RM ou plus, selon l’ACSM (2026).',
      'La fourchette de reps est donc surtout une affaire de confort, d’articulations et de finesse de progression.'
    ],
    inApp: [
      'Tu choisis la fourchette de chaque exercice. Le moteur garde tes sets dedans : il monte la charge quand tu dépasses le haut, et la baisse seulement si tu es nettement sous le bas.',
      'Si l’incrément de la machine est trop gros, il te laisse dépasser le haut de la fourchette avant de changer de charge.'
    ],
    refs: [
      'Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW (2017). Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis. Journal of Strength and Conditioning Research, 31(12), 3508–3523.',
      ACSM_2026
    ]
  },
  {
    id: 'progression',
    title: 'Surcharge progressive',
    short: 'Ajouter des reps ou ajouter de la charge : les deux font progresser.',
    research: [
      'Progresser en ajoutant des reps ou en ajoutant de la charge a donné des gains de muscle et de force similaires (Plotkin et coll., 2022).',
      'La force monte vite la première année, puis de plus en plus lentement (suivi de près de 15 000 pratiquants, Steele et coll., 2023).'
    ],
    inApp: [
      'Double progression : tu montes les reps jusqu’au haut de la fourchette, puis la charge du plus petit incrément possible.',
      'Vitesse attendue de départ : 1–2 % de 1RM estimé par semaine pour un débutant, 0,5–1 % pour un intermédiaire, 0,25–0,5 % pour un avancé. Ce sont des repères pratiques, pas des constantes scientifiques : après 4 semaines, le moteur les recalibre sur ta progression réelle.',
      'Le 1RM estimé vient de la formule d’Epley, corrigée par le RIR : charge × (1 + (reps + RIR) / 30). Elle est plus fiable sous 10 à 12 reps. L’app s’en sert pour comparer un même exercice dans le temps, pas pour prédire ton vrai maximum.',
      'Les cibles sont en reps entières : le moteur répartit la progression attendue sur tes sets, puis s’ajuste à ta forme du jour pendant la séance.'
    ],
    refs: [
      'Plotkin D, Coleman M, Van Every D, et al. (2022). Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations. PeerJ, 10, e14142.',
      'Steele J, Fisher JP, Giessing J, et al. (2023). Long-Term Time-Course of Strength Adaptation to Minimal Dose Resistance Training Through Retrospective Longitudinal Growth Modeling. Research Quarterly for Exercise and Sport.',
      'Epley B (1985). Poundage Chart. Boyd Epley Workout. Lincoln, NE : Body Enterprises.'
    ]
  },
  {
    id: 'repos',
    title: 'Temps de repos',
    short: 'Au moins 1 min 30 à 2 min entre les sets, davantage sur les gros exercices.',
    research: [
      'Se reposer plus de 60 secondes donne un petit avantage pour l’hypertrophie. Au-delà de 90 secondes, on ne mesure plus de différence nette (méta-analyse de Singer et coll., 2024).',
      'Chez des hommes entraînés, 3 minutes de repos ont donné plus de force et de muscle qu’une minute (Schoenfeld et coll., 2016), sans doute parce qu’on garde ses reps aux sets suivants.'
    ],
    inApp: [
      'Le minuteur démarre tout seul quand tu valides un set : 3:00 par défaut, réglable pour chaque exercice.',
      'Ton repos réel est enregistré. Le coach te prévient s’il est nettement plus court ou plus long que prévu.'
    ],
    refs: [
      'Singer A, Wolf M, Generoso L, et al. (2024). Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. Frontiers in Sports and Active Living, 6, 1429789.',
      'Schoenfeld BJ, Pope ZK, Benik FM, et al. (2016). Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men. Journal of Strength and Conditioning Research, 30(7), 1805–1812.'
    ]
  },
  {
    id: 'frequence',
    title: 'Fréquence par muscle',
    short: 'Deux fois par semaine par muscle est une base solide. Le volume total compte davantage.',
    research: [
      'À volume hebdomadaire égal, la fréquence a peu d’effet propre sur l’hypertrophie. Elle aide davantage la force (Pelland et coll., 2026 ; Schoenfeld et coll., 2019).',
      'Répartir le volume sur deux séances ou plus sert surtout à garder chaque set de bonne qualité.'
    ],
    inApp: ['L’analyse du programme montre combien de fois par semaine chaque muscle est travaillé, et le volume que ça représente.'],
    refs: [
      PELLAND_2026,
      'Schoenfeld BJ, Grgic J, Krieger J (2019). How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis of studies examining the effects of resistance training frequency. Journal of Sports Sciences, 37(11), 1286–1295.'
    ]
  },
  {
    id: 'decharge',
    title: 'Décharge',
    short: 'Décharge quand la fatigue s’installe, pas par calendrier.',
    research: [
      'Des entraîneurs experts définissent la décharge comme une période de stress d’entraînement réduit, pour dissiper la fatigue physique et mentale et préparer le cycle suivant (consensus Delphi, Bell et coll., 2023).',
      'Une semaine d’arrêt complet placée d’office au milieu de 9 semaines n’a rien apporté à l’hypertrophie et a légèrement freiné la force (Coleman et coll., 2024).'
    ],
    inApp: [
      'Le coach propose une décharge quand la majorité de tes exercices stagne en même temps, ou quand un exercice ne progresse plus depuis plusieurs périodes.',
      'Mode décharge : pendant 7 jours, moitié moins de sets, 2 reps de plus en réserve, mêmes charges. Tu gardes le geste et la force, la fatigue retombe.',
      'Les séances de décharge sont exclues de tes tendances et de tes records.'
    ],
    refs: [
      'Bell L, Nolan D, Immonen V, et al. (2023). Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach. Sports Medicine - Open, 9, 87.',
      'Coleman M, Burke R, Augustin F, et al. (2024). Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. PeerJ, 12, e16777.'
    ]
  },
  {
    id: 'sommeil',
    title: 'Sommeil',
    short: 'Au moins 7 heures par nuit. C’est là que tu récupères.',
    research: [
      'Les sociétés savantes du sommeil recommandent au moins 7 heures par nuit pour un adulte (Watson et coll., 2015).',
      'Plusieurs nuits courtes d’affilée font baisser la force sur les mouvements polyarticulaires (Knowles et coll., 2018).',
      'Une seule nuit blanche a réduit la synthèse des protéines musculaires de 18 % dans une étude (Lamon et coll., 2021).'
    ],
    inApp: [
      'Le check-in du jour note ton sommeil en un tap. Le coach te prévient quand ta moyenne passe sous 7 heures.',
      'Regarde ton sommeil avant de conclure qu’un programme ne marche pas : une mauvaise semaine de sommeil ressemble à une stagnation.'
    ],
    refs: [
      'Watson NF, Badr MS, Belenky G, et al. (2015). Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society. Sleep, 38(6), 843–844.',
      'Knowles OE, Drinkwater EJ, Urwin CS, Lamon S, Aisbett B (2018). Inadequate sleep and muscle strength: Implications for resistance training. Journal of Science and Medicine in Sport, 21(9), 959–968.',
      'Lamon S, Morabito A, Arentson-Lantz E, et al. (2021). The effect of acute sleep deprivation on skeletal muscle protein synthesis and the hormonal environment. Physiological Reports, 9(1), e14660.'
    ]
  },
  {
    id: 'nutrition',
    title: 'Protéines et poids de corps',
    short: '1,6 à 2,2 g de protéines par kilo. Prends ou perds du poids lentement.',
    research: [
      'Les gains de masse maigre plafonnent en moyenne vers 1,6 g de protéines par kilo et par jour, avec une marge jusqu’à 2,2 g (Morton et coll., 2018).',
      'En prise de masse : vise +0,25 à +0,5 % de ton poids par semaine, plutôt le bas de la fourchette si tu es avancé, avec un surplus de 10 à 20 % (Iraki et coll., 2019).',
      'En sèche : 0,5 à 1 % par semaine préserve mieux le muscle qu’une perte rapide (Helms et coll., 2014). En fin de sèche, ralentis encore et monte les protéines vers 1,8 à 2,7 g par kilo (Roberts et coll., 2020).'
    ],
    inApp: [
      'La page Poids de corps lisse tes pesées, calcule ta vitesse en % par semaine et la compare à la cible de ton objectif.',
      'Elle affiche ta cible de protéines en grammes par jour.',
      'Le moteur ralentit ta progression attendue quand tu es en déficit : garder ta force en sèche est déjà une victoire.'
    ],
    refs: [
      'Morton RW, Murphy KT, McKellar SR, et al. (2018). A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. British Journal of Sports Medicine, 52(6), 376–384.',
      'Iraki J, Fitschen P, Espinar S, Helms E (2019). Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review. Sports, 7(7), 154.',
      'Helms ER, Aragon AA, Fitschen PJ (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. Journal of the International Society of Sports Nutrition, 11, 20.',
      'Roberts BM, Helms ER, Trexler ET, Fitschen PJ (2020). Nutritional Recommendations for Physique Athletes. Journal of Human Kinetics, 71, 79–108.'
    ]
  },
  {
    id: 'creatine',
    title: 'Créatine',
    short: '3 à 5 g de créatine monohydrate par jour : le complément le mieux documenté.',
    research: [
      'La créatine monohydrate est le complément le plus efficace et le mieux étudié pour la force et la masse maigre. 3 à 5 g par jour suffisent, sans phase de charge obligatoire, et elle est sûre chez l’adulte en bonne santé (position de l’ISSN, Kreider et coll., 2017).'
    ],
    inApp: ['Rien à suivre ici : prends-la chaque jour, le moment de la journée importe peu.', 'Si tu as un problème rénal ou un traitement médical, parles-en d’abord à un professionnel de santé.'],
    refs: [
      'Kreider RB, Kalman DS, Antonio J, et al. (2017). International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine. Journal of the International Society of Sports Nutrition, 14, 18.'
    ]
  },
  {
    id: 'amplitude',
    title: 'Amplitude et technique',
    short: 'Charge le muscle en position étirée, et garde la même technique d’une séance à l’autre.',
    research: [
      'L’amplitude complète fait légèrement mieux que les partielles en moyenne, avec un effet très faible (Wolf et coll., 2023). L’ACSM (2026) la recommande pour la force.',
      'Des partielles en position étirée ont donné des résultats similaires à l’amplitude complète chez des pratiquants entraînés (Wolf et coll., 2025).'
    ],
    inApp: [
      'Les réglages machine de chaque exercice s’affichent pendant la séance pour retrouver exactement la même position.',
      'Note tes partielles ou ton tempo dans la note du set. Si la technique change, une rep de plus n’est pas un vrai progrès.'
    ],
    refs: [
      'Wolf M, Androulakis-Korakakis P, Fisher J, Schoenfeld B, Steele J (2023). Partial Vs Full Range of Motion Resistance Training: A Systematic Review and Meta-Analysis. International Journal of Strength and Conditioning, 3(1).',
      'Wolf M, Korakakis PA, Piñero A, et al. (2025). Lengthened partial repetitions elicit similar muscular adaptations as full range of motion repetitions during resistance training in trained individuals. PeerJ, 13, e18904.',
      ACSM_2026
    ]
  }
];

export const GUIDE_DISCLAIMER =
  'Ces repères viennent d’études sur des groupes : ta réponse individuelle peut être différente, et c’est pour ça que le moteur se recalibre sur tes propres données. Ce guide ne remplace pas un avis médical.';

export const guideSection = (id: string) => GUIDE.find((g) => g.id === id);
