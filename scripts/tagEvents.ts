/**
 * CultureConnect — tagueur v2 des événements (dev-only).
 *
 * Lit des spectacles, appelle un LLM (mêmes clés que `src/lib/phraseAi.ts` :
 * `OPENAI_API_KEY`, sinon `XAI_API_KEY`), valide la sortie, et n'écrit que
 * dans `data/tags_evenements.csv`. Jamais `evenements.csv` ni `programme.csv`.
 *
 * Modèle OpenAI par défaut : `gpt-4o`. `OPENAI_MODEL` le remplace quand elle
 * est non vide. (`XAI_MODEL` reste sur `grok-2-latest`.)
 *
 *   npm run tags:events -- --limit 12 --only-missing
 *   npm run tags:events -- --event E485 --dry-run
 *   npm run tags:events -- --eval-gold
 *   npm run tags:events -- --gold --out bench-results/2026-09-29-tags-gold.md
 *
 * `--eval-gold` / `--gold` compare le modèle au fixture
 * `scripts/fixtures/tag-gold.json` (60 lignes, graine 20260929) et écrit
 * `bench-results/<date>-tags-gold.md`. Ce mode ne touche pas le CSV live.
 * `--dry-run` non plus.
 *
 * Sans `--limit` ni `--event`, une passe hors gold est refusée : le passage
 * sur tout le catalogue est le lot suivant (PR5).
 *
 * Prompt système : §A4, repris tel quel. Few-shot : les 4 exemples §A5
 * déjà en place (TOM, Lio Kuokman / Nelson Goerner, FAT FREDDY'S DROP, Toc Toc),
 * dont les deux cas où la v1 posait `rigolo` à tort, plus 4 ancrages d'ordre
 * (HYPNO5E & HIPPOTRAKTOR, Superpêche, Camping sauvage (quartet), Jeanne Candel).
 * Un court préambule utilisateur (pas de nouvelle valeur d'enum) rappelle
 * l'expérience du spectateur, les 2 ou 3 ambiances, rigolo jamais seul,
 * festif jamais seul sur un concert, l'ordre dansant avant festif, rigolo
 * en tête seulement si le rire est le but, contemplatif / poetique / intimiste,
 * tendre sur un concert doux, brutal avant intense quand la violence sonore
 * est le cœur, la preuve comme sous-chaîne exacte, et l'interdit de poser
 * `rigolo` sur un théâtre sombre ou intense ou sur un récital classique.
 * Validation : enum, cardinalité, rigolo, festif sur un concert, preuve
 * (sous-chaîne normalisée), confiance haute sans preuve. Un rejet, un
 * réessai, puis la ligne est ignorée et loguée.
 *
 * Éval gold : le Manager espace déjà les appels. Indice de throttle, en
 * commentaire seulement : MIN_GAP_MS ≥ 3200. Le script ne l'applique pas.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { mainFromCategorie } from '../src/lib/categories';
import { EVENT_TAGS_V2_COLUMNS } from '../src/lib/eventTags';
import { TASTE_MOODS } from '../src/lib/phraseTags';
import {
  CONFIANCE_VALUES,
  FORMAT_VALUES,
  GOLD_FILE,
  IDEAL_POUR_VALUES,
  NOTORIETE_VALUES,
  SORTIE_VALUES,
  THRESHOLDS,
  assertSafeOut,
  scoreGold,
  textContainsProof,
  type GoldTags,
} from './tagAudit';

/** §A4 — prompt système, repris tel quel. */
export const SYSTEM_PROMPT = [
  "Tu tagues un spectacle vivant à Toulouse pour un moteur de recommandation. Tu décris **l'expérience vécue par le spectateur**, pas la catégorie du spectacle.",
  "Réponds **uniquement** en JSON valide, au format ci-dessous, avec les valeurs **exactes** autorisées. N'invente aucune valeur.",
  '- `moods` : 2 ou 3 parmi [rigolo, tendre, intense, angoissant, epique, brutal, festif, cerveau, intimiste, absurde, critique, sombre, poetique, dansant, contemplatif, leger], la principale en premier. Si tu mets rigolo, ajoute quel rire (absurde, critique, tendre, leger, cerveau, sombre ou intimiste). Pour un concert, festif n\'est jamais seul (ajoute dansant, intense, brutal, epique, poetique, intimiste ou contemplatif). rigolo en premier seulement si le rire est le but du spectacle.',
  '- `sortie` : 1 ou 2 parmi [interessante, agreable, partage, evasion], la principale en premier.',
  '- `energie` : entier de 1 (assis, silence) à 5 (debout, on danse).',
  '- `exigence` : 1 (grand public), 2 (un peu de curiosité), 3 (pour initiés).',
  '- `format_scene` : 1 ou 2 parmi [seul_en_scene, duo, troupe, orchestre, groupe, dj, scene_ouverte, participatif, sans_paroles, lecture, jeune_public].',
  '- `ideal_pour` : 1 à 3 parmi [solo, couple, amis, famille].',
  '- `notoriete` : un parmi [tete_affiche, confirme, emergent, scene_ouverte].',
  '- `confiance` : haute (l\'ambiance principale est **dite** dans le texte), moyenne (déduite avec un indice clair), basse (devinée).',
  '- `preuve` : une citation **exacte** et courte (moins de 120 caractères) du texte, qui justifie l\'ambiance principale.',
  'Si le texte fait moins de 80 caractères utiles, réponds `{"skip": true}`.',
].join('\n');

/** Graine du tirage gold (30 théâtre + 30 concerts). Le JSON ne la répète pas. */
export const GOLD_SEED = '20260929';

export const SHORT_TEXT_CHARS = 80;

export const TAGS_CSV_RELATIVE = path.join('data', 'tags_evenements.csv');

/** Rire qui doit accompagner `rigolo` (§A4). */
export const RIGOLO_LAUGH = [
  'absurde',
  'critique',
  'tendre',
  'leger',
  'cerveau',
  'sombre',
  'intimiste',
] as const;

/** Registre qui doit accompagner `festif` sur un concert (§A4). */
export const FESTIF_COMPANY = [
  'dansant',
  'intense',
  'brutal',
  'epique',
  'poetique',
  'intimiste',
  'contemplatif',
] as const;

/**
 * Les 12 spectacles de référence §A5.
 * Le few-shot en reprend 6 (TOM, Lio Kuokman, Fat Freddy's Drop, Toc Toc,
 * HYPNO5E & HIPPOTRAKTOR, Superpêche) et ajoute deux lignes gold hors §A5
 * (Camping sauvage, Jeanne Candel). Kevin Levy reste ici pour les tests,
 * pas dans le prompt.
 */
