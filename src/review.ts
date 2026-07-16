import {
  getCachedLessonExposureCards,
  getNounFamilyIdFromCardId,
  getNounFamilyReviewRepresentative,
  getVerbFamilyIdFromCardId,
  getVerbFamilyReviewRepresentative,
  prepareNounBatchReviewTestCards,
  prepareVerbBatchReviewTestCards,
} from "./exposure-cards";
import { REVIEW_MAX_INTERVAL_DAYS, REVIEW_NEW_CARD_STAGGER_DAYS, REVIEW_SCHEDULE_JITTER_DAYS } from "./config";
import { isLessonComplete, isLessonFinalComplete, isSectionReadyForFinal } from "./progress";
import { lessons } from "./data";
import { shuffle } from "./shuffle";
import { addDays, todayKey } from "./today";
import type { Lesson, SectionKind } from "./types";

export const REVIEW_STORAGE_KEY = "thabit.reviewCards";
const STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY = "thabit.migration.staggeredReviewSchedule_v1";
const GLOBAL_NEW_CARD_STAGGER_MIGRATION_KEY = "thabit.migration.globalNewCardStagger_v2";
const VERB_FAMILY_REVIEW_MIGRATION_KEY = "thabit.migration.verbFamilyReview_v1";
const NOUN_FAMILY_REVIEW_MIGRATION_KEY = "thabit.migration.nounFamilyReview_v1";
export const MAX_INTERVAL_DAYS = REVIEW_MAX_INTERVAL_DAYS;
const DEFAULT_EASE = 2.5;
const HARD_EASE = 2.3;

export type ReviewCardState = "new" | "learning" | "review" | "relearning";

export type ReviewCardRecord = {
  cardId: string;
  lessonId: string;
  state: ReviewCardState;
  dueAt: string;
  intervalDays: number;
  ease: number;
  learningStep: number;
  lapses: number;
  lastReviewedAt?: string;
};

export type ReviewableCard = {
  id: string;
  lessonId: string;
  section: SectionKind;
  label?: string;
};

export type DailyReviewStats = {
  dueToday: number;
  reviewCount: number;
  newCount: number;
};

const readReviewCards = (): Record<string, ReviewCardRecord> => {
  try {
    const stored = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, ReviewCardRecord>) : {};
  } catch {
    return {};
  }
};

const writeReviewCards = (cards: Record<string, ReviewCardRecord>) => {
  window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(cards));
};

const capInterval = (days: number) => Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));

/** Evenly spread `total` cards across days 0 … REVIEW_NEW_CARD_STAGGER_DAYS - 1. */
export const staggerNewCardOffsetDays = (index: number, total: number) => {
  if (total <= 1 || REVIEW_NEW_CARD_STAGGER_DAYS <= 1) return 0;
  return Math.floor((index * (REVIEW_NEW_CARD_STAGGER_DAYS - 1)) / (total - 1));
};

