import { parseEnglishStemAndTags } from "./batching";
import {
  getLessonVerbRecognitionCards,
  getVerbEnglishRecognitionLabel,
  getVerbFamilyIdFromCardId,
  groupExposureCardsIntoVerbFamilies,
  prepareVerbBatchRecognition,
} from "./exposure-cards";
import { shuffle } from "./shuffle";
import type { ExposureCard } from "./types";

export const STUDY_PASSES_REQUIRED = 2;

export type CueSide = "arabic" | "english";

export type StudyPrompt = {
  card: ExposureCard;
  cueSide: CueSide;
  passesRemaining: number;
  passesRequired: number;
  verbFamilyForms?: ExposureCard[];
};

const getCueSidesInSet = (prompts: StudyPrompt[]) => new Set(prompts.map((prompt) => prompt.cueSide));

const promptsConflictInSet = (left: StudyPrompt, right: StudyPrompt, prompts: StudyPrompt[]) => {
  if (left.card.id === right.card.id) return true;
  if (left.cueSide === right.cueSide && getCueSidesInSet(prompts).size > 1) return true;
  return false;
};

const hasAdjacentConflicts = (queue: StudyPrompt[], prompts: StudyPrompt[]) =>
  queue.some((prompt, index) => {
    const next = queue[index + 1];
    return next ? promptsConflictInSet(prompt, next, prompts) : false;
  });

const buildSpacedStudyQueueBacktracking = (prompts: StudyPrompt[]): StudyPrompt[] | null => {
  const ordered = [...prompts];

  const search = (index: number, result: StudyPrompt[]): StudyPrompt[] | null => {
    if (index === ordered.length) return result;

    const candidates = shuffle([...ordered.keys()].slice(index));
    for (const pick of candidates) {
      const candidate = ordered[pick]!;
      const last = result.at(-1);
      if (last && promptsConflictInSet(last, candidate, prompts)) continue;

      [ordered[index], ordered[pick]] = [ordered[pick]!, ordered[index]!];
      const solved = search(index + 1, [...result, ordered[index]!]);
      [ordered[index], ordered[pick]] = [ordered[pick]!, ordered[index]!];
      if (solved) return solved;
    }

    return null;
  };

  return search(0, []);
};

const buildSpacedStudyQueue = (prompts: StudyPrompt[]): StudyPrompt[] => {
  if (prompts.length <= 1) return prompts;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const solved = buildSpacedStudyQueueBacktracking(shuffle([...prompts]));
    if (solved) return solved;
  }

  return shuffle([...prompts]);
};

const reinsertWithSpacing = (queue: StudyPrompt[], prompt: StudyPrompt, previous?: StudyPrompt): StudyPrompt[] => {
  const context = previous ? [previous, ...queue, prompt] : [...queue, prompt];
  const conflicts = (left: StudyPrompt, right: StudyPrompt) => promptsConflictInSet(left, right, context);
  const validIndices: number[] = [];

  for (let index = 0; index <= queue.length; index += 1) {
    const before = index === 0 ? previous : queue[index - 1];
    const after = queue[index];
    if (before && conflicts(before, prompt)) continue;
    if (after && conflicts(after, prompt)) continue;
    validIndices.push(index);
  }

  if (validIndices.length > 0) {
    const insertIndex = validIndices[Math.floor(Math.random() * validIndices.length)]!;
    return [...queue.slice(0, insertIndex), prompt, ...queue.slice(insertIndex)];
  }

  const fallbackIndex = queue.findIndex((candidate) => !previous || !conflicts(previous, candidate));
  const insertIndex = fallbackIndex === -1 ? queue.length : fallbackIndex + 1;
  return [...queue.slice(0, insertIndex), prompt, ...queue.slice(insertIndex)];
};