export const A5_REFERENCE_TITLES = [
  'Kevin Levy : Cocu',
  'Toc Toc',
  "L'Esprit d'entreprise",
  'Naine Rouge',
  'TOM',
  'Lio Kuokman / Nelson Goerner',
  "FAT FREDDY'S DROP",
  'Xandria + Seven Spires + Tulip',
  'HYPNO5E & HIPPOTRAKTOR',
  'Cornélius',
  'Jam jazz manouche',
  'Superpêche',
] as const;

const ENERGIE_INTS = [1, 2, 3, 4, 5] as const;
const EXIGENCE_INTS = [1, 2, 3] as const;

export type TagInput = {
  event_id: string;
  titre: string;
  categorie: string;
  genre: string;
  description: string;
  citation: string;
  casting: string;
  lieu_nom: string;
  lieu_type: string;
  prix: string;
};

export type TagProposal = {
  moods: string[];
  sortie: string[];
  energie: number;
  exigence: number;
  format_scene: string[];
  ideal_pour: string[];
  notoriete: string;
  confiance: 'haute' | 'moyenne' | 'basse';
  preuve: string;
};

export type ValidationIssue = {
  code: 'json' | 'hors_enum' | 'hors_bornes' | 'rigolo' | 'festif' | 'preuve' | 'haute_sans_preuve';
  detail: string;
};

export type ValidatedTag =
  | { ok: true; value: TagProposal | { skip: true } }
  | { ok: false; issues: ValidationIssue[] };

