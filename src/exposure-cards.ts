import {
  buildNounBatchStructure,
  countNounFamilyUnits,
  getNounBatchUnitCounts,
  getNounBatches,
  getVerbBatches,
  isNounPluralItem,
  isNounStemGroupWithPlural,
} from "./batching";
import { annotateEnglishCollisions } from "./english-cue";
import { PHRASE_BATCH_SIZE } from "./config";
import { getBatchSizes } from "./data";
import type { ExposureCard, Lesson, NounItem, SectionKind, VerbFamily, VerbFormKey, NounFormKey } from "./types";
import {
  lessonExtrasAsNounItems,
  lessonExtrasAsPhraseItems,
  getLessonExtrasRevision,
} from "./lesson-extras";
import { applyWordEdit, applyWordEditFields, getWordEdit, getWordEditRevision } from "./word-edits";

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
  activeParticiple: "اسم فاعل",
  passive: "اسم مفعول",
};

export const VERB_HARF_ARABIC_LABEL = "الحرف";

const VERB_FORM_SPECS = (Object.keys(VERB_FORM_ARABIC_LABELS) as VerbFormKey[]).map((key) => ({
  key,
  label: VERB_FORM_ARABIC_LABELS[key],
}));

/** Canonical verb form order within a family (past → ism maf'ool). */
export const VERB_FORM_ORDER: VerbFormKey[] = VERB_FORM_SPECS.map(({ key }) => key);

