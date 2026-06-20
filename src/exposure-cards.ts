import { getNounBatches, getVerbBatches } from "./batching";
import { PHRASE_BATCH_SIZE } from "./config";
import { getBatchSizes } from "./data";
import type { ExposureCard, Lesson, SectionKind, VerbFamily, VerbFormKey } from "./types";

export const vocabularyImageUrl = (lesson: Lesson, relativePath?: string) => {
  if (!relativePath) return undefined;
  const normalized = relativePath.replace(/^\.\//, "");
  return `/vocabulary/${lesson.folder}/${normalized}`;
};

const stripVerbFormSuffix = (english: string) => english.replace(/\s*\([^)]*\)\s*$/, "").trim();

export const normalizeVerbFormEnglish = (english: string) => english.replace(/ \+ m(?=\))/g, "");

export const formatVerbFormEnglishLabel = (english: string, form: VerbFormKey) => {
  const stem = stripVerbFormSuffix(normalizeVerbFormEnglish(english.trim()));
  if (!stem) return VERB_FORM_ARABIC_LABELS[form];
  return `${stem} (${VERB_FORM_ARABIC_LABELS[form]})`;
};

export const getVerbFormEnglish = (verb: VerbFamily, form: VerbFormKey) => {
  const direct = verb.englishByForm?.[form]?.trim();
  if (direct) return formatVerbFormEnglishLabel(direct, form);
  return formatVerbFormEnglishLabel(verb.meaning, form);
};

export const VERB_FORM_ARABIC_LABELS: Record<VerbFormKey, string> = {
  past: "الماضي",
  present: "المضارع",
  command: "الأمر",
  masdar: "المصدر",
  passive: "المجهول",
  activeParticiple: "اسم فاعل",
};

const VERB_FORM_SPECS = (Object.keys(VERB_FORM_ARABIC_LABELS) as VerbFormKey[]).map((key) => ({
  key,
  label: VERB_FORM_ARABIC_LABELS[key],
}));

/** Canonical verb form order within a family (past → active participle). */
export const VERB_FORM_ORDER: VerbFormKey[] = VERB_FORM_SPECS.map(({ key }) => key);

const LEGACY_VERB_FORM_LABELS: Record<string, VerbFormKey> = {
  Past: "past",
  Present: "present",
  Command: "command",
  Masdar: "masdar",
  Passive: "passive",
  "Ism Fa'il": "activeParticiple",
  "Active Participle": "activeParticiple",
};

export const resolveVerbFormKeyFromLabel = (label: string): VerbFormKey | undefined =>
  VERB_FORM_SPECS.find((spec) => spec.label === label)?.key ?? LEGACY_VERB_FORM_LABELS[label];

export const getVerbFormLabel = (form: VerbFormKey) => VERB_FORM_ARABIC_LABELS[form] ?? form;

export const countVerbFamilyForms = (verb: VerbFamily): number =>
  VERB_FORM_SPECS.filter(({ key }) => typeof verb[key] === "string" && verb[key]).length;

const VERB_FORM_SUFFIX_PATTERN = /-(past|present|command|masdar|passive|activeParticiple)$/;

export const getVerbFamilyIdFromCardId = (cardId: string) => cardId.replace(VERB_FORM_SUFFIX_PATTERN, "");

export const getVerbFamilyBrowseMeaning = (verb: VerbFamily) => stripVerbFormSuffix(normalizeVerbFormEnglish(verb.meaning));

export const getVerbFamilyMeaningLabel = (forms: ExposureCard[]) => {
  const english = forms[0]?.english?.trim();
  return english ? stripVerbFormSuffix(english) : "";
};

export const getVerbFamilyFormsForCard = (allCards: ExposureCard[], card: ExposureCard): ExposureCard[] | null => {
  if (card.section !== "verbs") return null;
  const familyId = getVerbFamilyIdFromCardId(card.id);
  const familyCards = allCards.filter(
    (item) => item.section === "verbs" && getVerbFamilyIdFromCardId(item.id) === familyId,
  );
  const forms = VERB_FORM_SPECS.flatMap(({ key }) => {
    const formCard = familyCards.find((item) => item.id.endsWith(`-${key}`));
    return formCard ? [formCard] : [];
  });
  return forms.length > 0 ? forms : null;
};