export type TagEventsArgs = {
  limit: number | null;
  onlyMissing: boolean;
  eventIds: string[];
  dryRun: boolean;
  evalGold: boolean;
  out: string | null;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmEnv = { url: string; key: string; model: string };

export type LlmComplete = (messages: ChatMessage[]) => Promise<string>;

export type TagOutcome =
  | { status: 'tagged'; proposal: TagProposal; attempts: number }
  | { status: 'skip'; reason: 'texte_court' | 'modele'; attempts: number }
  | { status: 'invalid'; issues: ValidationIssue[]; attempts: number };

export type GoldFixtureRow = {
  event_id: string;
  titre: string;
  categorie: string;
  moods: string[];
  sortie: string[];
  energie: number;
  exigence: number;
  format_scene: string[];
  ideal_pour: string[];
  notoriete: string;
  tag_confiance: string;
  tag_preuve: string;
  tag_version: string;
  tagged_by: string;
  skip: boolean;
};

export type GoldThresholdStatus = 'PASS' | 'FAIL' | 'SKIP';

export type GoldReport = {
  generatedAt: string;
  seed: typeof GOLD_SEED;
  fixtureRows: number;
  theatre: number;
  concert: number;
  verdict: GoldThresholdStatus;
  skipReason?: string;
  compared: number;
  missing: number;
  short: number;
  invalid: number;
  modelSkips: number;
  metrics: {
    principalMood: number | null;
    meanJaccard: number | null;
    principalSortie: number | null;
    energieWithin1: number | null;
  };
  thresholds: Array<{
    id: string;
    label: string;
    target: string;
    measure: string;
    status: GoldThresholdStatus;
  }>;
  wroteTagsCsv: false;
};

type FewShot = { title: string; input: TagInput; assistant: string };

/**
 * Rappel collé au message utilisateur de l'événement à taguer.
 * Le prompt système reste le §A4 verbatim : ce texte n'ajoute aucune valeur d'enum.
 * Il n'est pas une source de `preuve` (citation du seul bloc spectacle).
 */
export const USER_PREAMBLE = [
  "Rappel (consigne, pas le texte du spectacle — n'en cite rien dans preuve) :",
  "- Décris l'expérience vécue par le spectateur. Ne pose pas rigolo parce que le titre ou le genre dit comédie ou humour.",
  '- Toujours 2 ou 3 ambiances, la principale en premier.',
  "- rigolo n'est jamais seul : ajoute le type de rire (absurde, critique, tendre, leger, cerveau, sombre ou intimiste). Sur un concert, festif n'est jamais seul (ajoute dansant, intense, brutal, epique, poetique, intimiste ou contemplatif).",
  '- Concert danse, groove, swing, boogie, bal ou marathon dansant : `dansant` avant `festif`. `festif` en premier seulement si la fête, le participatif ou la fanfare dominent la danse.',
  "- Si le but du spectateur est le rire (comédie, stand-up, cabaret, « hilarant », rire) : `rigolo` en premier. Sinon, `rigolo` n'est jamais en premier.",
  '- Distingue `contemplatif` (écoute calme, silence, impro lente, récital, chœur, nature ou temps long), `poetique` (images, langue, onirique) et `intimiste` (proximité, petit format).',
  '- Concert doux, goûter, ballade ou hommage : ne laisse pas `festif` ni `poetique` écraser `tendre`.',
  '- Metal extrême, industriel, sludge, post-metal ou grind : quand la violence sonore est le cœur, `brutal` avant `intense`.',
  '- preuve : citation exacte, sous-chaîne du texte du spectacle fourni, moins de 120 caractères.',
  "- Un théâtre sombre ou intense n'est pas rigolo par défaut. Un récital ou un concert classique n'est pas rigolo.",
  '- Réponds {"skip": true} seulement si le texte utile fait moins de 80 caractères.',
].join('\n');

/**
 * Huit exemples, théâtre et musique. Les quatre premiers sont les §A5 déjà
 * en place (dont deux erreurs v1 `rigolo`). Les quatre suivants ancrent
 * l'ordre d'ambiance : brutal, contemplatif, dansant, rigolo.
 * Textes repris de `data/evenements.csv` (description longue, sinon courte).
 * Toc Toc : la longue n'est que l'accroche salle ; le pitch (courte) porte l'expérience.
 * HYPNO5E, Camping sauvage et Jeanne Candel : moods et axes du gold / §A5.
 * Superpêche : moods et axes §A5.
 */
const FEW_SHOTS: readonly FewShot[] = [
  {
    title: 'TOM',
    input: {
      event_id: 'E485',
      titre: 'TOM',
      categorie: 'theatre_danse',
      genre: 'theatre_contemporain',
      description:
        'Tom vit à San Francisco. Nous sommes en 1986, l’épidémie de SIDA fait des ravages dans la communauté gay. Tom est en train de mourir : on ne le verra pas, mais cinq personnages s’adressent à lui — sa mère, son infirmière, son grand frère, son compagnon, son premier amour — et recréent sa mémoire.',
      citation: '',
      casting: '',
      lieu_nom: 'Le Grenier Théâtre',
      lieu_type: 'theatre',
      prix: '21 € / 14 €',
    },
    assistant:
      '{"moods":["intense","tendre"],"sortie":["interessante"],"energie":2,"exigence":2,"format_scene":["troupe"],"ideal_pour":["couple","solo"],"notoriete":"confirme","confiance":"moyenne","preuve":"l’épidémie de SIDA fait des ravages"}',
  },
  {
    title: 'Lio Kuokman / Nelson Goerner',
    input: {
      event_id: 'E460',
      titre: 'Lio Kuokman / Nelson Goerner',
      categorie: 'musique',
      genre: 'classique_lyrique',
      description:
        'Lio Kuokman dirige l’Orchestre national du Capitole, Nelson Goerner au piano. Au programme : Grand Bazaar de Fazil Say, Burlesque de Richard Strauss, et Shéhérazade de Nikolaï Rimski-Korsakov.',
      citation: '',
      casting: '',
      lieu_nom: 'Halle aux Grains',
      lieu_type: 'salle_concert',
      prix: '',
    },
    assistant:
      '{"moods":["contemplatif","epique"],"sortie":["evasion"],"energie":1,"exigence":2,"format_scene":["orchestre"],"ideal_pour":["couple","solo"],"notoriete":"tete_affiche","confiance":"moyenne","preuve":"Nelson Goerner au piano"}',
  },
  {
    title: "FAT FREDDY'S DROP",
    input: {
      event_id: 'E442',
      titre: "FAT FREDDY'S DROP",
      categorie: 'musique',
      genre: 'musique_autre',
      description:
        'Les Néo-Zélandais Fat Freddy’s Drop fêtent les 21 ans de Based On A True Story : reggae, soul, dub, funk et groove électronique. Tournée mondiale, cinq dates françaises dont le Bikini le 28 septembre. Un live de groove, d’énergie et d’émotion.',
      citation: 'Le plus torride des groupes de Nouvelle-Zélande est de retour.',
      casting: '',
      lieu_nom: 'Le Bikini',
      lieu_type: 'salle_concert',
      prix: 'à partir de 39€',
    },
    assistant:
      '{"moods":["dansant","festif"],"sortie":["partage"],"energie":5,"exigence":1,"format_scene":["groupe"],"ideal_pour":["amis"],"notoriete":"tete_affiche","confiance":"moyenne","preuve":"reggae, soul, dub, funk et groove électronique"}',
  },
  {
    title: 'Toc Toc',
    input: {
      event_id: 'E667',
      titre: 'Toc Toc',
      categorie: 'theatre_danse',
      genre: 'humour_standup',
      description:
        'Prenez six patients atteints de TOC différents, une salle d’attente, un médecin qui n’arrive jamais, une secrétaire dépassée et vous obtenez, sans aucun doute, un huit-clos surprenant et totalement hilarant ! 93% des personnes interrogées avouent avoir au moins un TOC, et vous ?',
      citation: '',
      casting:
        'Julien Roullé Neuville, Pascale Legrand, Adeline Hocdet alternance Camille Dintrans, Marcel Grange, Elodie Ménadier alternance Justine Balalas, Clément Cadinot alternance Hugo Laubies, Sarah Sahafi al',
      lieu_nom: 'Théâtre Les 3 T',
      lieu_type: 'theatre',
      prix: 'Plein : 28€ / Réduit (1) : 25€ / Abonné : 24€',
    },
    assistant:
      '{"moods":["rigolo","absurde","leger"],"sortie":["agreable"],"energie":3,"exigence":1,"format_scene":["troupe"],"ideal_pour":["amis","famille"],"notoriete":"confirme","confiance":"haute","preuve":"un huit-clos surprenant et totalement hilarant"}',
  },
  {
    title: 'HYPNO5E & HIPPOTRAKTOR',
    input: {
      event_id: 'E406',
      titre: 'HYPNO5E & HIPPOTRAKTOR',
      categorie: 'musique',
      genre: 'rock_metal_punk',
      description:
        'Quintet belge de Malines (Pelagic Records) : entre le martèlement polyrhythmique de Meshuggah et le poids atmosphérique de Gojira. Deuxième album Stasis (juin 2024), en co-plateau avec Hypno5e.',
      citation: 'It\'s bold, complex, thoughtful and often malicious, and as a second stroke of genius for this exciting prog metal outfit, a fantastic sign of things to come.',
      casting: '',
      lieu_nom: 'Le Rex',
      lieu_type: 'salle_concert',
      prix: '25,80 € Prévente',
    },
    assistant:
      '{"moods":["brutal","intense","sombre"],"sortie":["evasion"],"energie":5,"exigence":3,"format_scene":["groupe"],"ideal_pour":["amis","solo"],"notoriete":"emergent","confiance":"haute","preuve":"martèlement polyrhythmique"}',
  },
  {
    title: 'Superpêche',
    input: {
      event_id: 'E499',
      titre: 'Superpêche',
      categorie: 'musique',
      genre: 'jazz_blues',
      description:
        'Superpêche réunit Laure Fischer (saxophone baryton) et Alexis Thépot (violoncelle à cordes sympathiques). En acoustique et sans filet, le duo improvise une musique sensible et inventive où timbres, voix et écoute nourrissent un dialogue vivant en perpétuelle évolution. Partenariat Un pavé dans le jazz.',
      citation: '',
      casting: '',
      lieu_nom: 'Théâtre du Pavé',
      lieu_type: 'theatre',
      prix: '',
    },
    assistant:
      '{"moods":["contemplatif","poetique","cerveau"],"sortie":["evasion","interessante"],"energie":1,"exigence":3,"format_scene":["duo"],"ideal_pour":["solo","couple"],"notoriete":"emergent","confiance":"moyenne","preuve":"timbres, voix et écoute nourrissent un dialogue vivant"}',
  },
  {
    title: 'Camping sauvage (quartet)',
    input: {
      event_id: 'BAR0014',
      titre: 'Camping sauvage (quartet)',
      categorie: 'musique',
      genre: '',
      description:
        'Un swing vocal et du scatt délicieusement indiscipliné, parfumé de jazz manouche, et des solos de guitare qui prennent la clé des champs. Convivial et entraînant au point de finir en swing sauvage…',
      citation: '',
      casting: '',
      lieu_nom: 'Maison Blanche',
      lieu_type: 'bar',
      prix: 'entrée libre 5 euros conseillés',
    },
    assistant:
      '{"moods":["dansant","leger","festif"],"sortie":["partage","agreable"],"energie":4,"exigence":1,"format_scene":["groupe"],"ideal_pour":["amis"],"notoriete":"emergent","confiance":"haute","preuve":"finir en swing sauvage"}',
  },
  {
    title: 'Jeanne Candel',
    input: {
      event_id: 'TMP0093',
      titre: 'Jeanne Candel',
      categorie: 'theatre_danse',
      genre: '',
      description:
        'Spectacle co-accueilli avec et au Théâtre de la Cité Évoquer la conquête de l’espace et la création du monde avec quatre interprètes, un piano désossé, quelques cartons et objets détournés : tel est le réjouissant exploit accompli par ce spectacle artisanal et musical, aussi hilarant que poétique. Présenté à Garonne à sa création en 2024, puis au Festival d’Avignon en 2025, Fusées est de retour à Toulouse, au Théâtre de la Cité. L’histoire est simple : deux hommes perdus dans le cosmos. L’un sombre dans sa mélancolie, l’autre jouit de sa puissance. Plus l’un est fort, plus l’autre est faible, c’est l’électricité́́, le plus et le moins, la comédie électrique. On les voit vivre, survivre dans ces contrées lointaines, en apesanteur.',
      citation: '',
      casting: '',
      lieu_nom: 'Théâtre Garonne',
      lieu_type: 'theatre',
      prix: '',
    },
    assistant:
      '{"moods":["rigolo","poetique","absurde"],"sortie":["evasion","agreable"],"energie":3,"exigence":1,"format_scene":["troupe"],"ideal_pour":["amis","famille"],"notoriete":"confirme","confiance":"haute","preuve":"aussi hilarant que poétique"}',
  },
];

export function fewShots(): readonly FewShot[] {
  return FEW_SHOTS;
}

/**
 * Same key order as `aiEnv` in src/lib/phraseAi.ts.
 * OpenAI wins when `OPENAI_API_KEY` is non-empty after trim.
 * Default OpenAI model is `gpt-4o`; a non-empty `OPENAI_MODEL` overrides it.
 */
export function llmEnv(env: NodeJS.ProcessEnv = process.env): LlmEnv | null {
  const openai = (env.OPENAI_API_KEY || '').trim();
  if (openai) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: openai,
      model: (env.OPENAI_MODEL || '').trim() || 'gpt-4o',
    };
  }
  const xai = env.XAI_API_KEY;
  if (xai) {
    return {
      url: 'https://api.x.ai/v1/chat/completions',
      key: xai,
      model: env.XAI_MODEL || 'grok-2-latest',
    };
  }
  return null;
}