const ensureNoLeadingConflict = (previous: StudyPrompt, queue: StudyPrompt[]): StudyPrompt[] => {
  const context = [previous, ...queue];
  const conflicts = (left: StudyPrompt, right: StudyPrompt) => promptsConflictInSet(left, right, context);
  if (queue.length === 0 || !conflicts(previous, queue[0]!)) return queue;

  for (let candidateIndex = 1; candidateIndex < queue.length; candidateIndex += 1) {
    const candidate = queue[candidateIndex]!;
    if (conflicts(previous, candidate)) continue;

    const rotated = [candidate, ...queue.slice(0, candidateIndex), ...queue.slice(candidateIndex + 1)];
    if (rotated.length <= 1 || !conflicts(rotated[0]!, rotated[1]!)) return rotated;
  }

  const [first, ...rest] = queue;
  const repaired = reinsertWithSpacing(rest, first, previous);
  if (repaired.length === 0 || !conflicts(previous, repaired[0]!)) return repaired;

  return queue;
};

export const getEnglishAnswer = (card: ExposureCard) => card.english;

export const getArabicAnswer = (card: ExposureCard) => card.arabic;

export const getCardEnglishStemKey = (card: ExposureCard) => parseEnglishStemAndTags(card.english).stem.toLowerCase();

export const getCardArabicStemKey = (card: ExposureCard) => {
  if (card.section === "verbs") {
    const match = card.id.match(/^(.*)-(past|present|command|masdar|passive|activeParticiple)$/);
    return match?.[1] ?? card.id;
  }
  return getCardEnglishStemKey(card);
};

export const multipleChoicePromptTotal = (cardCount: number, cueSides: CueSide[] = ["arabic", "english"]) =>
  cardCount * cueSides.length * STUDY_PASSES_REQUIRED;

export type WritingQueueConfig = {
  cueSides: CueSide[];
  passesForCue?: (card: ExposureCard, cueSide: CueSide) => number;
};

export const BATCH_TEST_MC_CUE_SIDES: CueSide[] = ["arabic", "english"];

export const BATCH_TEST_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 2,
};

export const BATCH_REVIEW_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 2,
};

export const SECTION_FINALE_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 1,
};

export const DAILY_REVIEW_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 1,
};

export const writingTestPromptTotal = (cards: ExposureCard[], config: WritingQueueConfig) =>
  cards.reduce(
    (total, card) =>
      total +
      config.cueSides.reduce((sideTotal, cueSide) => sideTotal + (config.passesForCue?.(card, cueSide) ?? 1), 0),
    0,
  );

export const buildWritingStudyQueue = (
  cards: ExposureCard[],
  config: WritingQueueConfig,
  shuffleCards = false,
  familyFormsByCardId?: Map<string, ExposureCard[]>,
): StudyPrompt[] => {
  const orderedCards = shuffleCards ? shuffle(cards) : cards;
  const prompts = orderedCards.flatMap((card) =>
    config.cueSides.map((cueSide): StudyPrompt => {
      const passesRequired = config.passesForCue?.(card, cueSide) ?? 1;
      const verbFamilyForms = familyFormsByCardId?.get(card.id);
      return { card, cueSide, passesRemaining: passesRequired, passesRequired, verbFamilyForms };
    }),
  );

  return buildSpacedStudyQueue(prompts);
};

export const buildBatchWritingStudyQueue = (cards: ExposureCard[]): StudyPrompt[] => {
  const basePrompts = cards.flatMap((card) =>
    BATCH_TEST_WRITING_CONFIG.cueSides.map((cueSide): StudyPrompt => {
      const passesRequired = BATCH_TEST_WRITING_CONFIG.passesForCue?.(card, cueSide) ?? 1;
      return { card, cueSide, passesRemaining: passesRequired, passesRequired };
    }),
  );

  return buildSpacedStudyQueue(basePrompts);
};

export const batchWritingTestPromptTotal = (cards: ExposureCard[]) =>
  writingTestPromptTotal(cards, BATCH_TEST_WRITING_CONFIG);

export const getBatchMultipleChoiceCards = (cards: ExposureCard[]) =>
  prepareVerbBatchRecognition(cards)?.cards ?? cards;

export const buildBatchMultipleChoiceStudyQueue = (cards: ExposureCard[], cueSides: CueSide[] = BATCH_TEST_MC_CUE_SIDES) =>
  buildMultipleChoiceStudyQueue(getBatchMultipleChoiceCards(cards), cueSides);

