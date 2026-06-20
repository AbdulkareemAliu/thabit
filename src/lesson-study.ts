import { lessons } from "./data";
import {
  getBatchExposureCards,
  getCachedLessonExposureCards,
  getSectionExposureCards,
  prepareVerbBatchReviewTestCards,
} from "./exposure-cards";
import type { ReviewableCard } from "./review";
import {
  BATCH_REVIEW_WRITING_CONFIG,
  BATCH_TEST_WRITING_CONFIG,
  SECTION_FINALE_WRITING_CONFIG,
  type WritingQueueConfig,
} from "./study-queue";
import type { ExposureCard, Lesson, LessonStep, SectionKind } from "./types";

export type WritingTestCardPrep = {
  cards: ExposureCard[];
  familyFormsByCardId: Map<string, ExposureCard[]>;
};

export const usesVerbFamilyWritingTest = (step: LessonStep | undefined) =>
  step?.section === "verbs" && (step.kind === "batch-review" || step.kind === "vocabulary-test");

export const toReviewableCard =
  (lessonId: string) =>
  (card: ExposureCard): ReviewableCard => ({
    id: card.id,
    lessonId,
    section: card.section,
    label: card.label,
  });

export const getReviewableCardsForLesson = (lesson: Lesson) =>
  getCachedLessonExposureCards(lesson).map(toReviewableCard(lesson.id));

export const getVocabularyTestSection = (stepId: string): SectionKind | null =>
  stepId.endsWith("-noun-test")
    ? "nouns"
    : stepId.endsWith("-verb-test")
      ? "verbs"
      : stepId.endsWith("-phrase-test")
        ? "phrases"
        : null;

export const resolveDailyReviewCards = (cards: ReviewableCard[]) => {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const cardByLesson = new Map<string, Map<string, ExposureCard>>();

  return cards
    .map((card) => {
      let lessonCards = cardByLesson.get(card.lessonId);
      if (!lessonCards) {
        const lesson = lessonById.get(card.lessonId);
        if (!lesson) return undefined;
        lessonCards = new Map(getCachedLessonExposureCards(lesson).map((item) => [item.id, item]));
        cardByLesson.set(card.lessonId, lessonCards);
      }
      return lessonCards.get(card.id);
    })
    .filter((card): card is ExposureCard => Boolean(card));
};

export const getStepContinueLabel = (step: LessonStep) =>
  step.kind === "batch" || step.kind === "batch-review" ? "Next step" : `Continue to ${step.title}`;

export const getWritingConfigForStep = (lesson: Lesson, stepId: string): WritingQueueConfig => {
  const step = lesson.steps.find((item) => item.id === stepId);
  if (step?.kind === "batch-review") return BATCH_REVIEW_WRITING_CONFIG;
  if (step?.kind === "vocabulary-test") return SECTION_FINALE_WRITING_CONFIG;
  return BATCH_TEST_WRITING_CONFIG;
};

export const getWritingStudyCardsForStep = (lesson: Lesson, stepId: string) => {
  const step = lesson.steps.find((item) => item.id === stepId);
  if (step?.kind === "batch-review") return getBatchExposureCards(lesson, stepId);
  const section = getVocabularyTestSection(stepId);
  return section ? getSectionExposureCards(lesson, section) : [];
};

export const prepareWritingTestCardsForStep = (lesson: Lesson, stepId: string): WritingTestCardPrep => {
  const step = lesson.steps.find((item) => item.id === stepId);
  const cards = getWritingStudyCardsForStep(lesson, stepId);
  if (usesVerbFamilyWritingTest(step)) {
    return prepareVerbBatchReviewTestCards(cards);
  }
  return { cards, familyFormsByCardId: new Map() };
};

/** Per-form cards for the writing-test phase at the end of a single batch. */
export const getWithinBatchWritingTestCards = (lesson: Lesson, stepId: string) => {
  const step = lesson.steps.find((item) => item.id === stepId);
  if (step?.kind !== "batch") return [];
  return getBatchExposureCards(lesson, stepId);
};
