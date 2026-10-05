import type { NounItem, PhraseItem, SectionKind } from "./types";

export type LessonExtraSection = Extract<SectionKind, "nouns" | "phrases">;

export type LessonExtraWord = {
  id: string;
  section: LessonExtraSection;
  arabic: string;
  english: string;
};

const LESSON_EXTRAS_STORAGE_KEY = "thabit.lessonExtras.v1";

let revision = 0;

type LessonExtrasStore = Record<string, LessonExtraWord[]>;

const readStore = (): LessonExtrasStore => {
  try {
    const stored = window.localStorage.getItem(LESSON_EXTRAS_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as LessonExtrasStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store: LessonExtrasStore) => {
  window.localStorage.setItem(LESSON_EXTRAS_STORAGE_KEY, JSON.stringify(store));
  revision += 1;
};

export const getLessonExtrasRevision = () => revision;

export const listLessonExtras = (lessonId: string): LessonExtraWord[] => readStore()[lessonId] ?? [];

export const listLessonExtrasForSection = (lessonId: string, section: LessonExtraSection) =>
  listLessonExtras(lessonId).filter((word) => word.section === section);

export const isLessonExtraId = (id: string) => id.includes("-extra-");

const makeId = (lessonId: string, section: LessonExtraSection) => {
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${lessonId}-extra-${section}-${token}`;
};

export const addLessonExtra = (
  lessonId: string,
  input: { section: LessonExtraSection; arabic: string; english: string },
) => {
  const arabic = input.arabic.trim();
  const english = input.english.trim();
  if (!arabic || !english) return null;

  const store = readStore();
  const words = store[lessonId] ?? [];
  const word: LessonExtraWord = {
    id: makeId(lessonId, input.section),
    section: input.section,
    arabic,
    english,
  };
  store[lessonId] = [word, ...words];
  writeStore(store);
  return word;
};

export const updateLessonExtra = (lessonId: string, id: string, next: { arabic: string; english: string }) => {
  const arabic = next.arabic.trim();
  const english = next.english.trim();
  if (!arabic || !english) return false;

  const store = readStore();
  const words = store[lessonId] ?? [];
  const index = words.findIndex((word) => word.id === id);
  if (index < 0) return false;

  words[index] = { ...words[index]!, arabic, english };
  store[lessonId] = words;
  writeStore(store);
  return true;
};

export const removeLessonExtra = (lessonId: string, id: string) => {
  const store = readStore();
  const words = store[lessonId] ?? [];
  const next = words.filter((word) => word.id !== id);
  if (next.length === words.length) return false;
  if (next.length === 0) delete store[lessonId];
  else store[lessonId] = next;
  writeStore(store);
  return true;
};

export const lessonExtrasAsNounItems = (lessonId: string): NounItem[] =>
  listLessonExtrasForSection(lessonId, "nouns").map((word) => ({
    id: word.id,
    arabic: word.arabic,
    english: word.english,
    stem: word.english,
    tags: [],
  }));

export const lessonExtrasAsPhraseItems = (lessonId: string): PhraseItem[] =>
  listLessonExtrasForSection(lessonId, "phrases").map((word) => ({
    id: word.id,
    arabic: word.arabic,
    english: word.english,
  }));
