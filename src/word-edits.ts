import type { ExposureCard } from "./types";

const WORD_EDITS_STORAGE_KEY = "thabit.wordEdits.v1";

export type WordEdit = {
  english?: string;
  arabic?: string;
};

let revision = 0;

const readEdits = (): Record<string, WordEdit> => {
  try {
    const stored = window.localStorage.getItem(WORD_EDITS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, WordEdit>) : {};
  } catch {
    return {};
  }
};

const writeEdits = (edits: Record<string, WordEdit>) => {
  window.localStorage.setItem(WORD_EDITS_STORAGE_KEY, JSON.stringify(edits));
  revision += 1;
};

export const getWordEditRevision = () => revision;

export const getWordEdit = (cardId: string) => readEdits()[cardId];

/** Persist only fields that differ from the lesson source values. */
export const saveWordEdit = (
  cardId: string,
  next: { english: string; arabic: string },
  original: { english: string; arabic: string },
) => {
  const english = next.english.trim();
  const arabic = next.arabic.trim();
  const originalEnglish = original.english.trim();
  const originalArabic = original.arabic.trim();
  const edits = readEdits();

  const edit: WordEdit = {
    ...(english && english !== originalEnglish ? { english } : {}),
    ...(arabic && arabic !== originalArabic ? { arabic } : {}),
  };

  if (!edit.english && !edit.arabic) {
    delete edits[cardId];
  } else {
    edits[cardId] = edit;
  }

  writeEdits(edits);
};

export const clearWordEdit = (cardId: string) => {
  const edits = readEdits();
  if (!edits[cardId]) return;
  delete edits[cardId];
  writeEdits(edits);
};

export const applyWordEditFields = <T extends { arabic: string; english: string; imageUrl?: string }>(
  cardId: string,
  fields: T,
): T => {
  const edit = getWordEdit(cardId);
  if (!edit) return fields;

  return {
    ...fields,
    ...(edit.english ? { english: edit.english } : {}),
    ...(edit.arabic ? { arabic: edit.arabic, imageUrl: undefined } : {}),
  };
};

export const applyWordEdit = (card: ExposureCard): ExposureCard => {
  const edit = getWordEdit(card.id);
  if (!edit) return card;

  return {
    ...card,
    ...(edit.english
      ? {
          english: edit.english,
          englishStem: undefined,
          englishTags: undefined,
          englishVariant: undefined,
          englishVariantTotal: undefined,
        }
      : {}),
    ...(edit.arabic ? { arabic: edit.arabic, imageUrl: undefined } : {}),
  };
};