export function isConcertCategorie(categorie: string): boolean {
  return mainFromCategorie(categorie) === 'musique';
}

export function isLivingCategorie(categorie: string): boolean {
  const main = mainFromCategorie(categorie);
  return main === 'musique' || main === 'theatre_danse';
}

/** Description sent to the model: `description_longue`, otherwise `description_courte`. */
export function usefulTextLength(description: string): number {
  return description.trim().length;
}

export function isShortText(description: string): boolean {
  return usefulTextLength(description) < SHORT_TEXT_CHARS;
}

export function sourceTextOfInput(input: TagInput): string {
  return [
    input.titre,
    input.categorie,
    input.genre,
    input.description,
    input.citation,
    input.casting,
    input.lieu_nom,
    input.lieu_type,
    input.prix,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');
}

export function userMessage(input: TagInput): string {
  const lines = [
    `titre: ${input.titre.trim()}`,
    `categorie: ${input.categorie.trim()}`,
    `genre: ${input.genre.trim()}`,
  ];
  if (input.lieu_nom.trim()) lines.push(`lieu: ${input.lieu_nom.trim()}`);
  if (input.lieu_type.trim()) lines.push(`type_lieu: ${input.lieu_type.trim()}`);
  if (input.prix.trim()) lines.push(`prix: ${input.prix.trim()}`);
  lines.push(`description: ${input.description.trim()}`);
  if (input.citation.trim()) lines.push(`citation: ${input.citation.trim()}`);
  if (input.casting.trim()) lines.push(`casting: ${input.casting.trim()}`);
  return lines.join('\n');
}

export function messagesFor(
  input: TagInput,
  retry?: { previous: string; issues: ValidationIssue[] },
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const shot of FEW_SHOTS) {
    messages.push({ role: 'user', content: userMessage(shot.input) });
    messages.push({ role: 'assistant', content: shot.assistant });
  }
  messages.push({ role: 'user', content: `${USER_PREAMBLE}\n\n${userMessage(input)}` });
  if (retry) {
    if (retry.previous.trim()) {
      messages.push({ role: 'assistant', content: retry.previous });
    }
    const detail = retry.issues.map((issue) => `${issue.code}: ${issue.detail}`).join(' ; ');
    messages.push({
      role: 'user',
      content: `Rejeté (${detail}). Réponds uniquement avec un JSON valide corrigé. La preuve doit être une citation exacte du texte (moins de 120 caractères).`,
    });
  }
  return messages;
}

export function parseTagEventsArgs(argv: readonly string[]): TagEventsArgs {
  let limit: number | null = null;
  let onlyMissing = false;
  const eventIds: string[] = [];
  let dryRun = false;
  let evalGold = false;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--only-missing') {
      onlyMissing = true;
    } else if (flag === '--dry-run') {
      dryRun = true;
    } else if (flag === '--eval-gold' || flag === '--gold') {
      evalGold = true;
    } else if (flag === '--limit') {
      const value = argv[i + 1];
      if (!value || !/^[1-9]\d*$/.test(value)) {
        throw new Error('--limit attend un entier positif');
      }
      limit = Number(value);
      i += 1;
    } else if (flag === '--event') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--event attend un event_id');
      eventIds.push(value);
      i += 1;
    } else if (flag === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--out attend un chemin');
      out = value;
      i += 1;
    } else if (flag.startsWith('--')) {
      throw new Error(`Option inconnue : ${flag}`);
    }
  }
  return { limit, onlyMissing, eventIds, dryRun, evalGold, out };
}

/** Gold and dry-run never write the live tags file. */
export function writesLiveTags(args: Pick<TagEventsArgs, 'dryRun' | 'evalGold'>): boolean {
  return !args.dryRun && !args.evalGold;
}

/**
 * A run that is not the gold eval and names neither `--limit` nor `--event`
 * would walk the whole living-arts catalogue. That pass is PR5.
 */
export function blocksFullCatalogue(args: Pick<TagEventsArgs, 'evalGold' | 'limit' | 'eventIds'>): boolean {
  return !args.evalGold && args.limit == null && args.eventIds.length === 0;
}

export function defaultGoldOutPath(now = new Date(), cwd = process.cwd()): string {
  const date = now.toISOString().slice(0, 10);
  return path.join(cwd, 'bench-results', `${date}-tags-gold.md`);
}

