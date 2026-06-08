import { parseEnglishStemAndTags } from "./batching";
import { shuffle } from "./shuffle";
import type { ExposureCard } from "./types";

export const STUDY_PASSES_REQUIRED = 2;

export type CueSide = "arabic" | "english";

export type StudyPrompt = {
  card: ExposureCard;
  cueSide: CueSide;
  passesRemaining: number;
  passesRequired: number;
};

const promptsConflict = (left: StudyPrompt, right: StudyPrompt) => left.cueSide === right.cueSide || left.card.id === right.card.id;

const hasAdjacentConflicts = (queue: StudyPrompt[]) =>
  queue.some((prompt, index) => {
    const next = queue[index + 1];
    return next ? promptsConflict(prompt, next) : false;
  });

const buildSpacedStudyQueueBacktracking = (prompts: StudyPrompt[]): StudyPrompt[] | null => {
  const ordered = [...prompts];

  const search = (index: number, result: StudyPrompt[]): StudyPrompt[] | null => {
    if (index === ordered.length) return result;

    const candidates = shuffle([...ordered.keys()].slice(index));
    for (const pick of candidates) {
      const candidate = ordered[pick]!;
      const last = result.at(-1);
      if (last && promptsConflict(last, candidate)) continue;

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

  return prompts;
};

const reinsertWithSpacing = (queue: StudyPrompt[], prompt: StudyPrompt, previous?: StudyPrompt): StudyPrompt[] => {
  const validIndices: number[] = [];

  for (let index = 0; index <= queue.length; index += 1) {
    const before = index === 0 ? previous : queue[index - 1];
    const after = queue[index];
    if (before && promptsConflict(before, prompt)) continue;
    if (after && promptsConflict(after, prompt)) continue;
    validIndices.push(index);
  }

  if (validIndices.length > 0) {
    const insertIndex = validIndices[Math.floor(Math.random() * validIndices.length)]!;
    return [...queue.slice(0, insertIndex), prompt, ...queue.slice(insertIndex)];
  }

  const fallbackIndex = queue.findIndex((candidate) => !previous || !promptsConflict(previous, candidate));
  const insertIndex = fallbackIndex === -1 ? queue.length : fallbackIndex + 1;
  return [...queue.slice(0, insertIndex), prompt, ...queue.slice(insertIndex)];
};

const ensureNoLeadingConflict = (previous: StudyPrompt, queue: StudyPrompt[]): StudyPrompt[] => {
  if (queue.length === 0 || !promptsConflict(previous, queue[0]!)) return queue;

  for (let candidateIndex = 1; candidateIndex < queue.length; candidateIndex += 1) {
    const candidate = queue[candidateIndex]!;
    if (promptsConflict(previous, candidate)) continue;

    const rotated = [candidate, ...queue.slice(0, candidateIndex), ...queue.slice(candidateIndex + 1)];
    if (rotated.length <= 1 || !promptsConflict(rotated[0]!, rotated[1]!)) return rotated;
  }

  const [first, ...rest] = queue;
  const repaired = reinsertWithSpacing(rest, first, previous);
  if (repaired.length === 0 || !promptsConflict(previous, repaired[0]!)) return repaired;

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

export const BATCH_TEST_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english", "arabic"],
  passesForCue: () => 2,
};

export const BATCH_REVIEW_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 2,
};

export const SECTION_FINALE_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english", "arabic"],
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

export const buildWritingStudyQueue = (cards: ExposureCard[], config: WritingQueueConfig): StudyPrompt[] => {
  const prompts = cards.flatMap((card) =>
    config.cueSides.map((cueSide): StudyPrompt => {
      const passesRequired = config.passesForCue?.(card, cueSide) ?? 1;
      return { card, cueSide, passesRemaining: passesRequired, passesRequired };
    }),
  );

  return buildSpacedStudyQueue(prompts);
};

export const buildLessonTestWritingConfig = (lessonId: string, getMissedPasses: (cardId: string, cueSide: CueSide) => number): WritingQueueConfig => ({
  cueSides: ["english", "arabic"],
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

export const advanceStudyPromptQueue = (queue: StudyPrompt[], wasCorrect: boolean): StudyPrompt[] => {
  const [current, ...rest] = queue;
  if (!current) return rest;

  let nextQueue: StudyPrompt[];
  if (!wasCorrect) {
    nextQueue = reinsertWithSpacing(rest, { ...current, passesRemaining: current.passesRequired }, current);
  } else if (current.passesRemaining <= 1) {
    nextQueue = rest;
  } else {
    nextQueue = reinsertWithSpacing(rest, { ...current, passesRemaining: current.passesRemaining - 1 }, current);
  }

  return ensureNoLeadingConflict(current, nextQueue);
};

const pickStemDistractors = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  getStemKey: (card: ExposureCard) => string,
  getAnswer: (card: ExposureCard) => string,
  limit: number,
) => {
  const correct = getAnswer(currentCard);
  const stemKey = getStemKey(currentCard);
  const sameStem = shuffle(
    lessonCards.filter((card) => card.id !== currentCard.id && getStemKey(card) === stemKey && getAnswer(card) !== correct),
  );
  const differentStem = shuffle(
    lessonCards.filter((card) => card.id !== currentCard.id && getStemKey(card) !== stemKey && getAnswer(card) !== correct),
  );

  const answers: string[] = [];
  const requiredStem = sameStem.find((card) => {
    const answer = getAnswer(card);
    return answer && !answers.includes(answer);
  });

  if (requiredStem) {
    const answer = getAnswer(requiredStem);
    if (answer) answers.push(answer);
  }

  for (const card of [...sameStem, ...differentStem]) {
    const answer = getAnswer(card);
    if (!answer || answer === correct || answers.includes(answer)) continue;
    answers.push(answer);
    if (answers.length >= limit) break;
  }

  return answers;
};

const pickStemDistractorCards = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  getStemKey: (card: ExposureCard) => string,
  getAnswer: (card: ExposureCard) => string,
  limit: number,
) => {
  const correct = getAnswer(currentCard);
  const stemKey = getStemKey(currentCard);
  const sameStem = shuffle(
    lessonCards.filter((card) => card.id !== currentCard.id && getStemKey(card) === stemKey && getAnswer(card) !== correct),
  );
  const differentStem = shuffle(
    lessonCards.filter((card) => card.id !== currentCard.id && getStemKey(card) !== stemKey && getAnswer(card) !== correct),
  );

  const picked: ExposureCard[] = [];
  const usedAnswers = new Set<string>();
  const requiredStem = sameStem.find((card) => {
    const answer = getAnswer(card);
    return answer && answer !== correct && !usedAnswers.has(answer);
  });

  if (requiredStem) {
    const answer = getAnswer(requiredStem);
    if (answer) {
      picked.push(requiredStem);
      usedAnswers.add(answer);
    }
  }

  for (const card of [...sameStem, ...differentStem]) {
    const answer = getAnswer(card);
    if (!answer || answer === correct || usedAnswers.has(answer)) continue;
    picked.push(card);
    usedAnswers.add(answer);
    if (picked.length >= limit) break;
  }

  return picked;
};

export const getEnglishMultipleChoiceOptions = (currentCard: ExposureCard, lessonCards: ExposureCard[]) => {
  const correct = getEnglishAnswer(currentCard);
  const distractors = pickStemDistractors(currentCard, lessonCards, getCardEnglishStemKey, getEnglishAnswer, 3);
  return shuffle([correct, ...distractors.slice(0, 3)]);
};

const prioritizeImageCards = (cards: ExposureCard[]) => [
  ...shuffle(cards.filter((card) => card.imageUrl)),
  ...shuffle(cards.filter((card) => !card.imageUrl)),
];

export const getArabicMultipleChoiceOptions = (currentCard: ExposureCard, lessonCards: ExposureCard[]) => {
  const distractors = pickStemDistractorCards(
    currentCard,
    prioritizeImageCards(lessonCards),
    getCardArabicStemKey,
    getArabicAnswer,
    3,
  );
  return shuffle([currentCard, ...distractors.slice(0, 3)]);
};