export const batchMultipleChoicePromptTotal = (cards: ExposureCard[], cueSides: CueSide[] = BATCH_TEST_MC_CUE_SIDES) =>
  multipleChoicePromptTotal(getBatchMultipleChoiceCards(cards).length, cueSides);

export const buildLessonTestWritingConfig = (lessonId: string, getMissedPasses: (cardId: string, cueSide: CueSide) => number): WritingQueueConfig => ({
  cueSides: ["english"],
  passesForCue: (card, cueSide) => getMissedPasses(card.id, cueSide),
});

export const buildMultipleChoiceStudyQueue = (cards: ExposureCard[], cueSides: CueSide[] = ["arabic", "english"]): StudyPrompt[] => {
  const prompts = cards.flatMap((card) =>
    cueSides.map(
      (cueSide): StudyPrompt => ({
        card,
        cueSide,
        passesRemaining: STUDY_PASSES_REQUIRED,
        passesRequired: STUDY_PASSES_REQUIRED,
      }),
    ),
  );

  return buildSpacedStudyQueue(prompts);
};

export type StudyQueueAdvanceMode = "repeat-until-correct" | "capped-attempts";

export const shouldIncrementWritingProgress = (
  _prompt: StudyPrompt,
  wasCorrect: boolean,
  _mode: StudyQueueAdvanceMode = "repeat-until-correct",
) => wasCorrect;

export const advanceStudyPromptQueue = (
  queue: StudyPrompt[],
  wasCorrect: boolean,
  mode: StudyQueueAdvanceMode = "repeat-until-correct",
): StudyPrompt[] => {
  const [current, ...rest] = queue;
  if (!current) return rest;

  let nextQueue: StudyPrompt[];
  if (mode === "capped-attempts") {
    if (wasCorrect) {
      nextQueue = rest;
    } else if (current.passesRemaining <= 1) {
      nextQueue = rest;
    } else {
      nextQueue = reinsertWithSpacing(rest, { ...current, passesRemaining: current.passesRemaining - 1 }, current);
    }
  } else if (!wasCorrect) {
    nextQueue = reinsertWithSpacing(rest, { ...current, passesRemaining: current.passesRequired }, current);
  } else if (current.passesRemaining <= 1) {
    nextQueue = rest;
  } else {
    nextQueue = reinsertWithSpacing(rest, { ...current, passesRemaining: current.passesRemaining - 1 }, current);
  }

  return ensureNoLeadingConflict(current, nextQueue);
};

const DISTRACTOR_COUNT = 3;
const MIN_SAME_BATCH_DISTRACTORS = 2;

const filterSameSectionCards = (currentCard: ExposureCard, lessonCards: ExposureCard[]) =>
  lessonCards.filter((card) => card.id !== currentCard.id && card.section === currentCard.section);

const orderByStemPreference = (
  currentCard: ExposureCard,
  candidates: ExposureCard[],
  getStemKey: (card: ExposureCard) => string,
) => {
  const stemKey = getStemKey(currentCard);
  return [
    ...shuffle(candidates.filter((card) => getStemKey(card) === stemKey)),
    ...shuffle(candidates.filter((card) => getStemKey(card) !== stemKey)),
  ];
};

const pickDistractorCards = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  getStemKey: (card: ExposureCard) => string,
  getAnswer: (card: ExposureCard) => string,
  limit: number,
) => {
  const correct = getAnswer(currentCard);
  const pool = filterSameSectionCards(currentCard, lessonCards);
  const sameBatch = pool.filter((card) => card.batchIndex === currentCard.batchIndex);
  const otherBatch = pool.filter((card) => card.batchIndex !== currentCard.batchIndex);

  const picked: ExposureCard[] = [];
  const usedAnswers = new Set<string>();

  const tryPick = (card: ExposureCard) => {
    const answer = getAnswer(card);
    if (!answer || answer === correct || usedAnswers.has(answer)) return false;
    picked.push(card);
    usedAnswers.add(answer);
    return true;
  };

  const sameBatchPicked = () => picked.filter((card) => card.batchIndex === currentCard.batchIndex).length;

  for (const card of orderByStemPreference(currentCard, sameBatch, getStemKey)) {
    if (sameBatchPicked() >= MIN_SAME_BATCH_DISTRACTORS) break;
    tryPick(card);
  }

  for (const card of orderByStemPreference(currentCard, [...sameBatch, ...otherBatch], getStemKey)) {
    if (picked.length >= limit) break;
    if (picked.some((item) => item.id === card.id)) continue;
    tryPick(card);
  }

  return shuffle(picked);
};