const LEGACY_VERB_FORM_LABELS: Record<string, VerbFormKey> = {
  Past: "past",
  Present: "present",
  Command: "command",
  Masdar: "masdar",
  Passive: "passive",
  "المجهول": "passive",
  "Ism Maf'ool": "passive",
  "Passive Participle": "passive",
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

export const getVerbFamilyPastForm = (forms: ExposureCard[]) =>
  forms.find((form) => form.id.endsWith("-past")) ?? forms[0];

const formatVerbFamilyEnglishStem = (english: string) => {
  const stem = stripVerbFormSuffix(normalizeVerbFormEnglish(english));
  return stem || "";
};

export const getVerbFamilyHarf = (forms: ExposureCard[]) => forms.find((form) => form.harf)?.harf;

export const getVerbFamilyEnglishStemLabel = (forms: ExposureCard[]) => {
  const representative = getVerbFamilyPastForm(forms);
  const english = representative?.english?.trim();
  return english ? formatVerbFamilyEnglishStem(english) : "";
};

export const getVerbFamilyBrowseMeaning = (verb: VerbFamily) => {
  const pastEdit = getWordEdit(`${verb.id}-past`)?.english;
  const meaning = pastEdit?.trim() || verb.meaning;
  return formatVerbFamilyEnglishStem(meaning);
};

export const getVerbFamilyMeaningLabel = (forms: ExposureCard[]) => {
  const representative = getVerbFamilyPastForm(forms);
  const english = representative?.english?.trim();
  if (!english) return "";
  return formatVerbFamilyEnglishStem(english);
};

/** Map a verb-form index to the paradigm grid cell index (harf sits after the last form). */
export const verbFormIndexToParadigmCellIndex = (_forms: ExposureCard[], formIndex: number) => {
  if (formIndex < 0) return -1;
  return formIndex;
};

export type VerbBrowseCell =
  | {
      kind: "form";
      key: VerbFormKey;
      cardId: string;
      arabic: string;
      english: string;
      sourceArabic: string;
      sourceEnglish: string;
      imageUrl?: string;
      weak?: boolean;
    }
  | { kind: "harf"; arabic: string };

export const getVerbBrowseCells = (verb: VerbFamily): VerbBrowseCell[] => {
  const cells: VerbBrowseCell[] = [];
  for (const key of VERB_FORM_ORDER) {
    const arabic = verb[key];
    if (typeof arabic !== "string" || !arabic) continue;
    const cardId = `${verb.id}-${key}`;
    const sourceEnglish = getVerbFormEnglish(verb, key);
    const projected = applyWordEditFields(cardId, {
      arabic,
      english: sourceEnglish,
      imageUrl: verb.images?.[key],
    });
    cells.push({
      kind: "form",
      key,
      cardId,
      arabic: projected.arabic,
      english: projected.english,
      sourceArabic: arabic,
      sourceEnglish,
      imageUrl: projected.imageUrl,
      weak: verb.hardForms?.[key],
    });
  }
  if (verb.harf) {
    cells.push({ kind: "harf", arabic: verb.harf });
  }
  return cells;
};

export type VerbParadigmCell = {
  id: string;
  label: string;
  arabic: string;
  imageUrl?: string;
};

export const buildVerbParadigmCells = (forms: ExposureCard[]): VerbParadigmCell[] => {
  const harf = getVerbFamilyHarf(forms);
  const cells: VerbParadigmCell[] = forms.map((form) => ({
    id: form.id,
    label: form.label ?? "",
    arabic: form.arabic,
    imageUrl: form.imageUrl,
  }));
  if (harf) {
    const familyId = forms[0] ? getVerbFamilyIdFromCardId(forms[0].id) : "verb";
    cells.push({
      id: `${familyId}-harf`,
      label: VERB_HARF_ARABIC_LABEL,
      arabic: harf,
    });
  }
  return cells;
};

export const getFamilyMeaningLabel = (forms: ExposureCard[]) =>
  forms[0]?.section === "nouns" ? getNounFamilyMeaningLabel(forms) : getVerbFamilyMeaningLabel(forms);

export const getBatchFamilyId = (card: ExposureCard) =>
  card.section === "verbs"
    ? getVerbFamilyIdFromCardId(card.id)
    : card.section === "nouns" && isNounFormCard(card)
      ? getNounFamilyIdFromCardId(card.id)
      : card.id;

export const resolveFamilyFormsForCard = (
  card: ExposureCard,
  familyFormsByCardId?: Map<string, ExposureCard[]>,
): ExposureCard[] | undefined => {
  if (!familyFormsByCardId) return undefined;
  const direct = familyFormsByCardId.get(card.id);
  if (direct) return direct;
  for (const forms of familyFormsByCardId.values()) {
    if (forms.some((form) => form.id === card.id)) return forms;
  }
  return undefined;
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

export type FamilyTestPrep = VerbFamilyTestPrep;

export const NOUN_FORM_ARABIC_LABELS: Record<NounFormKey, string> = {
  singular: "المفرد",
  plural: "الجمع",
};

const NOUN_FORM_SPECS = (Object.keys(NOUN_FORM_ARABIC_LABELS) as NounFormKey[]).map((key) => ({
  key,
  label: NOUN_FORM_ARABIC_LABELS[key],
}));

export const NOUN_FORM_ORDER: NounFormKey[] = NOUN_FORM_SPECS.map(({ key }) => key);

const NOUN_FORM_SUFFIX_PATTERN = /-(singular|plural)$/;

export const isNounFormCard = (card: ExposureCard) =>
  card.section === "nouns" && NOUN_FORM_SUFFIX_PATTERN.test(card.id);

export const getNounFamilyIdFromCardId = (cardId: string) => cardId.replace(NOUN_FORM_SUFFIX_PATTERN, "");

export const getNounFamilyMeaningLabel = (forms: ExposureCard[]) => {
  const singular = forms.find((form) => form.id.endsWith("-singular")) ?? forms[0];
  if (!singular) return "";
  return stripVerbFormSuffix(singular.english);
};

const nounUnitToExposureCards = (unit: NounItem[], lesson: Lesson, batchIndex: number): ExposureCard[] => {
  if (isNounStemGroupWithPlural(unit)) {
    const singular = unit.find((item) => !isNounPluralItem(item)) ?? unit[0]!;
    const plural = unit.find(isNounPluralItem);
    const familyId = singular.id;
    const cards: ExposureCard[] = [
      {
        id: `${familyId}-singular`,
        arabic: singular.arabic,
        english: singular.english,
        section: "nouns",
        batchIndex,
        label: NOUN_FORM_ARABIC_LABELS.singular,
        imageUrl: vocabularyImageUrl(lesson, singular.arabicImage),
      },
    ];
    if (plural) {
      cards.push({
        id: `${familyId}-plural`,
        arabic: plural.arabic,
        english: plural.english,
        section: "nouns",
        batchIndex,
        label: NOUN_FORM_ARABIC_LABELS.plural,
        imageUrl: vocabularyImageUrl(lesson, plural.arabicImage),
      });
    }
    return cards;
  }

  const noun = unit[0]!;
  return [
    {
      id: noun.id,
      arabic: noun.arabic,
      english: noun.english,
      section: "nouns",
      batchIndex,
      imageUrl: vocabularyImageUrl(lesson, noun.arabicImage),
    },
  ];
};

const buildNounFamilyTestUnits = (nounCards: ExposureCard[], pool: ExposureCard[]): VerbFamilyTestPrep => {
  const familyIds = [...new Set(nounCards.filter(isNounFormCard).map((card) => getNounFamilyIdFromCardId(card.id)))];
  const cards: ExposureCard[] = [];
  const familyFormsByCardId = new Map<string, ExposureCard[]>();

  for (const familyId of familyIds) {
    const forms = NOUN_FORM_SPECS.flatMap(({ key }) => {
      const formCard = pool.find(
        (item) => item.section === "nouns" && getNounFamilyIdFromCardId(item.id) === familyId && item.id.endsWith(`-${key}`),
      );
      return formCard ? [formCard] : [];
    });
    if (forms.length === 0) continue;
    const representative = forms[0]!;
    cards.push(representative);
    familyFormsByCardId.set(representative.id, forms);
  }

  const standaloneCards = nounCards.filter((card) => !isNounFormCard(card));
  return {
    cards: [...standaloneCards, ...cards],
    familyFormsByCardId,
  };
};

export const prepareNounBatchReviewTestCards = (cards: ExposureCard[]): VerbFamilyTestPrep =>
  buildNounFamilyTestUnits(
    cards.filter((card) => card.section === "nouns"),
    cards,
  );

export const getNounFamilyReviewRepresentative = (lesson: Lesson, formCardId: string): ExposureCard | undefined => {
  const familyId = getNounFamilyIdFromCardId(formCardId);
  const prep = prepareNounBatchReviewTestCards(
    getCachedLessonExposureCards(lesson).filter(
      (card) => card.section === "nouns" && getNounFamilyIdFromCardId(card.id) === familyId,
    ),
  );
  return prep.cards.find((card) => getNounFamilyIdFromCardId(card.id) === familyId);
};

export const groupNounCardsIntoFamilies = (cards: ExposureCard[]): ExposureCard[][] => {
  const units: ExposureCard[][] = [];

  for (const card of cards) {
    const familyId = isNounFormCard(card) ? getNounFamilyIdFromCardId(card.id) : null;
    const last = units.at(-1);
    const lastFamilyId =
      last?.[0] && isNounFormCard(last[0]) ? getNounFamilyIdFromCardId(last[0].id) : null;

    if (familyId && lastFamilyId === familyId) {
      last!.push(card);
      continue;
    }

    units.push([card]);
  }

  return units.map((unit) => {
    if (unit.length <= 1 || !isNounFormCard(unit[0]!)) return unit;
    return NOUN_FORM_SPECS.flatMap(({ key }) => {
      const form = unit.find((item) => item.id.endsWith(`-${key}`));
      return form ? [form] : [];
    });
  });
};

export const groupExposureCardsIntoExposureUnits = (cards: ExposureCard[]): ExposureCard[][] => {
  if (cards.length === 0) return [];
  if (cards[0]?.section === "verbs") return groupExposureCardsIntoVerbFamilies(cards);
  if (cards[0]?.section === "nouns") return groupNounCardsIntoFamilies(cards);
  return cards.map((card) => [card]);
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

export const getVerbFamilyReviewRepresentative = (lesson: Lesson, formCardId: string): ExposureCard | undefined => {
  const familyId = getVerbFamilyIdFromCardId(formCardId);
  const prep = prepareVerbBatchReviewTestCards(
    getCachedLessonExposureCards(lesson).filter(
      (card) => card.section === "verbs" && getVerbFamilyIdFromCardId(card.id) === familyId,
    ),
  );
  return prep.cards.find((card) => getVerbFamilyIdFromCardId(card.id) === familyId);
};

export const prepareLessonTestWritingCards = (cards: ExposureCard[]): VerbFamilyTestPrep => {
  const phrases = cards.filter((card) => card.section === "phrases");
  const nounPrep = buildNounFamilyTestUnits(
    cards.filter((card) => card.section === "nouns"),
    cards,
  );
  const verbPrep = buildVerbFamilyTestUnits(
    cards.filter((card) => card.section === "verbs"),
    cards,
  );
  return {
    cards: [...phrases, ...nounPrep.cards, ...verbPrep.cards],
    familyFormsByCardId: new Map([...nounPrep.familyFormsByCardId, ...verbPrep.familyFormsByCardId]),
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

/** Batch study/test units: verb and noun batches collapse to one card per family; other sections pass through. */
export const prepareBatchStudyCards = (cards: ExposureCard[]): VerbFamilyTestPrep => {
  if (cards.length === 0) return { cards, familyFormsByCardId: new Map() };
  if (cards[0]?.section === "verbs") {
    return prepareVerbBatchReviewTestCards(cards);
  }
  if (cards[0]?.section === "nouns") {
    return prepareNounBatchReviewTestCards(cards);
  }
  return { cards, familyFormsByCardId: new Map() };
};

export const getBatchStudyCards = (cards: ExposureCard[]) => prepareBatchStudyCards(cards).cards;

export const getBatchStudyCardCount = (cards: ExposureCard[]) => getBatchStudyCards(cards).length;

export const getLessonVerbFamilyCards = (lessonCards: ExposureCard[]): ExposureCard[] =>
  prepareVerbBatchReviewTestCards(lessonCards.filter((card) => card.section === "verbs")).cards;

export const getLessonNounFamilyCards = (lessonCards: ExposureCard[]): ExposureCard[] =>
  prepareNounBatchReviewTestCards(lessonCards.filter((card) => card.section === "nouns")).cards;

export const getNounFamilyFormsForCard = (allCards: ExposureCard[], card: ExposureCard): ExposureCard[] | null => {
  if (card.section !== "nouns" || !isNounFormCard(card)) return null;
  const familyId = getNounFamilyIdFromCardId(card.id);
  const familyCards = allCards.filter(
    (item) => item.section === "nouns" && getNounFamilyIdFromCardId(item.id) === familyId,
  );
  const forms = NOUN_FORM_SPECS.flatMap(({ key }) => {
    const formCard = familyCards.find((item) => item.id.endsWith(`-${key}`));
    return formCard ? [formCard] : [];
  });
  return forms.length > 0 ? forms : null;
};

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
        harf: verb.harf,
      },
    ];
  });

const mapPhraseBatches = <T,>(items: T[], mapper: (item: T, batchIndex: number) => ExposureCard[]) => {
  const sizes = getBatchSizes(items.length, PHRASE_BATCH_SIZE);
  let offset = 0;
  return sizes.flatMap((size, batchIndex) => {
    const slice = items.slice(offset, offset + size);
    offset += size;
    return slice.flatMap((item) => mapper(item, batchIndex));
  });
};

export const buildLessonExposureCards = (lesson: Lesson): ExposureCard[] => {
  const nouns = [...lesson.nouns, ...lessonExtrasAsNounItems(lesson.id)];
  const phrases = [...lesson.phrases, ...lessonExtrasAsPhraseItems(lesson.id)];
  const nounCards = buildNounBatchStructure(nouns).unitBatches.flatMap((batch, batchIndex) =>
    batch.flatMap((unit) => nounUnitToExposureCards(unit, lesson, batchIndex)),
  );
  const phraseCards = mapPhraseBatches(phrases, (phrase, batchIndex) => [
    {
      id: phrase.id,
      arabic: phrase.arabic,
      english: phrase.english,
      section: "phrases" as const,
      batchIndex,
      imageUrl: vocabularyImageUrl(lesson, phrase.arabicImage),
    },
  ]);
  const verbCards = getVerbBatches(lesson.verbs).flatMap((batch, batchIndex) =>
    batch.flatMap((verb) => verbFamilyToExposureCards(verb, lesson, batchIndex)),
  );

  return [...nounCards, ...phraseCards, ...verbCards];
};

const lessonExposureCardsCache = new Map<string, ExposureCard[]>();

export const getCachedLessonExposureCards = (lesson: Lesson): ExposureCard[] => {
  const revision = `${getWordEditRevision()}:${getLessonExtrasRevision()}`;
  const cacheKey = `${lesson.id}@${revision}`;
  const cached = lessonExposureCardsCache.get(cacheKey);
  if (cached) return cached;

  const cards = annotateEnglishCollisions(buildLessonExposureCards(lesson).map(applyWordEdit));
  for (const key of lessonExposureCardsCache.keys()) {
    if (key.startsWith(`${lesson.id}@`)) lessonExposureCardsCache.delete(key);
  }
  lessonExposureCardsCache.set(cacheKey, cards);
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
  sourceArabic: string;
  sourceEnglish: string;
  imageUrl?: string;
  weak?: boolean;
  batchIndex: number;
};

export type NounBrowseForm = {
  key: NounFormKey;
  cardId: string;
  arabic: string;
  english: string;
  sourceArabic: string;
  sourceEnglish: string;
  imageUrl?: string;
  weak?: boolean;
};

export type NounBrowseFamily = {
  id: string;
  batchIndex: number;
  meaning: string;
  forms: NounBrowseForm[];
  weak?: boolean;
};

const projectNounBrowseForm = (
  key: NounFormKey,
  cardId: string,
  arabic: string,
  english: string,
  imageUrl: string | undefined,
  weak?: boolean,
): NounBrowseForm => {
  const projected = applyWordEditFields(cardId, { arabic, english, imageUrl });
  return {
    key,
    cardId,
    arabic: projected.arabic,
    english: projected.english,
    sourceArabic: arabic,
    sourceEnglish: english,
    imageUrl: projected.imageUrl,
    weak,
  };
};

export const buildNounBrowseFamilies = (lesson: Lesson): NounBrowseFamily[] => {
  const nouns = [...lesson.nouns, ...lessonExtrasAsNounItems(lesson.id)];
  const families = buildNounBatchStructure(nouns).unitBatches.flatMap((batch, batchIndex) =>
    batch.map((unit) => {
      if (isNounStemGroupWithPlural(unit)) {
        const singular = unit.find((item) => !isNounPluralItem(item)) ?? unit[0]!;
        const plural = unit.find(isNounPluralItem);
        const familyId = singular.id;
        const forms: NounBrowseForm[] = [
          projectNounBrowseForm(
            "singular",
            `${familyId}-singular`,
            singular.arabic,
            singular.english,
            vocabularyImageUrl(lesson, singular.arabicImage),
            singular.hard,
          ),
        ];
        if (plural) {
          forms.push(
            projectNounBrowseForm(
              "plural",
              `${familyId}-plural`,
              plural.arabic,
              plural.english,
              vocabularyImageUrl(lesson, plural.arabicImage),
              plural.hard,
            ),
          );
        }
        const meaningSource = forms[0]!;
        return {
          id: familyId,
          batchIndex,
          meaning: stripVerbFormSuffix(meaningSource.english),
          forms,
          weak: singular.hard || plural?.hard,
        };
      }
      const noun = unit[0]!;
      const form = projectNounBrowseForm(
        "singular",
        noun.id,
        noun.arabic,
        noun.english,
        vocabularyImageUrl(lesson, noun.arabicImage),
        noun.hard,
      );
      return {
        id: noun.id,
        batchIndex,
        meaning: form.english,
        forms: [form],
        weak: noun.hard,
      };
    }),
  );

  return families;
};

/** @deprecated Use buildNounBrowseFamilies for browse UI. */
export const buildNounBrowseRows = (lesson: Lesson): VocabularyBrowseRow[] =>
  buildNounBrowseFamilies(lesson).map((family) => ({
    id: family.id,
    arabic: family.forms.map((form) => form.arabic).join(" · "),
    english: family.meaning,
    sourceArabic: family.forms.map((form) => form.sourceArabic).join(" · "),
    sourceEnglish: family.forms[0]?.sourceEnglish ?? family.meaning,
    imageUrl: family.forms[0]?.imageUrl,
    weak: family.weak,
    batchIndex: family.batchIndex,
  }));

const buildPhraseBrowseRowsFromItems = (
  lesson: Lesson,
  phrases: Lesson["phrases"],
): VocabularyBrowseRow[] => {
  const sizes = getBatchSizes(phrases.length, PHRASE_BATCH_SIZE);
  let offset = 0;
  return sizes.flatMap((size, batchIndex) => {
    const slice = phrases.slice(offset, offset + size);
    offset += size;
    return slice.map((phrase) => {
      const projected = applyWordEditFields(phrase.id, {
        arabic: phrase.arabic,
        english: phrase.english,
        imageUrl: vocabularyImageUrl(lesson, phrase.arabicImage),
      });
      return {
        id: phrase.id,
        arabic: projected.arabic,
        english: projected.english,
        sourceArabic: phrase.arabic,
        sourceEnglish: phrase.english,
        imageUrl: projected.imageUrl,
        weak: phrase.hard,
        batchIndex,
      };
    });
  });
};

export const buildPhraseBrowseRows = (lesson: Lesson): VocabularyBrowseRow[] =>
  buildPhraseBrowseRowsFromItems(lesson, [...lesson.phrases, ...lessonExtrasAsPhraseItems(lesson.id)]);

export const buildVerbBrowseBatches = (verbs: VerbFamily[]): { batchIndex: number; verb: VerbFamily }[] =>
  getVerbBatches(verbs).flatMap((batch, batchIndex) => batch.map((verb) => ({ batchIndex, verb })));
