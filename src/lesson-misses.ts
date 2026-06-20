import type { ExposureCard } from "./types";
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

export const recordLessonFamilyMiss = (lessonId: string, card: ExposureCard, cueSide: CueSide, familyForms?: ExposureCard[]) => {
  if (familyForms?.length) {
    familyForms.forEach((form) => recordLessonMiss(lessonId, form.id, cueSide));
    return;
  }
  recordLessonMiss(lessonId, card.id, cueSide);
};

export const getLessonMissedCuePasses = (lessonId: string, cardId: string, cueSide: CueSide, defaultPasses = 1) => {
  const missed = readMissedCues(lessonId);
  return missed[cardId]?.[cueSide] ? 2 : defaultPasses;
};

export const getLessonMissedFamilyCuePasses = (
  lessonId: string,
  card: ExposureCard,
  cueSide: CueSide,
  familyForms?: ExposureCard[],
  defaultPasses = 1,
) => {
  if (familyForms?.length) {
    const missed = readMissedCues(lessonId);
    return familyForms.some((form) => missed[form.id]?.[cueSide]) ? 2 : defaultPasses;
  }
  return getLessonMissedCuePasses(lessonId, card.id, cueSide, defaultPasses);
};

export const clearLessonMisses = (lessonId: string) => {
  window.localStorage.removeItem(storageKey(lessonId));
};