export type VerbFamilyTestPrep = {
  cards: ExposureCard[];
  familyFormsByCardId: Map<string, ExposureCard[]>;
};

const buildVerbFamilyTestUnits = (verbCards: ExposureCard[], pool: ExposureCard[]): VerbFamilyTestPrep => {
  const familyIds = [...new Set(verbCards.map((card) => getVerbFamilyIdFromCardId(card.id)))];
  const cards: ExposureCard[] = [];
  const familyFormsByCardId = new Map<string, ExposureCard[]>();

  for (const familyId of familyIds) {
    const forms = VERB_FORM_SPECS.flatMap(({ key }) => {
      const formCard = pool.find(
        (item) => item.section === "verbs" && getVerbFamilyIdFromCardId(item.id) === familyId && item.id.endsWith(`-${key}`),
      );
      return formCard ? [formCard] : [];
    });
    if (forms.length === 0) continue;
    const representative = forms[0]!;
    cards.push(representative);
    familyFormsByCardId.set(representative.id, forms);
  }

  return { cards, familyFormsByCardId };
};

export const prepareVerbSectionTestCards = (cards: ExposureCard[]): VerbFamilyTestPrep =>
  buildVerbFamilyTestUnits(
    cards.filter((card) => card.section === "verbs"),
    cards,
  );

/** Collapse verb cards to one family prompt each — used for batch-review and section tests. */
export const prepareVerbBatchReviewTestCards = (cards: ExposureCard[]): VerbFamilyTestPrep =>
  prepareVerbSectionTestCards(cards);

export const prepareLessonTestWritingCards = (cards: ExposureCard[]): VerbFamilyTestPrep => {
  const nonVerbs = cards.filter((card) => card.section !== "verbs");
  const verbPrep = buildVerbFamilyTestUnits(
    cards.filter((card) => card.section === "verbs"),
    cards,
  );
  return {
    cards: [...nonVerbs, ...verbPrep.cards],
    familyFormsByCardId: verbPrep.familyFormsByCardId,
  };
};

export const groupExposureCardsIntoVerbFamilies = (cards: ExposureCard[]): ExposureCard[][] => {
  const families = new Map<string, ExposureCard[]>();
  const order: string[] = [];

  for (const card of cards) {
    const familyId = getVerbFamilyIdFromCardId(card.id);
    if (!families.has(familyId)) {
      families.set(familyId, []);
      order.push(familyId);
    }
    families.get(familyId)!.push(card);
  }

  return order.map((familyId) => {
    const familyCards = families.get(familyId) ?? [];
    return VERB_FORM_SPECS.flatMap(({ key }) => {
      const card = familyCards.find((item) => item.id.endsWith(`-${key}`));
      return card ? [card] : [];
    });
  });
};

const getFormCardInFamily = (family: ExposureCard[], formKey: VerbFormKey) =>
  family.find((card) => card.id.endsWith(`-${formKey}`));

const pickVerbFormKeyForFamily = (family: ExposureCard[]): VerbFormKey | null => {
  for (const key of VERB_FORM_ORDER) {
    if (getFormCardInFamily(family, key)) return key;
  }
  return null;
};

const pickSharedVerbFormKey = (families: ExposureCard[][]): VerbFormKey | null => {
  for (const key of VERB_FORM_ORDER) {
    if (families.every((family) => Boolean(getFormCardInFamily(family, key)))) return key;
  }
  return null;
};

export const getVerbEnglishRecognitionLabel = (family: ExposureCard[], formCard: ExposureCard) => {
  const meaning = getVerbFamilyMeaningLabel(family);
  const formKeyMatch = formCard.id.match(/-(past|present|command|masdar|passive|activeParticiple)$/);
  const formLabel = formCard.label ?? getVerbFormLabel((formKeyMatch?.[1] ?? "past") as VerbFormKey);
  return meaning ? `${meaning} · ${formLabel}` : formLabel;
};