const stableScheduleJitterDays = (cardId: string) => {
  if (REVIEW_SCHEDULE_JITTER_DAYS <= 0) return 0;
  let hash = 0;
  for (let index = 0; index < cardId.length; index += 1) {
    hash = (hash * 31 + cardId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % (REVIEW_SCHEDULE_JITTER_DAYS + 1);
};

const spreadNewCardRecordsOverWindow = (records: ReviewCardRecord[], today: string) => {
  if (records.length <= 1) return false;

  shuffle(records).forEach((record, index) => {
    record.dueAt = addDays(today, staggerNewCardOffsetDays(index, records.length));
  });
  return true;
};

/** When review is skipped, new cards pile onto today — spread that backlog across the week. */
const rebalanceOverdueNewCards = (
  cards: Record<string, ReviewCardRecord>,
  eligibleCardIds: Set<string>,
  today: string,
) => {
  const overdueNew = Object.values(cards).filter(
    (record) => eligibleCardIds.has(record.cardId) && record.state === "new" && record.dueAt <= today,
  );
  if (overdueNew.length <= 1) return false;
  return spreadNewCardRecordsOverWindow(overdueNew, today);
};

export const isLessonReviewEligible = (lesson: Lesson, completedStepIds: string[]) => isLessonComplete(lesson, completedStepIds);

const getSectionTestStepId = (lessonId: string, section: SectionKind) =>
  section === "nouns"
    ? `${lessonId}-noun-test`
    : section === "verbs"
      ? `${lessonId}-verb-test`
      : `${lessonId}-phrase-test`;

/** A section enters daily review once its vocabulary test is done, or when the whole lesson is finished. */
export const isSectionReviewEligible = (lessonId: string, section: SectionKind, completedStepIds: string[]) => {
  if (isLessonFinalComplete(lessonId, completedStepIds)) return true;

  const lesson = lessons.find((item) => item.id === lessonId);
  if (lesson) return isSectionReadyForFinal(lesson, section, completedStepIds);

  return completedStepIds.includes(getSectionTestStepId(lessonId, section));
};

export const isReviewCardEligible = (card: ReviewableCard, completedStepIds: string[]) =>
  isSectionReviewEligible(card.lessonId, card.section, completedStepIds);

const getEligibleLessonCards = (
  lesson: Lesson,
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => getCardsForLesson(lesson).filter((card) => isReviewCardEligible({ ...card, lessonId: lesson.id }, completedStepIds));

const isCardHard = (card: ReviewableCard, lesson: Lesson) => {
  if (card.section === "nouns") {
    const familyId = getNounFamilyIdFromCardId(card.id);
    return lesson.nouns.some((item) => item.id === familyId && item.hard);
  }
  if (card.section === "phrases") return lesson.phrases.some((item) => item.id === card.id && item.hard);
  const familyId = getVerbFamilyIdFromCardId(card.id);
  const verb = lesson.verbs.find((item) => item.id === familyId);
  if (!verb?.hardForms) return false;
  return Object.values(verb.hardForms).some(Boolean);
};

const seedReviewCard = (card: ReviewableCard, lesson: Lesson, today: string, startOffsetDays = 0): ReviewCardRecord => ({
  cardId: card.id,
  lessonId: lesson.id,
  state: "new",
  dueAt: addDays(today, startOffsetDays),
  intervalDays: 0,
  ease: isCardHard(card, lesson) ? HARD_EASE : DEFAULT_EASE,
  learningStep: 0,
  lapses: 0,
});

export const resolveReviewableCard = (card: ReviewableCard, lesson: Lesson): ReviewableCard => {
  if (card.section === "verbs") {
    const representative = getVerbFamilyReviewRepresentative(lesson, card.id);
    if (!representative) return card;

    return {
      id: representative.id,
      lessonId: card.lessonId,
      section: "verbs",
      label: representative.label,
    };
  }

  if (card.section === "nouns") {
    const representative = getNounFamilyReviewRepresentative(lesson, card.id);
    if (!representative) return card;

    return {
      id: representative.id,
      lessonId: card.lessonId,
      section: "nouns",
      label: representative.label,
    };
  }

  return card;
};

const mergeFamilyReviewRecords = (
  records: ReviewCardRecord[],
  representativeId: string,
  lessonId: string,
): ReviewCardRecord => {
  const primary = [...records].sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0]!;
  return {
    ...primary,
    cardId: representativeId,
    lessonId,
    lapses: Math.max(...records.map((record) => record.lapses)),
    ease: Math.min(...records.map((record) => record.ease)),
  };
};

/** One-time reset so existing users pick up staggered seeding and the 30-day max interval. */
export const applyStaggeredReviewScheduleMigration = () => {
  if (window.localStorage.getItem(STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY)) return;

  window.localStorage.removeItem(REVIEW_STORAGE_KEY);
  window.localStorage.setItem(STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY, "1");
};

/** Merge legacy per-form verb review records into one schedule per family. */
export const applyVerbFamilyReviewMigration = (allLessons: Lesson[]) => {
  if (window.localStorage.getItem(VERB_FAMILY_REVIEW_MIGRATION_KEY)) return;

  const cards = readReviewCards();
  let changed = false;

  for (const lesson of allLessons) {
    const verbCards = getCachedLessonExposureCards(lesson).filter((card) => card.section === "verbs");
    const prep = prepareVerbBatchReviewTestCards(verbCards);

    for (const representative of prep.cards) {
      const familyId = getVerbFamilyIdFromCardId(representative.id);
      const formIds = verbCards
        .filter((card) => getVerbFamilyIdFromCardId(card.id) === familyId)
        .map((card) => card.id);
      const familyRecords = formIds.map((formId) => cards[formId]).filter(Boolean);
      if (familyRecords.length === 0) continue;

      cards[representative.id] = mergeFamilyReviewRecords(familyRecords, representative.id, lesson.id);
      changed = true;

      for (const formId of formIds) {
        if (formId === representative.id) continue;
        delete cards[formId];
      }
    }
  }

  if (changed) writeReviewCards(cards);
  window.localStorage.setItem(VERB_FAMILY_REVIEW_MIGRATION_KEY, "1");
};

/** Merge legacy per-form noun review records into one schedule per singular/plural family. */
export const applyNounFamilyReviewMigration = (allLessons: Lesson[]) => {
  if (window.localStorage.getItem(NOUN_FAMILY_REVIEW_MIGRATION_KEY)) return;

  const cards = readReviewCards();
  let changed = false;

  for (const lesson of allLessons) {
    const nounCards = getCachedLessonExposureCards(lesson).filter((card) => card.section === "nouns");
    const prep = prepareNounBatchReviewTestCards(nounCards);

    for (const representative of prep.cards) {
      const familyId = getNounFamilyIdFromCardId(representative.id);
      const formIds = nounCards
        .filter((card) => getNounFamilyIdFromCardId(card.id) === familyId)
        .map((card) => card.id);
      const legacyIds = lesson.nouns
        .filter((item) => item.id === familyId || formIds.includes(`${item.id}-singular`) || formIds.includes(`${item.id}-plural`))
        .map((item) => item.id);
      const relatedIds = [...new Set([...formIds, ...legacyIds])];
      const familyRecords = relatedIds.map((formId) => cards[formId]).filter(Boolean);
      if (familyRecords.length === 0) continue;

      cards[representative.id] = mergeFamilyReviewRecords(familyRecords, representative.id, lesson.id);
      changed = true;

      for (const formId of relatedIds) {
        if (formId === representative.id) continue;
        delete cards[formId];
      }
    }
  }

  if (changed) writeReviewCards(cards);
  window.localStorage.setItem(NOUN_FAMILY_REVIEW_MIGRATION_KEY, "1");
};

/** One-time spread of never-reviewed new cards globally across a week (fixes backlog pile-ups). */
export const applyGlobalNewCardStaggerMigration = (
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => {
  if (window.localStorage.getItem(GLOBAL_NEW_CARD_STAGGER_MIGRATION_KEY)) return;

  const today = todayKey();
  const cards = readReviewCards();
  const eligibleCardIds = new Set<string>();
  const newRecords: ReviewCardRecord[] = [];

  for (const lesson of allLessons) {
    for (const card of getEligibleLessonCards(lesson, completedStepIds, getCardsForLesson)) {
      eligibleCardIds.add(card.id);
      const record = cards[card.id];
      if (record?.state === "new" && !record.lastReviewedAt) {
        newRecords.push(record);
      }
    }
  }

  if (spreadNewCardRecordsOverWindow(newRecords, today)) {
    writeReviewCards(cards);
  }

  window.localStorage.setItem(GLOBAL_NEW_CARD_STAGGER_MIGRATION_KEY, "1");
};

/** @deprecated Use applyGlobalNewCardStaggerMigration. Kept so older migration keys stay satisfied. */
export const applyShorterNewCardStaggerMigration = (
  _allLessons: Lesson[],
  _completedStepIds: string[],
  _getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => {};

export const syncReviewPool = (allLessons: Lesson[], completedStepIds: string[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  const today = todayKey();
  const cards = readReviewCards();
  const eligibleCardIds = new Set<string>();
  const missing: { card: ReviewableCard; lesson: Lesson }[] = [];

  for (const lesson of allLessons) {
    for (const card of getEligibleLessonCards(lesson, completedStepIds, getCardsForLesson)) {
      eligibleCardIds.add(card.id);
      if (!cards[card.id]) {
        missing.push({ card: { ...card, lessonId: lesson.id }, lesson });
      }
    }
  }

  let changed = false;

  if (missing.length > 0) {
    shuffle(missing).forEach(({ card, lesson }, index) => {
      const startOffsetDays = staggerNewCardOffsetDays(index, missing.length);
      cards[card.id] = seedReviewCard(card, lesson, today, startOffsetDays);
    });
    changed = true;
  }

  if (rebalanceOverdueNewCards(cards, eligibleCardIds, today)) {
    changed = true;
  }

  if (changed) writeReviewCards(cards);
};

const scheduleLearningSuccess = (record: ReviewCardRecord, today: string): ReviewCardRecord => {
  const nextStep = record.learningStep + 1;

  if (nextStep >= 3) {
    const intervalDays = 7;
    return {
      ...record,
      state: "review",
      learningStep: 0,
      intervalDays,
      dueAt: addDays(today, intervalDays + stableScheduleJitterDays(record.cardId)),
      ease: record.ease,
      lastReviewedAt: today,
    };
  }

  const intervalDays = nextStep === 1 ? 1 : 3;
  return {
    ...record,
    state: record.state === "new" ? "learning" : record.state,
    learningStep: nextStep,
    intervalDays,
    dueAt: addDays(today, intervalDays + stableScheduleJitterDays(record.cardId)),
    lastReviewedAt: today,
  };
};

const scheduleReviewSuccess = (record: ReviewCardRecord, today: string): ReviewCardRecord => {
  const nextInterval = capInterval(record.intervalDays > 0 ? record.intervalDays * record.ease : 1);
  return {
    ...record,
    state: "review",
    intervalDays: nextInterval,
    ease: Math.min(record.ease + 0.05, 3),
    dueAt: addDays(today, nextInterval + stableScheduleJitterDays(record.cardId)),
    lastReviewedAt: today,
  };
};

const scheduleMiss = (record: ReviewCardRecord, today: string): ReviewCardRecord => ({
  ...record,
  state: "relearning",
  learningStep: 0,
  intervalDays: 1,
  ease: Math.max(record.ease - 0.2, 1.3),
  lapses: record.lapses + 1,
  dueAt: today,
  lastReviewedAt: today,
});

export const gradeReviewCard = (cardId: string, knewIt: boolean) => {
  const cards = readReviewCards();
  const record = cards[cardId];
  if (!record) return;

  const today = todayKey();
  cards[cardId] = knewIt
    ? record.state === "review"
      ? scheduleReviewSuccess(record, today)
      : scheduleLearningSuccess(record, today)
    : scheduleMiss(record, today);
  writeReviewCards(cards);
};

export const recordMemorizationMiss = (card: ReviewableCard, lesson: Lesson, completedStepIds: string[]) => {
  const reviewCard = resolveReviewableCard(card, lesson);
  if (!isReviewCardEligible({ ...reviewCard, lessonId: lesson.id }, completedStepIds)) return;
  const today = todayKey();
  const cards = readReviewCards();
  const existing = cards[reviewCard.id] ?? seedReviewCard({ ...reviewCard, lessonId: lesson.id }, lesson, today);
  cards[reviewCard.id] = scheduleMiss(existing, today);
  writeReviewCards(cards);
};

const buildEligibleCardIndex = (allLessons: Lesson[], completedStepIds: string[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  const lessonById = new Map(allLessons.map((lesson) => [lesson.id, lesson]));
  const cardById = new Map<string, ReviewableCard>();

  for (const lesson of allLessons) {
    for (const card of getEligibleLessonCards(lesson, completedStepIds, getCardsForLesson)) {
      cardById.set(card.id, { ...card, lessonId: lesson.id });
    }
  }

  return { lessonById, cardById };
};

export const getDailyReviewStats = (
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
): DailyReviewStats => {
  const today = todayKey();
  const { cardById } = buildEligibleCardIndex(allLessons, completedStepIds, getCardsForLesson);
  const due = Object.values(readReviewCards()).filter((card) => card.dueAt <= today && cardById.has(card.cardId));

  return {
    dueToday: due.length,
    reviewCount: due.filter((card) => card.state !== "new").length,
    newCount: due.filter((card) => card.state === "new").length,
  };
};

export const buildDailyReviewQueue = (allLessons: Lesson[], completedStepIds: string[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  syncReviewPool(allLessons, completedStepIds, getCardsForLesson);

  const today = todayKey();
  const stored = readReviewCards();
  const { lessonById, cardById } = buildEligibleCardIndex(allLessons, completedStepIds, getCardsForLesson);

  const due = Object.values(stored)
    .filter((record) => record.dueAt <= today && cardById.has(record.cardId))
    .sort((left, right) => {
      if (left.dueAt !== right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (right.lapses !== left.lapses) return right.lapses - left.lapses;
      const leftLesson = lessonById.get(left.lessonId);
      const rightLesson = lessonById.get(right.lessonId);
      const leftCard = cardById.get(left.cardId);
      const rightCard = cardById.get(right.cardId);
      const leftHard = leftLesson && leftCard ? Number(isCardHard(leftCard, leftLesson)) : 0;
      const rightHard = rightLesson && rightCard ? Number(isCardHard(rightCard, rightLesson)) : 0;
      if (rightHard !== leftHard) return rightHard - leftHard;
      return left.cardId.localeCompare(right.cardId);
    })
    .map((record) => cardById.get(record.cardId)!);

  return shuffle(due);
};