/** Only `data/tags_evenements.csv` is a legal tags destination. */
export function assertTagsCsvPath(target: string, cwd = process.cwd()): string {
  const resolved = path.resolve(cwd, target);
  const allowed = path.resolve(cwd, TAGS_CSV_RELATIVE);
  if (resolved !== allowed) {
    throw new Error(`Refus d'écrire ailleurs que data/tags_evenements.csv : ${resolved}`);
  }
  const base = path.basename(resolved);
  if (base === 'evenements.csv' || base === 'programme.csv') {
    throw new Error(`Refus d'écrire ${base}`);
  }
  return resolved;
}

export function parseModelContent(content: string): { ok: true; value: unknown } | { ok: false; detail: string } {
  let text = content.trim();
  if (!text) return { ok: false, detail: 'réponse vide' };
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, detail: 'JSON invalide' };
  }
}

function pushIssue(issues: ValidationIssue[], code: ValidationIssue['code'], detail: string): void {
  issues.push({ code, detail });
}

function takeList(
  value: unknown,
  allowed: readonly string[],
  min: number,
  max: number,
  field: string,
  issues: ValidationIssue[],
): string[] {
  if (!Array.isArray(value)) {
    pushIssue(issues, 'hors_bornes', `${field} : liste attendue`);
    return [];
  }
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      pushIssue(issues, 'hors_enum', `${field} : valeur non textuelle`);
      continue;
    }
    const slug = item.trim().toLowerCase();
    if (!slug) continue;
    if (seen.has(slug)) {
      pushIssue(issues, 'hors_bornes', `${field} : doublon ${slug}`);
      continue;
    }
    seen.add(slug);
    if (!allowed.includes(slug)) {
      pushIssue(issues, 'hors_enum', `${field} : ${slug}`);
      continue;
    }
    tokens.push(slug);
  }
  if (tokens.length < min || tokens.length > max) {
    const span = min === max ? `${min}` : `${min}–${max}`;
    pushIssue(issues, 'hors_bornes', `${field} : ${tokens.length} valeur(s) (attendu ${span})`);
  }
  return tokens;
}

function takeInt(
  value: unknown,
  allowed: readonly number[],
  field: string,
  issues: ValidationIssue[],
): number | null {
  let n: number | null = null;
  if (typeof value === 'number' && Number.isInteger(value)) n = value;
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) n = Number(value.trim());
  if (n == null) {
    pushIssue(issues, 'hors_enum', `${field} : valeur invalide`);
    return null;
  }
  if (!allowed.includes(n)) {
    pushIssue(issues, 'hors_enum', `${field} : ${n}`);
    return null;
  }
  return n;
}

function takeOne(
  value: unknown,
  allowed: readonly string[],
  field: string,
  issues: ValidationIssue[],
): string | null {
  if (typeof value !== 'string') {
    pushIssue(issues, 'hors_enum', `${field} : valeur invalide`);
    return null;
  }
  const slug = value.trim().toLowerCase();
  if (!allowed.includes(slug)) {
    pushIssue(issues, 'hors_enum', `${field} : ${slug || 'vide'}`);
    return null;
  }
  return slug;
}

export function validateTagOutput(
  raw: unknown,
  ctx: { sourceText: string; concert: boolean },
): ValidatedTag {
  const parsed = typeof raw === 'string' ? parseModelContent(raw) : { ok: true as const, value: raw };
  if (!parsed.ok) return { ok: false, issues: [{ code: 'json', detail: parsed.detail }] };
  const value = parsed.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, issues: [{ code: 'json', detail: 'objet JSON attendu' }] };
  }
  const row = value as Record<string, unknown>;
  if (row.skip === true) return { ok: true, value: { skip: true } };

  const issues: ValidationIssue[] = [];
  const moods = takeList(row.moods, TASTE_MOODS, 2, 3, 'moods', issues);
  const sortie = takeList(row.sortie, SORTIE_VALUES, 1, 2, 'sortie', issues);
  const energie = takeInt(row.energie, ENERGIE_INTS, 'energie', issues);
  const exigence = takeInt(row.exigence, EXIGENCE_INTS, 'exigence', issues);
  const format = takeList(row.format_scene, FORMAT_VALUES, 1, 2, 'format_scene', issues);
  const pour = takeList(row.ideal_pour, IDEAL_POUR_VALUES, 1, 3, 'ideal_pour', issues);
  const notoriete = takeOne(row.notoriete, NOTORIETE_VALUES, 'notoriete', issues);
  const confiance = takeOne(row.confiance ?? row.tag_confiance, CONFIANCE_VALUES, 'confiance', issues);

  if (moods.includes('rigolo') && !moods.some((mood) => (RIGOLO_LAUGH as readonly string[]).includes(mood))) {
    pushIssue(issues, 'rigolo', 'rigolo sans le type de rire (absurde, critique, tendre, leger, cerveau, sombre ou intimiste)');
  }
  if (
    ctx.concert &&
    moods.includes('festif') &&
    !moods.some((mood) => (FESTIF_COMPANY as readonly string[]).includes(mood))
  ) {
    pushIssue(
      issues,
      'festif',
      'festif seul sur un concert (ajouter dansant, intense, brutal, epique, poetique, intimiste ou contemplatif)',
    );
  }

  const preuve = typeof row.preuve === 'string' ? row.preuve.trim() : typeof row.tag_preuve === 'string' ? row.tag_preuve.trim() : '';
  if (!preuve) {
    if (confiance === 'haute') pushIssue(issues, 'haute_sans_preuve', 'confiance haute sans preuve');
    else pushIssue(issues, 'preuve', 'preuve absente');
  } else {
    if ([...preuve].length >= 120) {
      pushIssue(issues, 'hors_bornes', 'preuve : 120 caractères ou plus');
    }
    if (!textContainsProof(preuve, ctx.sourceText)) {
      pushIssue(issues, 'preuve', 'preuve absente du texte source');
      if (confiance === 'haute') {
        pushIssue(issues, 'haute_sans_preuve', 'confiance haute sans preuve retrouvée dans le texte');
      }
    }
  }

  if (issues.length > 0 || energie == null || exigence == null || notoriete == null || confiance == null) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      moods,
      sortie,
      energie,
      exigence,
      format_scene: format,
      ideal_pour: pour,
      notoriete,
      confiance: confiance as TagProposal['confiance'],
      preuve,
    },
  };
}

