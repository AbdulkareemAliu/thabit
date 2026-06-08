import { PREREQUISITE_REVIEWED_LESSON_NUMBERS, REVIEW_MAX_INTERVAL_DAYS, REVIEW_NEW_CARD_STAGGER_DAYS } from "./config";
import { isLessonComplete } from "./progress";
import { shuffle } from "./shuffle";
import { addDays, todayKey } from "./today";
import type { Lesson, SectionKind, VerbFormKey } from "./types";

export const REVIEW_STORAGE_KEY = "thabit.reviewCards";
const PREREQUISITE_REVIEW_CREDIT_MIGRATION_KEY = "thabit.migration.creditReviewL1L2_v1";
const STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY = "thabit.migration.staggeredReviewSchedule_v1";
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

const labelToVerbForm: Record<string, VerbFormKey> = {
  Past: "past",
  Present: "present",
  Command: "command",
  Masdar: "masdar",
  Passive: "passive",
  "Ism Fa'il": "activeParticiple",
  "Active Participle": "activeParticiple",
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

const staggerOffsetDays = (index: number, total: number) => {
  if (total <= 1 || REVIEW_NEW_CARD_STAGGER_DAYS <= 1) return 0;
  return Math.floor((index * (REVIEW_NEW_CARD_STAGGER_DAYS - 1)) / (total - 1));
};

export const isLessonReviewEligible = (lesson: Lesson, completedStepIds: string[]) => isLessonComplete(lesson, completedStepIds);

const isCardHard = (card: ReviewableCard, lesson: Lesson) => {
  if (card.section === "nouns") return lesson.nouns.some((item) => item.id === card.id && item.hard);
  if (card.section === "phrases") return lesson.phrases.some((item) => item.id === card.id && item.hard);
  const verb = lesson.verbs.find((item) => card.id.startsWith(`${item.id}-`));
  if (!verb || !card.label) return false;
  const form = labelToVerbForm[card.label];
  return form ? Boolean(verb.hardForms?.[form]) : false;
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

const isPrerequisiteReviewedLesson = (lesson: Lesson) => PREREQUISITE_REVIEWED_LESSON_NUMBERS.includes(lesson.number);

const creditReviewedToday = (record: ReviewCardRecord, today: string, startOffsetDays = 0): ReviewCardRecord => {
  const intervalDays = record.intervalDays > 0 ? capInterval(record.intervalDays) : 7;
  return {
    ...record,
    state: "review",
    learningStep: 0,
    intervalDays,
    dueAt: addDays(today, intervalDays + startOffsetDays),
    lastReviewedAt: today,
  };
};

const creditPrerequisiteLessonCards = (allLessons: Lesson[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[], today: string, cards: Record<string, ReviewCardRecord>) => {
  let changed = false;

  for (const lesson of allLessons) {
    if (!isPrerequisiteReviewedLesson(lesson)) continue;

    const lessonCards = getCardsForLesson(lesson);
    lessonCards.forEach((card, index) => {
      const existing = cards[card.id];
      const startOffsetDays = staggerOffsetDays(index, lessonCards.length);
      const record = existing ?? seedReviewCard({ ...card, lessonId: lesson.id }, lesson, today, startOffsetDays);
      const credited = creditReviewedToday(record, today, startOffsetDays);
      if (!existing || existing.dueAt !== credited.dueAt || existing.lastReviewedAt !== credited.lastReviewedAt || existing.state !== credited.state) {
        cards[card.id] = credited;
        changed = true;
      }
    });
  }

  return changed;
};

/** One-time reset so existing users pick up staggered seeding and the 30-day max interval. */
export const applyStaggeredReviewScheduleMigration = () => {
  if (window.localStorage.getItem(STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY)) return;

  window.localStorage.removeItem(REVIEW_STORAGE_KEY);
  window.localStorage.setItem(STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY, "1");
};

export const applyPrerequisiteReviewCreditMigration = (allLessons: Lesson[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  if (window.localStorage.getItem(PREREQUISITE_REVIEW_CREDIT_MIGRATION_KEY)) return;

  const today = todayKey();
  const cards = readReviewCards();
  const changed = creditPrerequisiteLessonCards(allLessons, getCardsForLesson, today, cards);

  window.localStorage.setItem(PREREQUISITE_REVIEW_CREDIT_MIGRATION_KEY, "1");
  if (changed) writeReviewCards(cards);
};

export const syncReviewPool = (allLessons: Lesson[], completedStepIds: string[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  const today = todayKey();
  const cards = readReviewCards();
  let changed = false;

  for (const lesson of allLessons) {
    if (!isLessonReviewEligible(lesson, completedStepIds)) continue;

    const lessonCards = getCardsForLesson(lesson);
    const missingCards = lessonCards.filter((card) => !cards[card.id]);
    missingCards.forEach((card, index) => {
      const startOffsetDays = staggerOffsetDays(index, missingCards.length);
      const seeded = seedReviewCard({ ...card, lessonId: lesson.id }, lesson, today, startOffsetDays);
      cards[card.id] = isPrerequisiteReviewedLesson(lesson) ? creditReviewedToday(seeded, today, startOffsetDays) : seeded;
      changed = true;
    });
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
      dueAt: addDays(today, intervalDays),
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
    dueAt: addDays(today, intervalDays),
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
    dueAt: addDays(today, nextInterval),
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
  if (!isLessonReviewEligible(lesson, completedStepIds)) return;

  const today = todayKey();
  const cards = readReviewCards();
  const existing = cards[card.id] ?? seedReviewCard({ ...card, lessonId: lesson.id }, lesson, today);
  cards[card.id] = scheduleMiss(existing, today);
  writeReviewCards(cards);
};

const buildEligibleCardIndex = (allLessons: Lesson[], completedStepIds: string[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  const lessonById = new Map(allLessons.map((lesson) => [lesson.id, lesson]));
  const cardById = new Map<string, ReviewableCard>();

  for (const lesson of allLessons) {
    if (!isLessonReviewEligible(lesson, completedStepIds)) continue;
    for (const card of getCardsForLesson(lesson)) {
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