export type VerbBatchRecognition = {
  cards: ExposureCard[];
  englishLabelsByFamilyId: Map<string, string>;
  sharedFormKey: VerbFormKey | null;
};

export const prepareVerbBatchRecognition = (cards: ExposureCard[]): VerbBatchRecognition | null => {
  if (cards.length === 0 || cards[0]?.section !== "verbs") return null;

  const families = groupExposureCardsIntoVerbFamilies(cards);
  const sharedFormKey = pickSharedVerbFormKey(families);
  const recognitionCards: ExposureCard[] = [];
  const englishLabelsByFamilyId = new Map<string, string>();

  for (const family of families) {
    const formKey = sharedFormKey ?? pickVerbFormKeyForFamily(family);
    if (!formKey) continue;
    const formCard = getFormCardInFamily(family, formKey);
    if (!formCard) continue;
    const familyId = getVerbFamilyIdFromCardId(formCard.id);
    recognitionCards.push(formCard);
    englishLabelsByFamilyId.set(familyId, getVerbEnglishRecognitionLabel(family, formCard));
  }

  return { cards: recognitionCards, englishLabelsByFamilyId, sharedFormKey };
};

export const getLessonVerbRecognitionCards = (lessonCards: ExposureCard[]): ExposureCard[] => {
  const verbCards = lessonCards.filter((card) => card.section === "verbs");
  if (verbCards.length === 0) return [];

  const families = groupExposureCardsIntoVerbFamilies(verbCards);
  return families.flatMap((family) => {
    const formKey = pickVerbFormKeyForFamily(family);
    if (!formKey) return [];
    const formCard = getFormCardInFamily(family, formKey);
    return formCard ? [formCard] : [];
  });
};

export const getBatchRecognitionCards = (cards: ExposureCard[]) =>
  prepareVerbBatchRecognition(cards)?.cards ?? cards;

export const getBatchRecognitionCount = (cards: ExposureCard[]) => getBatchRecognitionCards(cards).length;

const verbFamilyToExposureCards = (
  verb: VerbFamily,
  lesson: Lesson,
  batchIndex: number,
): ExposureCard[] =>
  VERB_FORM_SPECS.flatMap(({ key, label }) => {
    const arabic = verb[key];
    if (typeof arabic !== "string" || !arabic) return [];
    return [
      {
        id: `${verb.id}-${key}`,
        arabic,
        english: getVerbFormEnglish(verb, key),
        section: "verbs" as const,
        batchIndex,
        label,
        imageUrl: vocabularyImageUrl(lesson, verb.images?.[key]),
      },
    ];
  });

const mapPhraseBatches = <T,>(items: T[], mapper: (item: T, batchIndex: number) => ExposureCard[]) => {
  const sizes = getBatchSizes(items.length, PHRASE_BATCH_SIZE, true);
  let offset = 0;
  return sizes.flatMap((size, batchIndex) => {
    const slice = items.slice(offset, offset + size);
    offset += size;
    return slice.flatMap((item) => mapper(item, batchIndex));
  });
};

export const buildLessonExposureCards = (lesson: Lesson): ExposureCard[] => [
  ...getNounBatches(lesson.nouns).flatMap((batch, batchIndex) =>
    batch.map((noun) => ({
      id: noun.id,
      arabic: noun.arabic,
      english: noun.english,
      section: "nouns" as const,
      batchIndex,
      imageUrl: vocabularyImageUrl(lesson, noun.arabicImage),
    })),
  ),
  ...mapPhraseBatches(lesson.phrases, (phrase, batchIndex) => [
    {
      id: phrase.id,
      arabic: phrase.arabic,
      english: phrase.english,
      section: "phrases" as const,
      batchIndex,
      imageUrl: vocabularyImageUrl(lesson, phrase.arabicImage),
    },
  ]),
  ...getVerbBatches(lesson.verbs).flatMap((batch, batchIndex) =>
    batch.flatMap((verb) => verbFamilyToExposureCards(verb, lesson, batchIndex)),
  ),
];