export function tagsRowFromProposal(
  eventId: string,
  proposal: TagProposal,
  taggedAt: string,
): Record<(typeof EVENT_TAGS_V2_COLUMNS)[number], string> {
  return {
    event_id: eventId,
    moods: proposal.moods.join('|'),
    sortie: proposal.sortie.join('|'),
    energie: String(proposal.energie),
    exigence: String(proposal.exigence),
    format_scene: proposal.format_scene.join('|'),
    ideal_pour: proposal.ideal_pour.join('|'),
    notoriete: proposal.notoriete,
    tag_confiance: proposal.confiance,
    tag_preuve: proposal.preuve,
    tag_version: 'v2',
    tagged_at: taggedAt,
    tagged_by: 'llm',
  };
}

export function renderTagsCsv(rows: readonly Record<string, string>[]): string {
  const columns = [...EVENT_TAGS_V2_COLUMNS];
  const body = Papa.unparse(
    rows.map((row) => {
      const out: Record<string, string> = {};
      for (const column of columns) out[column] = row[column] ?? '';
      return out;
    }),
    { columns, newline: '\n' },
  );
  return body.endsWith('\n') ? body : `${body}\n`;
}

export function mergeTagRows(
  existing: readonly Record<string, string>[],
  incoming: readonly Record<string, string>[],
): Record<string, string>[] {
  const byId = new Map<string, Record<string, string>>();
  const order: string[] = [];
  for (const row of existing) {
    const id = (row.event_id ?? '').trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...row, event_id: id });
    order.push(id);
  }
  for (const row of incoming) {
    const id = (row.event_id ?? '').trim();
    if (!id) continue;
    if (!byId.has(id)) order.push(id);
    byId.set(id, { ...row, event_id: id });
  }
  const merged: Record<string, string>[] = [];
  for (const id of order) {
    const row = byId.get(id);
    if (row) merged.push(row);
  }
  return merged;
}

export function selectTagInputs(
  inputs: readonly TagInput[],
  alreadyTagged: ReadonlySet<string>,
  args: Pick<TagEventsArgs, 'limit' | 'onlyMissing' | 'eventIds'>,
): TagInput[] {
  let rows = inputs.filter((input) => input.event_id && isLivingCategorie(input.categorie));
  if (args.eventIds.length > 0) {
    const wanted = new Set(args.eventIds);
    rows = rows.filter((input) => wanted.has(input.event_id));
  }
  if (args.onlyMissing) {
    rows = rows.filter((input) => !alreadyTagged.has(input.event_id));
  }
  if (args.limit != null) rows = rows.slice(0, args.limit);
  return rows;
}

function interpret(content: string, ctx: { sourceText: string; concert: boolean }): ValidatedTag {
  const parsed = parseModelContent(content);
  if (!parsed.ok) return { ok: false, issues: [{ code: 'json', detail: parsed.detail }] };
  return validateTagOutput(parsed.value, ctx);
}

function acceptedProposal(result: ValidatedTag): TagProposal | null {
  if (!result.ok || 'skip' in result.value) return null;
  return result.value;
}

