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

export const getVerbFormEnglish = (verb: VerbFamily, form: VerbFormKey) => {
  const direct = verb.englishByForm?.[form]?.trim();
  if (direct) return normalizeVerbFormEnglish(direct);

  if (form === "activeParticiple") {
    return `${stripVerbFormSuffix(normalizeVerbFormEnglish(verb.meaning))} (ism fa'il)`;
  }

  return normalizeVerbFormEnglish(verb.meaning);
};

const VERB_FORM_SPECS = [
  { key: "past" as const, label: "Past" },
  { key: "present" as const, label: "Present" },
  { key: "command" as const, label: "Command" },
  { key: "masdar" as const, label: "Masdar" },
  { key: "passive" as const, label: "Passive" },
  { key: "activeParticiple" as const, label: "Ism Fa'il" },
] as const;

export const getVerbFormLabel = (form: VerbFormKey) =>
  VERB_FORM_SPECS.find((spec) => spec.key === form)?.label ?? form;

export const countVerbFamilyForms = (verb: VerbFamily): number =>
  VERB_FORM_SPECS.filter(({ key }) => typeof verb[key] === "string" && verb[key]).length;

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