const lessonExposureCardsCache = new Map<string, ExposureCard[]>();

export const getCachedLessonExposureCards = (lesson: Lesson): ExposureCard[] => {
  const cached = lessonExposureCardsCache.get(lesson.id);
  if (cached) return cached;

  const cards = buildLessonExposureCards(lesson);
  lessonExposureCardsCache.set(lesson.id, cards);
  return cards;
};

const parseBatchStepId = (stepId: string) => {
  const match = stepId.match(/-(nouns|verbs|phrases)-batch-(\d+)$/);
  return match
    ? {
        section: match[1] as SectionKind,
        batchIndex: Number(match[2]) - 1,
      }
    : null;
};

const parseBatchReviewSection = (stepId: string): SectionKind | null => {
  const match = stepId.match(/-(nouns|verbs|phrases)-batch-review-\d+$/);
  return match ? (match[1] as SectionKind) : null;
};

export const getBatchExposureCards = (lesson: Lesson, stepId: string): ExposureCard[] => {
  const parsed = parseBatchStepId(stepId);
  if (parsed) {
    return getCachedLessonExposureCards(lesson).filter(
      (card) => card.section === parsed.section && card.batchIndex === parsed.batchIndex,
    );
  }

  const reviewSection = parseBatchReviewSection(stepId);
  if (!reviewSection) return [];

  const step = lesson.steps.find((item) => item.id === stepId);
  if (
    !step ||
    step.kind !== "batch-review" ||
    step.batchReviewStart === undefined ||
    step.batchReviewEnd === undefined
  ) {
    return [];
  }

  return getCachedLessonExposureCards(lesson).filter(
    (card) =>
      card.section === reviewSection &&
      card.batchIndex !== undefined &&
      card.batchIndex >= step.batchReviewStart! &&
      card.batchIndex <= step.batchReviewEnd!,
  );
};

export const getSectionExposureCards = (lesson: Lesson, section: SectionKind): ExposureCard[] =>
  getCachedLessonExposureCards(lesson).filter((card) => card.section === section);

export type VocabularyBrowseRow = {
  id: string;
  arabic: string;
  english: string;
  imageUrl?: string;
  weak?: boolean;
  batchIndex: number;
};

export const buildNounBrowseRows = (lesson: Lesson): VocabularyBrowseRow[] =>
  getNounBatches(lesson.nouns).flatMap((batch, batchIndex) =>
    batch.map((noun) => ({
      id: noun.id,
      arabic: noun.arabic,
      english: [noun.english, noun.plural].filter(Boolean).join(" · "),
      imageUrl: vocabularyImageUrl(lesson, noun.arabicImage),
      weak: noun.hard,
      batchIndex,
    })),
  );

const buildPhraseBrowseRowsFromItems = (
  lesson: Lesson,
  phrases: Lesson["phrases"],
): VocabularyBrowseRow[] => {
  const sizes = getBatchSizes(phrases.length, PHRASE_BATCH_SIZE, true);
  let offset = 0;
  return sizes.flatMap((size, batchIndex) => {
    const slice = phrases.slice(offset, offset + size);
    offset += size;
    return slice.map((phrase) => ({
      id: phrase.id,
      arabic: phrase.arabic,
      english: phrase.english,
      imageUrl: vocabularyImageUrl(lesson, phrase.arabicImage),
      weak: phrase.hard,
      batchIndex,
    }));
  });
};

export const buildPhraseBrowseRows = (lesson: Lesson): VocabularyBrowseRow[] =>
  buildPhraseBrowseRowsFromItems(lesson, lesson.phrases);

export const buildVerbBrowseBatches = (verbs: VerbFamily[]): { batchIndex: number; verb: VerbFamily }[] =>
  getVerbBatches(verbs).flatMap((batch, batchIndex) => batch.map((verb) => ({ batchIndex, verb })));