export async function tagEvent(input: TagInput, complete: LlmComplete): Promise<TagOutcome> {
  if (isShortText(input.description)) {
    return { status: 'skip', reason: 'texte_court', attempts: 0 };
  }
  const ctx = { concert: isConcertCategorie(input.categorie), sourceText: sourceTextOfInput(input) };
  let previous = '';
  let issues: ValidationIssue[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let content = '';
    try {
      content =
        attempt === 1
          ? await complete(messagesFor(input))
          : await complete(messagesFor(input, { previous, issues }));
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'appel LLM';
      issues = [{ code: 'json', detail }];
      previous = '';
      if (attempt === 2) return { status: 'invalid', issues, attempts: 2 };
      continue;
    }
    const result = interpret(content, ctx);
    const proposal = acceptedProposal(result);
    if (proposal) return { status: 'tagged', proposal, attempts: attempt };
    if (result.ok) return { status: 'skip', reason: 'modele', attempts: attempt };
    issues = result.issues;
    previous = content;
    if (attempt === 2) return { status: 'invalid', issues, attempts: 2 };
  }
  return { status: 'invalid', issues, attempts: 2 };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

export function parseGoldFixture(parsed: unknown): GoldFixtureRow[] {
  if (!Array.isArray(parsed)) return [];
  const rows: GoldFixtureRow[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const eventId = typeof row.event_id === 'string' ? row.event_id.trim() : '';
    if (!eventId) continue;
    const energie = typeof row.energie === 'number' ? row.energie : Number(row.energie);
    const exigence = typeof row.exigence === 'number' ? row.exigence : Number(row.exigence);
    rows.push({
      event_id: eventId,
      titre: typeof row.titre === 'string' ? row.titre : '',
      categorie: typeof row.categorie === 'string' ? row.categorie : '',
      moods: asStringList(row.moods),
      sortie: asStringList(row.sortie),
      energie,
      exigence,
      format_scene: asStringList(row.format_scene),
      ideal_pour: asStringList(row.ideal_pour),
      notoriete: typeof row.notoriete === 'string' ? row.notoriete : '',
      tag_confiance: typeof row.tag_confiance === 'string' ? row.tag_confiance : '',
      tag_preuve: typeof row.tag_preuve === 'string' ? row.tag_preuve : '',
      tag_version: typeof row.tag_version === 'string' ? row.tag_version : '',
      tagged_by: typeof row.tagged_by === 'string' ? row.tagged_by : '',
      skip: row.skip === true,
    });
  }
  return rows;
}

function emptyMetrics(): GoldReport['metrics'] {
  return {
    principalMood: null,
    meanJaccard: null,
    principalSortie: null,
    energieWithin1: null,
  };
}

function formatRate(value: number | null, skipped: boolean): string {
  if (skipped || value == null) return 'SKIP';
  return `${(value * 100).toFixed(1).replace('.', ',')} %`;
}

function formatJaccard(value: number | null, skipped: boolean): string {
  if (skipped || value == null) return 'SKIP';
  return value.toFixed(3).replace('.', ',');
}

function thresholdRow(
  id: string,
  label: string,
  target: string,
  measure: string,
  status: GoldThresholdStatus,
): GoldReport['thresholds'][number] {
  return { id, label, target, measure, status };
}

export function buildGoldReport(partial: {
  generatedAt: string;
  fixture: readonly GoldFixtureRow[];
  skipped: boolean;
  skipReason?: string;
  compared: number;
  missing: number;
  short: number;
  invalid: number;
  modelSkips: number;
  metrics: GoldReport['metrics'];
}): GoldReport {
  const theatre = partial.fixture.filter((row) => mainFromCategorie(row.categorie) === 'theatre_danse').length;
  const concert = partial.fixture.filter((row) => isConcertCategorie(row.categorie)).length;
  const metrics = partial.skipped ? emptyMetrics() : partial.metrics;
  const moodStatus: GoldThresholdStatus = partial.skipped
    ? 'SKIP'
    : metrics.principalMood != null && metrics.principalMood >= THRESHOLDS.goldPrincipalMood
      ? 'PASS'
      : 'FAIL';
  const jaccardStatus: GoldThresholdStatus = partial.skipped
    ? 'SKIP'
    : metrics.meanJaccard != null && metrics.meanJaccard >= THRESHOLDS.goldJaccard
      ? 'PASS'
      : 'FAIL';
  const sortieStatus: GoldThresholdStatus = partial.skipped
    ? 'SKIP'
    : metrics.principalSortie != null && metrics.principalSortie >= THRESHOLDS.goldPrincipalSortie
      ? 'PASS'
      : 'FAIL';
  const energieStatus: GoldThresholdStatus = partial.skipped
    ? 'SKIP'
    : metrics.energieWithin1 != null && metrics.energieWithin1 >= THRESHOLDS.goldEnergie
      ? 'PASS'
      : 'FAIL';
  const statuses = [moodStatus, jaccardStatus, sortieStatus, energieStatus];
  const verdict: GoldThresholdStatus = partial.skipped
    ? 'SKIP'
    : statuses.every((status) => status === 'PASS')
      ? 'PASS'
      : 'FAIL';
  return {
    generatedAt: partial.generatedAt,
    seed: GOLD_SEED,
    fixtureRows: partial.fixture.length,
    theatre,
    concert,
    verdict,
    skipReason: partial.skipReason,
    compared: partial.skipped ? 0 : partial.compared,
    missing: partial.missing,
    short: partial.skipped ? 0 : partial.short,
    invalid: partial.skipped ? 0 : partial.invalid,
    modelSkips: partial.skipped ? 0 : partial.modelSkips,
    metrics,
    thresholds: [
      thresholdRow(
        'gold_principal_mood',
        'Ambiance principale identique',
        '≥ 70 %',
        formatRate(metrics.principalMood, partial.skipped),
        moodStatus,
      ),
      thresholdRow(
        'gold_jaccard',
        'Jaccard moyen des ambiances',
        '≥ 0,50',
        formatJaccard(metrics.meanJaccard, partial.skipped),
        jaccardStatus,
      ),
      thresholdRow(
        'gold_principal_sortie',
        'Sortie principale identique',
        '≥ 70 %',
        formatRate(metrics.principalSortie, partial.skipped),
        sortieStatus,
      ),
      thresholdRow(
        'gold_energie',
        'energie à ±1',
        '≥ 85 %',
        formatRate(metrics.energieWithin1, partial.skipped),
        energieStatus,
      ),
    ],
    wroteTagsCsv: false,
  };
}

export function renderGoldReport(report: GoldReport): string {
  const lines = [
    '# Tags v2 — gold set',
    '',
    `Généré le ${report.generatedAt}. Mode \`--eval-gold\` / \`--gold\`.`,
    '',
    'Aucune écriture dans `data/tags_evenements.csv`, `data/evenements.csv` ou `data/programme.csv`.',
    '',
    `Fixture : \`${GOLD_FILE}\` — ${report.fixtureRows} lignes, graine ${report.seed} (${report.theatre} théâtre, ${report.concert} concerts).`,
    '',
    `Verdict : **${report.verdict}**`,
    '',
  ];
  if (report.verdict === 'SKIP') {
    lines.push(
      report.skipReason ??
        'Le modèle n’a pas été appelé. Les seuils ne sont pas estimés.',
      '',
    );
  } else {
    lines.push(
      `Comparés : ${report.compared}. Absents du catalogue : ${report.missing}. Texte court : ${report.short}. Rejets après réessai : ${report.invalid}. Skip modèle : ${report.modelSkips}.`,
      '',
    );
  }
  lines.push(
    '| Mesure | Seuil | Résultat | Statut |',
    '|---|---|---|---|',
  );
  for (const row of report.thresholds) {
    lines.push(`| ${row.label} | ${row.target} | ${row.measure} | ${row.status} |`);
  }
  lines.push(
    '',
    'Seuils §A6 : ambiance principale ≥ 70 %, Jaccard moyen des ambiances ≥ 0,50, sortie principale ≥ 70 %, energie à ±1 ≥ 85 %.',
    '',
    '`tagged_by` d’une écriture réelle serait `llm`. Ce rapport n’en produit pas.',
    '',
  );
  return lines.join('\n');
}

export async function evaluateGold(options: {
  fixture: readonly GoldFixtureRow[];
  inputsById: ReadonlyMap<string, TagInput>;
  complete: LlmComplete | null;
  generatedAt: string;
  skipReason?: string;
  limit?: number | null;
}): Promise<GoldReport> {
  if (!options.complete) {
    return buildGoldReport({
      generatedAt: options.generatedAt,
      fixture: options.fixture,
      skipped: true,
      skipReason:
        options.skipReason ??
        'Aucune clé `OPENAI_API_KEY` ni `XAI_API_KEY` (même résolution que `src/lib/phraseAi.ts`). Le modèle n’a pas été appelé. Les seuils ne sont pas estimés.',
      compared: 0,
      missing: 0,
      short: 0,
      invalid: 0,
      modelSkips: 0,
      metrics: emptyMetrics(),
    });
  }
  const slice = options.limit != null ? options.fixture.slice(0, options.limit) : options.fixture;
  const pairs: Array<{ gold: GoldTags; got: GoldTags }> = [];
  let missing = 0;
  let short = 0;
  let invalid = 0;
  let modelSkips = 0;
  for (const row of slice) {
    const input = options.inputsById.get(row.event_id);
    if (!input) {
      missing += 1;
      continue;
    }
    const outcome = await tagEvent(input, options.complete);
    if (outcome.status === 'skip' && outcome.reason === 'texte_court') short += 1;
    if (outcome.status === 'skip' && outcome.reason === 'modele') modelSkips += 1;
    if (outcome.status === 'invalid') invalid += 1;
    const proposal = outcome.status === 'tagged' ? outcome.proposal : null;
    pairs.push({
      gold: {
        event_id: row.event_id,
        moods: row.moods,
        sortie: row.sortie,
        energie: row.energie,
      },
      got: {
        event_id: row.event_id,
        moods: proposal?.moods ?? [],
        sortie: proposal?.sortie ?? [],
        energie: proposal?.energie,
      },
    });
  }
  const scored = scoreGold(pairs);
  return buildGoldReport({
    generatedAt: options.generatedAt,
    fixture: options.fixture,
    skipped: false,
    compared: scored.compared,
    missing,
    short,
    invalid,
    modelSkips,
    metrics: {
      principalMood: scored.principalMood,
      meanJaccard: scored.meanJaccard,
      principalSortie: scored.principalSortie,
      energieWithin1: scored.energieWithin1,
    },
  });
}

type CatalogueRow = {
  event_id: string;
  lieu_id: string;
  titre: string;
  categorie: string;
  genre: string;
  prix: string;
  gratuit: string;
  description_courte: string;
  description_longue: string;
  citation: string;
  casting: string;
};

function readCsv(filePath: string): Record<string, string>[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data.map((row) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      cleaned[key.trim()] = typeof value === 'string' ? value.trim() : '';
    }
    return cleaned;
  });
}

