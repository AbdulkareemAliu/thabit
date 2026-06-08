import type { CueSide } from "./study-queue";

const storageKey = (lessonId: string) => `thabit.lessonMissedCues.${lessonId}`;

export type LessonMissedCues = Record<string, Partial<Record<CueSide, true>>>;

const readMissedCues = (lessonId: string): LessonMissedCues => {
  try {
    const stored = window.localStorage.getItem(storageKey(lessonId));
    return stored ? (JSON.parse(stored) as LessonMissedCues) : {};
  } catch {
    return {};
  }
};

const writeMissedCues = (lessonId: string, missed: LessonMissedCues) => {
  window.localStorage.setItem(storageKey(lessonId), JSON.stringify(missed));
};

export const recordLessonMiss = (lessonId: string, cardId: string, cueSide: CueSide) => {
  const missed = readMissedCues(lessonId);
  const record = missed[cardId] ?? {};
  if (record[cueSide]) return;
  missed[cardId] = { ...record, [cueSide]: true };
  writeMissedCues(lessonId, missed);
};

export const getLessonMissedCuePasses = (lessonId: string, cardId: string, cueSide: CueSide, defaultPasses = 1) => {
  const missed = readMissedCues(lessonId);
  return missed[cardId]?.[cueSide] ? 2 : defaultPasses;
};

export const clearLessonMisses = (lessonId: string) => {
  window.localStorage.removeItem(storageKey(lessonId));
};