const pickStemDistractors = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  getStemKey: (card: ExposureCard) => string,
  getAnswer: (card: ExposureCard) => string,
  limit: number,
) =>
  pickDistractorCards(currentCard, lessonCards, getStemKey, getAnswer, limit).map((card) => getAnswer(card)).filter(Boolean);

const shuffleChoiceOptions = <T,>(correct: T, distractors: T[]) => {
  const wrong = shuffle(distractors.slice(0, 3));
  const options = [...wrong];
  options.splice(Math.floor(Math.random() * (options.length + 1)), 0, correct);
  return options;
};

export const getEnglishMultipleChoiceOptions = (currentCard: ExposureCard, lessonCards: ExposureCard[]) => {
  const correct = getEnglishAnswer(currentCard);
  const distractors = pickStemDistractors(currentCard, lessonCards, getCardEnglishStemKey, getEnglishAnswer, DISTRACTOR_COUNT);
  return shuffleChoiceOptions(correct, distractors);
};

const getVerbEnglishRecognitionAnswer = (currentCard: ExposureCard, batchCards: ExposureCard[]) => {
  const batchRecognition = prepareVerbBatchRecognition(batchCards);
  const familyId = getVerbFamilyIdFromCardId(currentCard.id);
  const fromBatch = batchRecognition?.englishLabelsByFamilyId.get(familyId);
  if (fromBatch) return fromBatch;

  const family = groupExposureCardsIntoVerbFamilies(batchCards).find((forms) =>
    forms.some((form) => getVerbFamilyIdFromCardId(form.id) === familyId),
  );
  return family ? getVerbEnglishRecognitionLabel(family, currentCard) : getEnglishAnswer(currentCard);
};

export const getBatchEnglishMultipleChoiceOptions = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  batchCards: ExposureCard[],
) => {
  if (currentCard.section !== "verbs") {
    return getEnglishMultipleChoiceOptions(currentCard, lessonCards);
  }

  const correct = getVerbEnglishRecognitionAnswer(currentCard, batchCards);
  const lessonRecognition = getLessonVerbRecognitionCards(lessonCards);
  const distractors = pickStemDistractors(
    currentCard,
    lessonRecognition,
    getCardArabicStemKey,
    (card) => getVerbEnglishRecognitionAnswer(card, batchCards),
    DISTRACTOR_COUNT,
  );
  return shuffleChoiceOptions(correct, distractors);
};

const prioritizeImageCards = (cards: ExposureCard[]) => [
  ...shuffle(cards.filter((card) => card.imageUrl)),
  ...shuffle(cards.filter((card) => !card.imageUrl)),
];

export const getArabicMultipleChoiceOptions = (currentCard: ExposureCard, lessonCards: ExposureCard[]) => {
  const sectionCards = lessonCards.filter((card) => card.section === currentCard.section);
  const distractors = pickDistractorCards(
    currentCard,
    prioritizeImageCards(sectionCards),
    getCardArabicStemKey,
    getArabicAnswer,
    DISTRACTOR_COUNT,
  );
  return shuffleChoiceOptions(currentCard, distractors);
};

export const getBatchArabicMultipleChoiceOptions = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  _batchCards: ExposureCard[],
) => {
  if (currentCard.section !== "verbs") {
    return getArabicMultipleChoiceOptions(currentCard, lessonCards);
  }

  const lessonRecognition = getLessonVerbRecognitionCards(lessonCards);
  return getArabicMultipleChoiceOptions(currentCard, lessonRecognition);
};