export function tagInputFromRow(
  row: Pick<
    CatalogueRow,
    | 'event_id'
    | 'titre'
    | 'categorie'
    | 'genre'
    | 'prix'
    | 'gratuit'
    | 'description_courte'
    | 'description_longue'
    | 'citation'
    | 'casting'
  >,
  lieu?: { nom?: string; type?: string } | null,
): TagInput {
  const longue = (row.description_longue || '').trim();
  const courte = (row.description_courte || '').trim();
  const prixCell = (row.prix || '').trim();
  const prix = prixCell || ((row.gratuit || '').trim().toLowerCase() === 'oui' ? 'gratuit' : '');
  return {
    event_id: (row.event_id || '').trim(),
    titre: row.titre || '',
    categorie: row.categorie || '',
    genre: row.genre || '',
    description: longue || courte,
    citation: row.citation || '',
    casting: row.casting || '',
    lieu_nom: (lieu?.nom || '').trim(),
    lieu_type: (lieu?.type || '').trim(),
    prix,
  };
}

export function loadTagCatalogue(cwd = process.cwd()): {
  inputs: TagInput[];
  taggedIds: Set<string>;
  tagsRows: Record<string, string>[];
} {
  const events = readCsv(path.join(cwd, 'data', 'evenements.csv')) as CatalogueRow[];
  const lieux = readCsv(path.join(cwd, 'data', 'lieux.csv'));
  const lieuById = new Map(lieux.map((lieu) => [lieu.lieu_id, lieu]));
  const inputs = events.map((row) => tagInputFromRow(row, lieuById.get(row.lieu_id)));
  const tagsPath = path.join(cwd, TAGS_CSV_RELATIVE);
  const tagsRows = fs.existsSync(tagsPath) ? readCsv(tagsPath) : [];
  const taggedIds = new Set(
    tagsRows.filter((row) => (row.event_id || '').trim() && (row.moods || '').trim()).map((row) => row.event_id.trim()),
  );
  return { inputs, taggedIds, tagsRows };
}

export function loadGoldFixture(cwd = process.cwd()): GoldFixtureRow[] {
  const filePath = path.join(cwd, GOLD_FILE);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  return parseGoldFixture(parsed);
}

export function writeTagsCsv(rows: readonly Record<string, string>[], cwd = process.cwd()): void {
  const target = assertTagsCsvPath(TAGS_CSV_RELATIVE, cwd);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, renderTagsCsv(rows), 'utf-8');
}

async function completeWithLlm(env: LlmEnv, messages: ChatMessage[]): Promise<string> {
  const res = await fetch(env.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

function printOutcome(eventId: string, outcome: TagOutcome): void {
  if (outcome.status === 'tagged') {
    console.log(`${eventId} tagged ${outcome.proposal.moods.join('|')} (${outcome.attempts})`);
    return;
  }
  if (outcome.status === 'skip') {
    console.log(`${eventId} skip ${outcome.reason}`);
    return;
  }
  console.error(`${eventId} rejeté après ${outcome.attempts} essai(s) : ${outcome.issues.map((issue) => issue.detail).join(' ; ')}`);
}

async function runGold(args: TagEventsArgs): Promise<void> {
  const fixture = loadGoldFixture();
  const { inputs } = loadTagCatalogue();
  const inputsById = new Map(inputs.map((input) => [input.event_id, input]));
  const env = llmEnv();
  const report = await evaluateGold({
    fixture,
    inputsById,
    complete: env ? (messages) => completeWithLlm(env, messages) : null,
    generatedAt: new Date().toISOString(),
    limit: args.limit,
  });
  const outPath = args.out
    ? path.isAbsolute(args.out)
      ? args.out
      : path.join(process.cwd(), args.out)
    : defaultGoldOutPath();
  assertSafeOut(outPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderGoldReport(report), 'utf-8');
  console.log(`Verdict gold : ${report.verdict}`);
  console.log(`Rapport : ${path.relative(process.cwd(), outPath)}`);
  console.log('CSV live : non écrit');
  if (report.verdict === 'FAIL') process.exitCode = 1;
}

async function runTag(args: TagEventsArgs): Promise<void> {
  if (blocksFullCatalogue(args)) {
    console.error(
      'Passe catalogue complète hors périmètre (PR5). Passez --limit ou --event. Le gold set se lance avec --eval-gold.',
    );
    process.exitCode = 1;
    return;
  }
  const env = llmEnv();
  if (!env) {
    console.error('Aucune clé OPENAI_API_KEY ni XAI_API_KEY. Aucune écriture.');
    process.exitCode = 1;
    return;
  }
  const { inputs, taggedIds, tagsRows } = loadTagCatalogue();
  const selected = selectTagInputs(inputs, taggedIds, args);
  console.log(
    `${selected.length} événement(s)${args.dryRun ? ' (dry-run, pas d’écriture)' : ''}${args.onlyMissing ? ' (seulement sans tag v2)' : ''}`,
  );
  const complete: LlmComplete = (messages) => completeWithLlm(env, messages);
  const incoming: Record<string, string>[] = [];
  const taggedAt = new Date().toISOString();
  for (const input of selected) {
    const outcome = await tagEvent(input, complete);
    printOutcome(input.event_id, outcome);
    if (outcome.status === 'tagged') {
      incoming.push(tagsRowFromProposal(input.event_id, outcome.proposal, taggedAt));
    }
  }
  if (!writesLiveTags(args)) {
    console.log(`${incoming.length} ligne(s) valide(s), CSV non écrit (--dry-run).`);
    return;
  }
  if (incoming.length === 0) {
    console.log('Aucune ligne valide. CSV inchangé.');
    return;
  }
  writeTagsCsv(mergeTagRows(tagsRows, incoming));
  console.log(`${incoming.length} ligne(s) écrite(s) dans ${TAGS_CSV_RELATIVE}`);
}

async function main(): Promise<void> {
  let args: TagEventsArgs;
  try {
    args = parseTagEventsArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }
  if (args.evalGold) {
    await runGold(args);
    return;
  }
  await runTag(args);
}

const isDirectRun = typeof process.argv[1] === 'string' && /tagEvents\.(ts|js)$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
