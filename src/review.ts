import {
  getCachedLessonExposureCards,
  getNounFamilyIdFromCardId,
  getNounFamilyReviewRepresentative,
  getVerbFamilyIdFromCardId,
  getVerbFamilyReviewRepresentative,
  prepareNounBatchReviewTestCards,
  prepareVerbBatchReviewTestCards,
} from "./exposure-cards";
import { isLessonComplete, isLessonFinalComplete, isSectionReadyForFinal } from "./progress";
import { lessons } from "./data";
import { NOUN_REVIEW_INSERT, PHRASE_REVIEW_ID_REMAP, VERB_REVIEW_INSERT_AT } from "./review-id-remap";
import { getSettings } from "./settings";
import { shuffle } from "./shuffle";
import { addDays, daysBetween, todayKey } from "./today";
import type { Lesson, SectionKind } from "./types";

export const REVIEW_STORAGE_KEY = "thabit.reviewCards";
const STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY = "thabit.migration.staggeredReviewSchedule_v1";
const GLOBAL_NEW_CARD_STAGGER_MIGRATION_KEY = "thabit.migration.globalNewCardStagger_v2";
const VERB_FAMILY_REVIEW_MIGRATION_KEY = "thabit.migration.verbFamilyReview_v1";
const NOUN_FAMILY_REVIEW_MIGRATION_KEY = "thabit.migration.nounFamilyReview_v1";
const MAX_INTERVAL_10_SPREAD_MIGRATION_KEY = "thabit.migration.maxInterval10Spread_v1";
const MAX_INTERVAL_7_SPREAD_MIGRATION_KEY = "thabit.migration.maxInterval7Spread_v1";
const REVIEW_CONTENT_ID_MIGRATION_KEY = "thabit.migration.reviewContentIds_v1";
const NOUN_REVIEW_INSERT_MIGRATION_KEY = "thabit.migration.reviewNounInsert_v1";
const MISS_STACK_SPREAD_MIGRATION_KEY = "thabit.migration.missStackSpread_v1";
/** Default used by one-time interval-cap migrations. Live caps read `getSettings()`. */
export const MAX_INTERVAL_DAYS = 7;
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

const maxIntervalDays = () => getSettings().reviewMaxIntervalDays;
const newCardStaggerDays = () => getSettings().reviewNewCardStaggerDays;
const scheduleJitterDays = () => getSettings().reviewScheduleJitterDays;
const missSpreadDaysSetting = () => getSettings().reviewMissSpreadDays;

const capInterval = (days: number) => Math.min(maxIntervalDays(), Math.max(1, Math.round(days)));

/** Evenly spread `total` cards across days 0 … reviewNewCardStaggerDays - 1. */
export const staggerNewCardOffsetDays = (index: number, total: number) => {
  const staggerDays = newCardStaggerDays();
  if (total <= 1 || staggerDays <= 1) return 0;
  return Math.floor((index * (staggerDays - 1)) / (total - 1));
};

