export type LessonLevel = {
  id: string;
  label: string;
  startLesson: number;
  endLesson?: number;
};

/** CEFR-style bands for the lesson roadmap. */
export const LESSON_LEVELS: LessonLevel[] = [
  { id: "A1", label: "Beginner", startLesson: 1, endLesson: 10 },
  { id: "A2", label: "Elementary", startLesson: 11, endLesson: 28 },
  { id: "B1", label: "Intermediate low", startLesson: 29, endLesson: 49 },
  { id: "B2", label: "Intermediate high", startLesson: 50 },
];

export const getLessonLevel = (lessonNumber: number) =>
  LESSON_LEVELS.find(
    (level) => lessonNumber >= level.startLesson && (level.endLesson === undefined || lessonNumber <= level.endLesson),
  );

/** Lesson numbers treated as fully complete before any saved progress (e.g. lessons 1–4 for review). */
export const PREREQUISITE_COMPLETE_LESSON_NUMBERS = [1, 2, 3, 4];

/** Lessons whose review cards are credited as reviewed today (not due on first sync). */
export const PREREQUISITE_REVIEWED_LESSON_NUMBERS = [1, 2];

export const NOUN_BATCH_SIZE = 5;
export const PHRASE_BATCH_SIZE = 5;
export const VERB_BATCH_SIZE = 1;
export const MIN_NON_VERB_BATCH_SIZE = 3;

export const EXPOSURE_SAY_REPS_ARABIC = 5;
export const EXPOSURE_SAY_REPS_ENGLISH = 5;
export const EXPOSURE_WRITES = 5;
export const MC_SECONDS = 3;
export const MATCH_SECONDS_PER_PAIR = 1;
/** Batches with at least this many cards require two clean memory-match runs. */
export const MEMORY_MATCH_TWO_RUN_MIN_CARDS = 5;

export const getMemoryMatchCleanRunsRequired = (cardCount: number) =>
  cardCount >= MEMORY_MATCH_TWO_RUN_MIN_CARDS ? 2 : 1;

/** Longest gap between successful reviews before a card is due again. */
export const REVIEW_MAX_INTERVAL_DAYS = 30;

/** Spread new lesson cards across this many days so daily review stays even. */
export const REVIEW_NEW_CARD_STAGGER_DAYS = 30;
