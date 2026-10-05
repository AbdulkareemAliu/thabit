import { lessons } from "./data";
import { formatEnglishCueText } from "./english-cue";
import {
  getBatchExposureCards,
  getCachedLessonExposureCards,
  getFamilyMeaningLabel,
  getNounFamilyIdFromCardId,
  getSectionExposureCards,
  getVerbFamilyIdFromCardId,
  prepareNounBatchReviewTestCards,
  prepareVerbBatchReviewTestCards,
} from "./exposure-cards";
import type { ReviewableCard, ReviewCardState } from "./review";
import { gradeReviewCard, listEligibleReviewRecords } from "./review";
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

export type DailyReviewStudyPrep = WritingTestCardPrep;

export const usesVerbFamilyWritingTest = (step: LessonStep | undefined) =>
  step?.section === "verbs" &&
  (step.kind === "batch" || step.kind === "batch-review" || step.kind === "vocabulary-test");

export const usesNounFamilyWritingTest = (step: LessonStep | undefined) =>
  step?.section === "nouns" &&
  (step.kind === "batch" || step.kind === "batch-review" || step.kind === "vocabulary-test");

export const usesFamilyWritingTest = (step: LessonStep | undefined) =>
  usesVerbFamilyWritingTest(step) || usesNounFamilyWritingTest(step);

export const toReviewableCard =
  (lessonId: string) =>
  (card: ExposureCard): ReviewableCard => ({
    id: card.id,
    lessonId,
    section: card.section,
    label: card.label,
  });

export type ReviewScheduleItem = {
  cardId: string;
  lessonNumber: number;
  section: SectionKind;
  english: string;
  state: ReviewCardState;
  dueAt: string;
  intervalDays: number;
  lastReviewedAt?: string;
};

export const getReviewScheduleItems = (completedStepIds: string[]): ReviewScheduleItem[] => {
  const listed = listEligibleReviewRecords(lessons, completedStepIds, getReviewableCardsForLesson);
  const prep = prepareDailyReviewStudyCards(listed.map(({ card }) => card));
  const exposureById = new Map(prep.cards.map((card) => [card.id, card]));

  return listed.map(({ record, card, lesson }) => {
    const exposure = exposureById.get(card.id);
    const forms = prep.familyFormsByCardId.get(card.id);
    const english =
      forms && forms.length > 0
        ? getFamilyMeaningLabel(forms)
        : exposure
          ? formatEnglishCueText(exposure)
          : card.label || card.id;

    return {
      cardId: record.cardId,
      lessonNumber: lesson.number,
      section: card.section,
      english,
      state: record.state,
      dueAt: record.dueAt,
      intervalDays: record.intervalDays,
      lastReviewedAt: record.lastReviewedAt,
    };
  });
};

export const getReviewableCardsForLesson = (lesson: Lesson): ReviewableCard[] => {
  const allCards = getCachedLessonExposureCards(lesson);
  const phraseCards = allCards.filter((card) => card.section === "phrases");
  const nounPrep = prepareNounBatchReviewTestCards(allCards.filter((card) => card.section === "nouns"));
  const verbPrep = prepareVerbBatchReviewTestCards(allCards.filter((card) => card.section === "verbs"));

  return [
    ...phraseCards.map(toReviewableCard(lesson.id)),
    ...nounPrep.cards.map(toReviewableCard(lesson.id)),
    ...verbPrep.cards.map(toReviewableCard(lesson.id)),
  ];
};

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

export const prepareDailyReviewStudyCards = (reviewableCards: ReviewableCard[]): DailyReviewStudyPrep => {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const verbFamilyIdsByLesson = new Map<string, Set<string>>();
  const nounFamilyIdsByLesson = new Map<string, Set<string>>();

  for (const card of reviewableCards) {
    if (card.section === "verbs") {
      const familyIds = verbFamilyIdsByLesson.get(card.lessonId) ?? new Set<string>();
      familyIds.add(getVerbFamilyIdFromCardId(card.id));
      verbFamilyIdsByLesson.set(card.lessonId, familyIds);
      continue;
    }
    if (card.section === "nouns") {
      const familyIds = nounFamilyIdsByLesson.get(card.lessonId) ?? new Set<string>();
      familyIds.add(getNounFamilyIdFromCardId(card.id));
      nounFamilyIdsByLesson.set(card.lessonId, familyIds);
    }
  }

  const verbExposureCards: ExposureCard[] = [];
  for (const [lessonId, familyIds] of verbFamilyIdsByLesson) {
    const lesson = lessonById.get(lessonId);
    if (!lesson) continue;
    verbExposureCards.push(
      ...getCachedLessonExposureCards(lesson).filter(
        (card) => card.section === "verbs" && familyIds.has(getVerbFamilyIdFromCardId(card.id)),
      ),
    );
  }

  const nounExposureCards: ExposureCard[] = [];
  for (const [lessonId, familyIds] of nounFamilyIdsByLesson) {
    const lesson = lessonById.get(lessonId);
    if (!lesson) continue;
    nounExposureCards.push(
      ...getCachedLessonExposureCards(lesson).filter(
        (card) => card.section === "nouns" && familyIds.has(getNounFamilyIdFromCardId(card.id)),
      ),
    );
  }

  const verbPrep = prepareVerbBatchReviewTestCards(verbExposureCards);
  const nounPrep = prepareNounBatchReviewTestCards(nounExposureCards);
  const phraseCards = resolveDailyReviewCards(reviewableCards.filter((card) => card.section === "phrases"));

  return {
    cards: [...phraseCards, ...nounPrep.cards, ...verbPrep.cards],
    familyFormsByCardId: new Map([...nounPrep.familyFormsByCardId, ...verbPrep.familyFormsByCardId]),
  };
};

export const gradeDailyReviewPrompt = (promptCardId: string, knewIt: boolean) => {
  gradeReviewCard(promptCardId, knewIt);
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
  if (usesNounFamilyWritingTest(step)) {
    return prepareNounBatchReviewTestCards(cards);
  }
  return { cards, familyFormsByCardId: new Map() };
};

/** Writing-test cards for a single batch (verb batches collapse to one prompt per family). */
export const prepareWithinBatchWritingTestCards = (lesson: Lesson, stepId: string): WritingTestCardPrep => {
  const step = lesson.steps.find((item) => item.id === stepId);
  if (step?.kind !== "batch") return { cards: [], familyFormsByCardId: new Map() };

  const cards = getBatchExposureCards(lesson, stepId);
  if (usesVerbFamilyWritingTest(step)) {
    return prepareVerbBatchReviewTestCards(cards);
  }
  if (usesNounFamilyWritingTest(step)) {
    return prepareNounBatchReviewTestCards(cards);
  }
  return { cards, familyFormsByCardId: new Map() };
};

export const getWithinBatchWritingTestCards = (lesson: Lesson, stepId: string) =>
  prepareWithinBatchWritingTestCards(lesson, stepId).cards;