const stableScheduleJitterDays = (cardId: string) => {
  const jitterDays = scheduleJitterDays();
  if (jitterDays <= 0) return 0;
  let hash = 0;
  for (let index = 0; index < cardId.length; index += 1) {
    hash = (hash * 31 + cardId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % (jitterDays + 1);
};

const spreadNewCardRecordsOverWindow = (records: ReviewCardRecord[], today: string) => {
  if (records.length <= 1) return false;

  shuffle(records).forEach((record, index) => {
    record.dueAt = addDays(today, staggerNewCardOffsetDays(index, records.length));
  });
  return true;
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

/** One-time reset so existing users pick up staggered seeding and the (then) 30-day max interval. */
export const applyStaggeredReviewScheduleMigration = () => {
  if (window.localStorage.getItem(STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY)) return;

  window.localStorage.removeItem(REVIEW_STORAGE_KEY);
  window.localStorage.setItem(STAGGERED_REVIEW_SCHEDULE_MIGRATION_KEY, "1");
};

/** Spread records evenly across days 0 … windowDays - 1. */
const spreadRecordsAcrossDays = (records: ReviewCardRecord[], today: string, windowDays: number) => {
  if (records.length === 0 || windowDays <= 0) return false;
  if (records.length === 1) {
    records[0]!.dueAt = today;
    return true;
  }
  shuffle(records).forEach((record, index) => {
    const offset = Math.floor((index * (windowDays - 1)) / (records.length - 1));
    record.dueAt = addDays(today, offset);
  });
  return true;
};

/**
 * Cap stored intervals at REVIEW_MAX_INTERVAL_DAYS. For each completed lesson, cards due farther
 * out than that window are pulled in and evenly spread across the next N days; nearer due dates stay.
 */
const applyMaxIntervalSpreadMigration = (
  migrationKey: string,
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => {
  if (window.localStorage.getItem(migrationKey)) return;

  const today = todayKey();
  const horizon = addDays(today, MAX_INTERVAL_DAYS);
  const cards = readReviewCards();
  let changed = false;

  const byLesson = new Map<string, ReviewCardRecord[]>();

  for (const lesson of allLessons) {
    if (!isLessonReviewEligible(lesson, completedStepIds)) continue;

    const eligibleIds = new Set(
      getEligibleLessonCards(lesson, completedStepIds, getCardsForLesson).map((card) => card.id),
    );
    const farOut: ReviewCardRecord[] = [];

    for (const cardId of eligibleIds) {
      const record = cards[cardId];
      if (!record) continue;

      if (record.intervalDays > MAX_INTERVAL_DAYS) {
        record.intervalDays = MAX_INTERVAL_DAYS;
        changed = true;
      }

      if (record.dueAt > horizon) {
        farOut.push(record);
      }
    }

    if (farOut.length > 0) byLesson.set(lesson.id, farOut);
  }

  for (const record of Object.values(cards)) {
    if (record.intervalDays > MAX_INTERVAL_DAYS) {
      record.intervalDays = MAX_INTERVAL_DAYS;
      changed = true;
    }
  }

  for (const records of byLesson.values()) {
    if (spreadRecordsAcrossDays(records, today, MAX_INTERVAL_DAYS)) {
      changed = true;
    }
  }

  if (changed) writeReviewCards(cards);
  window.localStorage.setItem(migrationKey, "1");
};

/** Cap at 7 days; per completed lesson, reschedule only cards due more than 7 days out. */
export const applyMaxInterval7SpreadMigration = (
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => {
  // Mark the prior 10-day migration satisfied so older clients don't re-run it later.
  if (!window.localStorage.getItem(MAX_INTERVAL_10_SPREAD_MIGRATION_KEY)) {
    window.localStorage.setItem(MAX_INTERVAL_10_SPREAD_MIGRATION_KEY, "1");
  }
  applyMaxIntervalSpreadMigration(
    MAX_INTERVAL_7_SPREAD_MIGRATION_KEY,
    allLessons,
    completedStepIds,
    getCardsForLesson,
  );
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

const moveReviewRecord = (
  cards: Record<string, ReviewCardRecord>,
  fromId: string,
  toId: string,
  lessonId: string,
) => {
  const record = cards[fromId];
  if (!record || fromId === toId) return false;

  cards[toId] = cards[toId]
    ? mergeFamilyReviewRecords([cards[toId], { ...record, cardId: toId }], toId, lessonId)
    : { ...record, cardId: toId };
  delete cards[fromId];
  return true;
};

const parseIndexedReviewId = (lessonId: string, kind: "verb" | "noun", cardId: string) => {
  const prefix = `${lessonId}-${kind}-`;
  if (!cardId.startsWith(prefix)) return null;
  const match = cardId.slice(prefix.length).match(/^(\d+)(.*)$/);
  if (!match) return null;
  return { num: Number(match[1]), suffix: match[2] ?? "" };
};

/**
 * Phrase example rows were removed and two verb rows were restored, so stored
 * review IDs (row indexes) no longer point at the same words. Replay schedules
 * onto the current IDs and drop leftover example records.
 */
export const applyReviewContentIdMigration = (allLessons: Lesson[]) => {
  if (window.localStorage.getItem(REVIEW_CONTENT_ID_MIGRATION_KEY)) return;

  const cards = readReviewCards();
  let changed = false;

  for (const [lessonId, spec] of Object.entries(PHRASE_REVIEW_ID_REMAP)) {
    for (const oldNum of spec.drop) {
      const id = `${lessonId}-phrase-${oldNum}`;
      if (!cards[id]) continue;
      delete cards[id];
      changed = true;
    }

    const moves = Object.entries(spec.keep)
      .map(([oldNum, newNum]) => [Number(oldNum), newNum] as const)
      .filter(([oldNum, newNum]) => oldNum !== newNum)
      .sort((left, right) => left[0] - right[0]);

    for (const [oldNum, newNum] of moves) {
      if (moveReviewRecord(cards, `${lessonId}-phrase-${oldNum}`, `${lessonId}-phrase-${newNum}`, lessonId)) {
        changed = true;
      }
    }
  }

  const lessonById = new Map(allLessons.map((lesson) => [lesson.id, lesson]));
  for (const [lessonId, insertAt] of Object.entries(VERB_REVIEW_INSERT_AT)) {
    const currentCount = lessonById.get(lessonId)?.verbs.length ?? 0;
    if (shiftIndexedReviewRecords(cards, lessonId, "verb", insertAt, 1, currentCount)) {
      changed = true;
    }
  }

  if (changed) writeReviewCards(cards);
  window.localStorage.setItem(REVIEW_CONTENT_ID_MIGRATION_KEY, "1");
};

const shiftIndexedReviewRecords = (
  cards: Record<string, ReviewCardRecord>,
  lessonId: string,
  kind: "verb" | "noun",
  insertAt: number,
  insertCount: number,
  currentCount: number,
) => {
  if (insertCount <= 0 || currentCount < insertAt) return false;

  const prefix = `${lessonId}-${kind}-`;
  let changed = false;
  for (let num = currentCount - insertCount; num >= insertAt; num -= 1) {
    const sources = Object.keys(cards).filter((cardId) => parseIndexedReviewId(lessonId, kind, cardId)?.num === num);
    for (const fromId of sources) {
      const parsed = parseIndexedReviewId(lessonId, kind, fromId);
      if (!parsed) continue;
      if (moveReviewRecord(cards, fromId, `${prefix}${num + insertCount}${parsed.suffix}`, lessonId)) {
        changed = true;
      }
    }
  }
  return changed;
};

/** Shift stored noun review IDs after new rows were inserted into a lesson CSV. */
export const applyNounReviewInsertMigration = (allLessons: Lesson[]) => {
  if (window.localStorage.getItem(NOUN_REVIEW_INSERT_MIGRATION_KEY)) return;

  const cards = readReviewCards();
  const lessonById = new Map(allLessons.map((lesson) => [lesson.id, lesson]));
  let changed = false;

  for (const [lessonId, spec] of Object.entries(NOUN_REVIEW_INSERT)) {
    const currentCount = lessonById.get(lessonId)?.nouns.length ?? 0;
    if (shiftIndexedReviewRecords(cards, lessonId, "noun", spec.at, spec.count, currentCount)) {
      changed = true;
    }
  }

  if (changed) writeReviewCards(cards);
  window.localStorage.setItem(NOUN_REVIEW_INSERT_MIGRATION_KEY, "1");
};

/** Unpile missed cards that were all left due today/on the same day. */
export const applyMissStackSpreadMigration = (
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => {
  if (window.localStorage.getItem(MISS_STACK_SPREAD_MIGRATION_KEY)) return;

  const today = todayKey();
  const { cardById } = buildEligibleCardIndex(allLessons, completedStepIds, getCardsForLesson);
  const cards = readReviewCards();
  const piles = new Map<string, ReviewCardRecord[]>();

  for (const record of Object.values(cards)) {
    if (record.state !== "relearning" || !cardById.has(record.cardId)) continue;
    const pileKey = record.dueAt <= today ? today : record.dueAt;
    const pile = piles.get(pileKey) ?? [];
    pile.push(record);
    piles.set(pileKey, pile);
  }

  let changed = false;
  for (const [origin, records] of piles) {
    if (records.length <= 1) continue;
    const startFromTomorrow = origin <= today;
    shuffle(records).forEach((record, index) => {
      const spreadDays = Math.max(1, missSpreadDaysSetting());
      const offset = startFromTomorrow ? 1 + (index % spreadDays) : index % spreadDays;
      record.dueAt = addDays(origin <= today ? today : origin, offset);
    });
    changed = true;
  }

  if (changed) writeReviewCards(cards);
  window.localStorage.setItem(MISS_STACK_SPREAD_MIGRATION_KEY, "1");
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

/**
 * If any eligible cards are overdue, slide the whole eligible calendar forward so the oldest
 * overdue day becomes today. Missed days are skipped instead of piling onto today.
 * Clears an in-progress daily review session so a stacked queue is not restored.
 */
export const shiftOverdueReviewCalendar = (
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
) => {
  const today = todayKey();
  const { cardById } = buildEligibleCardIndex(allLessons, completedStepIds, getCardsForLesson);
  const cards = readReviewCards();
  const eligible = Object.values(cards).filter((record) => cardById.has(record.cardId));
  const overdue = eligible.filter((record) => record.dueAt < today);
  if (overdue.length === 0) return false;

  let minDue = overdue[0]!.dueAt;
  for (const record of overdue) {
    if (record.dueAt < minDue) minDue = record.dueAt;
  }
  const gap = daysBetween(minDue, today);
  if (gap <= 0) return false;

  for (const record of eligible) {
    record.dueAt = addDays(record.dueAt, gap);
  }
  writeReviewCards(cards);
  // Avoid importing daily-review-session (it imports this module).
  window.localStorage.removeItem("thabit.dailyReviewSession");
  return true;
};

export const syncReviewPool = (allLessons: Lesson[], completedStepIds: string[], getCardsForLesson: (lesson: Lesson) => ReviewableCard[]) => {
  applyVerbFamilyReviewMigration(allLessons);
  applyNounFamilyReviewMigration(allLessons);
  applyReviewContentIdMigration(allLessons);
  applyNounReviewInsertMigration(allLessons);
  applyMissStackSpreadMigration(allLessons, completedStepIds, getCardsForLesson);

  const today = todayKey();
  const cards = readReviewCards();
  const missing: { card: ReviewableCard; lesson: Lesson }[] = [];

  for (const lesson of allLessons) {
    for (const card of getEligibleLessonCards(lesson, completedStepIds, getCardsForLesson)) {
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

const pickMissDueAt = (cards: Record<string, ReviewCardRecord>, today: string, cardId: string) => {
  const spreadDays = Math.max(1, missSpreadDaysSetting());
  let bestOffset = 1;
  let bestCount = Infinity;

  for (let offset = 1; offset <= spreadDays; offset += 1) {
    const dueAt = addDays(today, offset);
    const count = Object.values(cards).filter((record) => record.cardId !== cardId && record.dueAt === dueAt).length;
    if (count < bestCount) {
      bestCount = count;
      bestOffset = offset;
    }
  }

  return addDays(today, bestOffset);
};

const scheduleMiss = (record: ReviewCardRecord, today: string, cards: Record<string, ReviewCardRecord>): ReviewCardRecord => {
  const dueAt = pickMissDueAt(cards, today, record.cardId);
  return {
    ...record,
    state: "relearning",
    learningStep: 0,
    intervalDays: 1,
    ease: Math.max(record.ease - 0.2, 1.3),
    lapses: record.lapses + 1,
    dueAt,
    lastReviewedAt: today,
  };
};

export const gradeReviewCard = (cardId: string, knewIt: boolean) => {
  const cards = readReviewCards();
  const record = cards[cardId];
  if (!record) return;

  const today = todayKey();
  cards[cardId] = knewIt
    ? record.state === "review"
      ? scheduleReviewSuccess(record, today)
      : scheduleLearningSuccess(record, today)
    : scheduleMiss(record, today, cards);
  writeReviewCards(cards);
};

export const recordMemorizationMiss = (card: ReviewableCard, lesson: Lesson, completedStepIds: string[]) => {
  const reviewCard = resolveReviewableCard(card, lesson);
  if (!isReviewCardEligible({ ...reviewCard, lessonId: lesson.id }, completedStepIds)) return;
  const today = todayKey();
  const cards = readReviewCards();
  const existing = cards[reviewCard.id] ?? seedReviewCard({ ...reviewCard, lessonId: lesson.id }, lesson, today);
  cards[reviewCard.id] = scheduleMiss(existing, today, cards);
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

export type EligibleReviewRecord = {
  record: ReviewCardRecord;
  card: ReviewableCard;
  lesson: Lesson;
};

export const listEligibleReviewRecords = (
  allLessons: Lesson[],
  completedStepIds: string[],
  getCardsForLesson: (lesson: Lesson) => ReviewableCard[],
): EligibleReviewRecord[] => {
  syncReviewPool(allLessons, completedStepIds, getCardsForLesson);

  const { lessonById, cardById } = buildEligibleCardIndex(allLessons, completedStepIds, getCardsForLesson);
  return Object.values(readReviewCards())
    .flatMap((record) => {
      const card = cardById.get(record.cardId);
      const lesson = lessonById.get(record.lessonId);
      if (!card || !lesson) return [];
      return [{ record, card, lesson }];
    })
    .sort((left, right) => {
      if (left.record.dueAt !== right.record.dueAt) return left.record.dueAt.localeCompare(right.record.dueAt);
      return left.card.id.localeCompare(right.card.id);
    });
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
