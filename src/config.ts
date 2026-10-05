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

export const getLessonLevel = (lessonNumber: number) => LESSON_LEVELS.find((level) => lessonNumber >= level.startLesson && (level.endLesson === undefined || lessonNumber <= level.endLesson));

export const MIN_BATCH_SIZE = 3;
export const MAX_BATCH_SIZE = 5;
export const VERB_BATCH_SIZE = MAX_BATCH_SIZE;
/** Noun batches count family units (singular/plural pairs = 1). */
export const NOUN_BATCH_SIZE = MAX_BATCH_SIZE;
export const PHRASE_BATCH_SIZE = MAX_BATCH_SIZE;
export const MIN_NON_VERB_BATCH_SIZE = MIN_BATCH_SIZE;

export const EXPOSURE_SAY_REPS_ARABIC = 50;
export const EXPOSURE_SAY_REPS_ENGLISH = 50;
export const EXPOSURE_WRITES = 5;
/** Write reps through a verb/noun family during exposure. */
export const VERB_EXPOSURE_WRITES = 5;
/** Say reps after marking a test item incorrect (section test, lesson test). */
export const TEST_MISS_SAY_REPS_ARABIC = 15;
export const TEST_MISS_SAY_REPS_ENGLISH = 15;
/** Full family passes after marking a word incorrect on a batch or section test. */
export const TEST_MISS_VERB_FAMILY_SAY_ROUNDS = 15;
/** Daily-review redemption say loop after a miss. */
export const REVIEW_MISS_SAY_REPS = 5;
export const REVIEW_MISS_FAMILY_SAY_ROUNDS = 5;
/** Full passes through every form in a verb/noun family during exposure say phase. */
export const VERB_EXPOSURE_SAY_ROUNDS = 25;
export const MC_SECONDS = 5;
export const MATCH_SECONDS_PER_PAIR = 2;
/** Consecutive clean memory-match boards required before continuing. */
export const MEMORY_MATCH_CLEAN_RUNS = 2;

/** Longest gap between successful reviews before a card is due again. */
export const REVIEW_MAX_INTERVAL_DAYS = 7;

/** Spread never-reviewed cards across this many days (introduction + backlog recovery). */
export const REVIEW_NEW_CARD_STAGGER_DAYS = 7;

/** Extra days added to review due dates so cards reviewed the same day drift apart over time. */
export const REVIEW_SCHEDULE_JITTER_DAYS = 2;

/** Missed cards are due across this many upcoming days instead of all landing tomorrow. */
export const REVIEW_MISS_SPREAD_DAYS = 3;
