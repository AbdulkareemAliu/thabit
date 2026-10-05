import { parseEnglishStemAndTags } from "./batching";
import { lessons } from "./data";
import { formatEnglishCueText, getEnglishAnswerInContext, getEnglishCueDisplayCard } from "./english-cue";
import {
  getCachedLessonExposureCards,
  getFamilyMeaningLabel,
  getLessonNounFamilyCards,
  getLessonVerbFamilyCards,
  getNounFamilyFormsForCard,
  getNounFamilyMeaningLabel,
  getNounFamilyIdFromCardId,
  getVerbFamilyFormsForCard,
  getVerbFamilyHarf,
  getVerbFamilyIdFromCardId,
  getVerbFamilyMeaningLabel,
  prepareBatchStudyCards,
  prepareNounBatchReviewTestCards,
  prepareVerbBatchReviewTestCards,
  VERB_HARF_ARABIC_LABEL,
} from "./exposure-cards";
import { getLessonExtrasRevision } from "./lesson-extras";
import { shuffle } from "./shuffle";
import type { ExposureCard } from "./types";
import { getWordEditRevision } from "./word-edits";

export const STUDY_PASSES_REQUIRED = 2;

/** Bump when writing-test queue build/advance rules change (invalidates saved sessions). */
export const WRITING_QUEUE_LOGIC_VERSION = 12;

export type CueSide = "arabic" | "english";

export type StudyPrompt = {
  card: ExposureCard;
  cueSide: CueSide;
  passesRemaining: number;
  passesRequired: number;
  verbFamilyForms?: ExposureCard[];
  /** Daily-review records graded together for one exact English cue. */
  dailyReviewCardIds?: string[];
  /** Every Arabic answer accepted for a grouped daily-review cue. */
  dailyReviewAnswerCards?: ExposureCard[];
  /** Shown when the same English cue appears in more than one lesson. */
  lessonLabel?: string;
  /** One sequential write prompt per verb form (family still tested together). */
  verbFamilyFormPart?: boolean;
  verbFamilyFormIndex?: number;
  verbFamilyFormCount?: number;
};

export const isVerbFamilyWritingPrompt = (prompt: StudyPrompt) =>
  Boolean(
    prompt.cueSide === "english" &&
      prompt.verbFamilyForms &&
      prompt.verbFamilyForms.length > 1 &&
      (prompt.card.section === "verbs" || prompt.card.section === "nouns"),
  );

const attachVerbFamilyFormPart = (
  prompt: StudyPrompt,
  form: ExposureCard,
  index: number,
  forms: ExposureCard[],
): StudyPrompt => ({
  ...prompt,
  card: form,
  verbFamilyForms: forms,
  verbFamilyFormPart: true,
  verbFamilyFormIndex: index,
  verbFamilyFormCount: forms.length,
});

const buildFamilyHarfWritingCard = (forms: ExposureCard[], harf: string): ExposureCard => {
  const head = forms[0]!;
  const familyId =
    head.section === "nouns" ? getNounFamilyIdFromCardId(head.id) : getVerbFamilyIdFromCardId(head.id);
  return {
    id: `${familyId}-harf`,
    arabic: harf,
    english: head.english,
    section: head.section,
    label: VERB_HARF_ARABIC_LABEL,
    harf,
  };
};

export const expandVerbFamilyWritingPrompt = (prompt: StudyPrompt): StudyPrompt[] => {
  if (prompt.verbFamilyFormPart || !isVerbFamilyWritingPrompt(prompt)) return [prompt];
  const forms = prompt.verbFamilyForms!;
  const harf = getVerbFamilyHarf(forms)?.trim();
  const total = forms.length + (harf ? 1 : 0);
  const parts = forms.map((form, index) => ({
    ...attachVerbFamilyFormPart(prompt, form, index, forms),
    verbFamilyFormCount: total,
  }));
  if (harf) {
    parts.push({
      ...prompt,
      card: buildFamilyHarfWritingCard(forms, harf),
      verbFamilyForms: forms,
      verbFamilyFormPart: true,
      verbFamilyFormIndex: forms.length,
      verbFamilyFormCount: total,
    });
  }
  return parts;
};

export const getVerbFamilyFormPartIndex = (prompt: StudyPrompt) => {
  if (!prompt.verbFamilyFormPart) return -1;
  if (typeof prompt.verbFamilyFormIndex === "number") return prompt.verbFamilyFormIndex;
  if (!prompt.verbFamilyForms?.length) return -1;
  return prompt.verbFamilyForms.findIndex((form) => form.id === prompt.card.id);
};

export const getVerbFamilyFormPartCount = (prompt: StudyPrompt) => {
  if (!prompt.verbFamilyFormPart) return 0;
  if (typeof prompt.verbFamilyFormCount === "number") return prompt.verbFamilyFormCount;
  return prompt.verbFamilyForms?.length ?? 0;
};

const getFamilyWritingBlockId = (prompt: StudyPrompt) => {
  const head = prompt.verbFamilyForms?.[0] ?? prompt.card;
  if (head.section === "verbs") return getVerbFamilyIdFromCardId(head.id);
  if (head.section === "nouns") return getNounFamilyIdFromCardId(head.id);
  return head.id;
};

/** Forms for one family must appear back-to-back in index order (0, 1, 2, …). */
export const isValidFamilyWritingQueue = (queue: StudyPrompt[]): boolean => {
  let previous: StudyPrompt | undefined;

  for (const prompt of queue) {
    if (!prompt.verbFamilyFormPart) {
      if (prompt.verbFamilyForms?.length) return false;
      previous = prompt;
      continue;
    }

    const index = getVerbFamilyFormPartIndex(prompt);
    const count = getVerbFamilyFormPartCount(prompt);
    if (index < 0 || count <= 0) return false;

    if (index === 0) {
      previous = prompt;
      continue;
    }

    if (!previous?.verbFamilyFormPart) return false;
    if (getFamilyWritingBlockId(previous) !== getFamilyWritingBlockId(prompt)) return false;
    if (getVerbFamilyFormPartIndex(previous) !== index - 1) return false;
    previous = prompt;
  }

  return true;
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

/** True when inserting here would land inside one family's form-part run. */
const wouldSplitFamilyFormBlock = (queue: StudyPrompt[], insertIndex: number) => {
  if (insertIndex <= 0 || insertIndex >= queue.length) return false;
  const before = queue[insertIndex - 1]!;
  const after = queue[insertIndex]!;
  if (!before.verbFamilyFormPart || !after.verbFamilyFormPart) return false;
  return getFamilyWritingBlockId(before) === getFamilyWritingBlockId(after);
};

/** True when inserting a standalone here would sit between two different families. */
const wouldSitBetweenFamilies = (queue: StudyPrompt[], insertIndex: number) => {
  if (insertIndex <= 0 || insertIndex >= queue.length) return false;
  const before = queue[insertIndex - 1]!;
  const after = queue[insertIndex]!;
  if (!before.verbFamilyFormPart || !after.verbFamilyFormPart) return false;
  return getFamilyWritingBlockId(before) !== getFamilyWritingBlockId(after);
};

const reinsertWithSpacing = (queue: StudyPrompt[], prompt: StudyPrompt, previous?: StudyPrompt): StudyPrompt[] => {
  const context = previous ? [previous, ...queue, prompt] : [...queue, prompt];
  const conflicts = (left: StudyPrompt, right: StudyPrompt) => promptsConflictInSet(left, right, context);
  const isStandalone = !prompt.verbFamilyFormPart && !isVerbFamilyWritingPrompt(prompt);
  const validIndices: number[] = [];

  for (let index = 0; index <= queue.length; index += 1) {
    if (wouldSplitFamilyFormBlock(queue, index)) continue;
    if (isStandalone && wouldSitBetweenFamilies(queue, index)) continue;
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

  // Prefer the end over breaking family runs when no spaced slot exists.
  if (!wouldSplitFamilyFormBlock(queue, queue.length) && !(isStandalone && wouldSitBetweenFamilies(queue, queue.length))) {
    return [...queue, prompt];
  }

  const fallbackIndex = queue.findIndex((candidate) => !previous || !conflicts(previous, candidate));
  const insertIndex = fallbackIndex === -1 ? queue.length : fallbackIndex + 1;
  return [...queue.slice(0, insertIndex), prompt, ...queue.slice(insertIndex)];
};

const ensureNoLeadingConflict = (previous: StudyPrompt, queue: StudyPrompt[]): StudyPrompt[] => {
  const context = [previous, ...queue];
  const conflicts = (left: StudyPrompt, right: StudyPrompt) => promptsConflictInSet(left, right, context);
  if (queue.length === 0 || !conflicts(previous, queue[0]!)) return queue;

  // Never peel individual verb form parts out of a family block.
  if (queue.some((prompt) => prompt.verbFamilyFormPart)) return queue;

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

export const getEnglishAnswer = (card: ExposureCard) => formatEnglishCueText(card);

export const getArabicAnswer = (card: ExposureCard) => card.arabic;

export const getCardEnglishStemKey = (card: ExposureCard) => parseEnglishStemAndTags(card.english).stem.toLowerCase();

export const getCardArabicStemKey = (card: ExposureCard) => {
  if (card.section === "verbs") {
    const match = card.id.match(/^(.*)-(past|present|command|masdar|passive|activeParticiple)$/);
    return match?.[1] ?? card.id;
  }
  if (card.section === "nouns") {
    const match = card.id.match(/^(.*)-(singular|plural)$/);
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
  passesForCue: () => 1,
};

export const SECTION_FINALE_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 1,
};

export const DAILY_REVIEW_WRITING_CONFIG: WritingQueueConfig = {
  cueSides: ["english"],
  passesForCue: () => 1,
};

export const getReviewCueEnglishKey = (card: ExposureCard, forms?: ExposureCard[]) => {
  const label = forms && forms.length > 0 ? getFamilyMeaningLabel(forms) : formatEnglishCueText(card);
  return label.trim().toLocaleLowerCase();
};

let cachedDuplicateReviewEnglish: { revision: string; keys: Set<string> } | null = null;

export const getCrossLessonDuplicateReviewEnglishKeys = () => {
  const revision = `${getWordEditRevision()}:${getLessonExtrasRevision()}`;
  if (cachedDuplicateReviewEnglish?.revision === revision) return cachedDuplicateReviewEnglish.keys;

  const lessonsByKey = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    const allCards = getCachedLessonExposureCards(lesson);
    const nounPrep = prepareNounBatchReviewTestCards(allCards.filter((card) => card.section === "nouns"));
    const verbPrep = prepareVerbBatchReviewTestCards(allCards.filter((card) => card.section === "verbs"));
    const reviewCards = [
      ...allCards.filter((card) => card.section === "phrases"),
      ...nounPrep.cards,
      ...verbPrep.cards,
    ];
    const familyFormsByCardId = new Map([...nounPrep.familyFormsByCardId, ...verbPrep.familyFormsByCardId]);

    for (const card of reviewCards) {
      const key = getReviewCueEnglishKey(card, familyFormsByCardId.get(card.id));
      if (!key) continue;
      const seen = lessonsByKey.get(key) ?? new Set<string>();
      seen.add(lesson.id);
      lessonsByKey.set(key, seen);
    }
  }

  const keys = new Set(
    [...lessonsByKey.entries()].filter(([, lessonIds]) => lessonIds.size > 1).map(([key]) => key),
  );
  cachedDuplicateReviewEnglish = { revision, keys };
  return keys;
};

export const buildDailyReviewFlashcardQueue = (
  reviewQueue: { id: string; lessonId: string }[],
  prep: {
    cards: ExposureCard[];
    familyFormsByCardId: Map<string, ExposureCard[]>;
  },
): StudyPrompt[] => {
  const cardById = new Map(prep.cards.map((card) => [card.id, card]));
  const duplicateEnglish = getCrossLessonDuplicateReviewEnglishKeys();
  const lessonLabelById = new Map(lessons.map((lesson) => [lesson.id, `Lesson ${lesson.number}`]));

  return shuffle(
    reviewQueue.flatMap((reviewCard): StudyPrompt[] => {
      const card = cardById.get(reviewCard.id);
      if (!card) return [];

      const verbFamilyForms = prep.familyFormsByCardId.get(card.id);
      const englishKey = getReviewCueEnglishKey(card, verbFamilyForms);
      return [
        {
          card,
          cueSide: "english",
          passesRemaining: 1,
          passesRequired: 1,
          verbFamilyForms,
          dailyReviewCardIds: [card.id],
          lessonLabel: duplicateEnglish.has(englishKey) ? lessonLabelById.get(reviewCard.lessonId) : undefined,
        },
      ];
    }),
  );
};

export const getDailyReviewPromptCardIds = (prompt: StudyPrompt) =>
  prompt.dailyReviewCardIds?.length ? prompt.dailyReviewCardIds : [getVerbFamilyWritingReviewCardId(prompt)];

export const getDailyReviewPromptAnswerCards = (prompt: StudyPrompt) =>
  prompt.dailyReviewAnswerCards?.length ? prompt.dailyReviewAnswerCards : prompt.verbFamilyForms?.length ? prompt.verbFamilyForms : [prompt.card];

const resolveWritingTestPrep = (cards: ExposureCard[], familyFormsByCardId?: Map<string, ExposureCard[]>) => {
  if (cards.length > 0 && familyFormsByCardId?.size) {
    return { cards, familyFormsByCardId };
  }
  if (cards.length > 0 && (cards[0]?.section === "verbs" || cards[0]?.section === "nouns")) {
    return prepareBatchStudyCards(cards);
  }
  return { cards, familyFormsByCardId: familyFormsByCardId ?? new Map<string, ExposureCard[]>() };
};

/**
 * Expand multi-form families into contiguous form runs.
 * Keep standalones out from between families (families first, then singles).
 */
const buildFamilyWritingQueue = (prompts: StudyPrompt[], shuffleBlocks = false) => {
  const familyBlocks: StudyPrompt[][] = [];
  const standaloneBlocks: StudyPrompt[][] = [];

  for (const prompt of prompts) {
    if (isVerbFamilyWritingPrompt(prompt)) {
      familyBlocks.push(expandVerbFamilyWritingPrompt(prompt));
    } else {
      standaloneBlocks.push([prompt]);
    }
  }

  const families = shuffleBlocks ? shuffle(familyBlocks) : familyBlocks;
  const standalones = shuffleBlocks ? shuffle(standaloneBlocks) : standaloneBlocks;
  return [...families, ...standalones].flat();
};

export const buildWritingStudyQueue = (
  cards: ExposureCard[],
  config: WritingQueueConfig,
  shuffleCards = false,
  familyFormsByCardId?: Map<string, ExposureCard[]>,
): StudyPrompt[] => {
  const prep = resolveWritingTestPrep(cards, familyFormsByCardId);
  const formsMap = prep.familyFormsByCardId;
  const prompts = prep.cards.flatMap((card) =>
    config.cueSides.map((cueSide): StudyPrompt => {
      const passesRequired = config.passesForCue?.(card, cueSide) ?? 1;
      const verbFamilyForms = formsMap.get(card.id);
      return { card, cueSide, passesRemaining: passesRequired, passesRequired, verbFamilyForms };
    }),
  );

  if (prompts.some(isVerbFamilyWritingPrompt)) {
    return buildFamilyWritingQueue(prompts, shuffleCards);
  }

  return buildSpacedStudyQueue(prompts);
};

export const writingTestPromptTotal = (
  cards: ExposureCard[],
  config: WritingQueueConfig,
  familyFormsByCardId?: Map<string, ExposureCard[]>,
) => {
  const prep = resolveWritingTestPrep(cards, familyFormsByCardId);
  return prep.cards.reduce((total, card) => {
    const sideTotal = config.cueSides.reduce((count, cueSide) => {
      const passes = config.passesForCue?.(card, cueSide) ?? 1;
      return count + passes;
    }, 0);
    return total + sideTotal;
  }, 0);
};

export const isFirstVerbFamilyFormPart = (prompt: StudyPrompt) => getVerbFamilyFormPartIndex(prompt) === 0;

export const isLastVerbFamilyFormPart = (prompt: StudyPrompt, remainingQueueLength = 0) => {
  if (!prompt.verbFamilyFormPart) return true;
  const index = getVerbFamilyFormPartIndex(prompt);
  const count = getVerbFamilyFormPartCount(prompt);
  if (index >= 0 && count > 0) return index === count - 1;
  return remainingQueueLength === 0;
};

export const getVerbFamilyWritingReviewCardId = (prompt: StudyPrompt) =>
  prompt.verbFamilyForms?.[0]?.id ?? prompt.card.id;

const collapseVerbFamilyWritingPrompt = (prompt: StudyPrompt): StudyPrompt => ({
  card: prompt.verbFamilyForms![0]!,
  cueSide: prompt.cueSide,
  passesRemaining: prompt.passesRemaining,
  passesRequired: prompt.passesRequired,
  verbFamilyForms: prompt.verbFamilyForms,
});

const buildExpandedFamilyBlock = (familyHead: StudyPrompt, passesRemaining: number): StudyPrompt[] =>
  expandVerbFamilyWritingPrompt({
    ...familyHead,
    passesRemaining,
    passesRequired: familyHead.passesRequired,
  });

const appendFamilyWritingBlock = (queue: StudyPrompt[], block: StudyPrompt[]) =>
  block.length === 0 ? queue : [...queue, ...block];

const advanceFamilyWritingBlock = (
  rest: StudyPrompt[],
  familyHead: StudyPrompt,
  familyCorrect: boolean,
  mode: StudyQueueAdvanceMode,
): StudyPrompt[] => {
  if (mode === "capped-attempts") {
    if (familyCorrect) return rest;
    if (familyHead.passesRemaining <= 1) return rest;
    return appendFamilyWritingBlock(rest, buildExpandedFamilyBlock(familyHead, familyHead.passesRemaining - 1));
  }

  if (!familyCorrect) {
    return appendFamilyWritingBlock(rest, buildExpandedFamilyBlock(familyHead, familyHead.passesRequired));
  }

  if (familyHead.passesRemaining <= 1) return rest;

  return appendFamilyWritingBlock(rest, buildExpandedFamilyBlock(familyHead, familyHead.passesRemaining - 1));
};

export const buildWithinBatchWritingStudyQueue = (
  prep: { cards: ExposureCard[]; familyFormsByCardId: Map<string, ExposureCard[]> },
  config: WritingQueueConfig = BATCH_TEST_WRITING_CONFIG,
): StudyPrompt[] => buildWritingStudyQueue(prep.cards, config, false, prep.familyFormsByCardId);

export const buildBatchWritingStudyQueue = (cards: ExposureCard[]): StudyPrompt[] => {
  const prep = prepareBatchStudyCards(cards);
  return buildWithinBatchWritingStudyQueue(prep, BATCH_TEST_WRITING_CONFIG);
};

export const batchWritingTestPromptTotal = (cards: ExposureCard[]) => {
  const prep = prepareBatchStudyCards(cards);
  return writingTestPromptTotal(prep.cards, BATCH_TEST_WRITING_CONFIG, prep.familyFormsByCardId);
};

export const getBatchMultipleChoiceCards = (cards: ExposureCard[]) => prepareBatchStudyCards(cards).cards;

const isMultiFormMcFamily = (forms?: ExposureCard[] | null) => Boolean(forms && forms.length > 1);

export const buildBatchMultipleChoiceStudyQueue = (cards: ExposureCard[], cueSides: CueSide[] = BATCH_TEST_MC_CUE_SIDES) => {
  const prep = prepareBatchStudyCards(cards);
  const prompts = prep.cards.flatMap((card) =>
    cueSides.map(
      (cueSide): StudyPrompt => ({
        card,
        cueSide,
        passesRemaining: STUDY_PASSES_REQUIRED,
        passesRequired: STUDY_PASSES_REQUIRED,
        verbFamilyForms: prep.familyFormsByCardId.get(card.id),
      }),
    ),
  );
  return buildSpacedStudyQueue(prompts);
};

export const batchMultipleChoicePromptTotal = (cards: ExposureCard[], cueSides: CueSide[] = BATCH_TEST_MC_CUE_SIDES) =>
  multipleChoicePromptTotal(getBatchMultipleChoiceCards(cards).length, cueSides);

export const buildMultipleChoiceStudyQueue = (
  cards: ExposureCard[],
  cueSides: CueSide[] = ["arabic", "english"],
  familyFormsByCardId?: Map<string, ExposureCard[]>,
): StudyPrompt[] => {
  const prompts = cards.flatMap((card) =>
    cueSides.map(
      (cueSide): StudyPrompt => ({
        card,
        cueSide,
        passesRemaining: STUDY_PASSES_REQUIRED,
        passesRequired: STUDY_PASSES_REQUIRED,
        verbFamilyForms: familyFormsByCardId?.get(card.id),
      }),
    ),
  );

  return buildSpacedStudyQueue(prompts);
};

/** Prefer live family forms when provided so edits stay in sync with option labels. */
export const getMultipleChoiceAnswerKey = (
  prompt: StudyPrompt,
  contextCards?: ExposureCard[],
  familyForms?: ExposureCard[] | null,
) => {
  const forms = familyForms ?? prompt.verbFamilyForms;
  if (isMultiFormMcFamily(forms)) {
    if (prompt.cueSide === "arabic") {
      return prompt.card.section === "nouns"
        ? getNounFamilyMeaningLabel(forms!)
        : getVerbFamilyMeaningLabel(forms!);
    }
    return prompt.card.section === "nouns"
      ? getNounFamilyIdFromCardId(prompt.card.id)
      : getVerbFamilyIdFromCardId(prompt.card.id);
  }
  return prompt.cueSide === "arabic"
    ? contextCards
      ? getEnglishAnswerInContext(prompt.card, contextCards)
      : getEnglishAnswer(prompt.card)
    : getArabicAnswer(prompt.card);
};

export const getMultipleChoiceArabicOptionKey = (
  prompt: StudyPrompt,
  option: ExposureCard,
  familyForms?: ExposureCard[] | null,
) => {
  const forms = familyForms ?? prompt.verbFamilyForms;
  if (prompt.card.section === "verbs" && isMultiFormMcFamily(forms)) {
    return getVerbFamilyIdFromCardId(option.id);
  }
  if (prompt.card.section === "nouns" && isMultiFormMcFamily(forms)) {
    return getNounFamilyIdFromCardId(option.id);
  }
  return getArabicAnswer(option);
};

const sameMcFamily = (left: ExposureCard, right: ExposureCard) => {
  if (left.section === "verbs" && right.section === "verbs") {
    return getVerbFamilyIdFromCardId(left.id) === getVerbFamilyIdFromCardId(right.id);
  }
  if (left.section === "nouns" && right.section === "nouns") {
    return getNounFamilyIdFromCardId(left.id) === getNounFamilyIdFromCardId(right.id);
  }
  return left.id === right.id;
};

const dedupeStrings = (options: string[]) => {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option || seen.has(option)) return false;
    seen.add(option);
    return true;
  });
};

const dedupeCardsByKey = (options: ExposureCard[], getKey: (card: ExposureCard) => string) => {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = getKey(option);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildLessonTestWritingConfig = (): WritingQueueConfig => ({
  cueSides: ["english"],
  passesForCue: () => 1,
});

export type StudyQueueAdvanceMode = "repeat-until-correct" | "capped-attempts";

export const shouldIncrementWritingProgress = (
  prompt: StudyPrompt,
  wasCorrect: boolean,
  mode: StudyQueueAdvanceMode = "repeat-until-correct",
  familyHadMiss = false,
) => {
  if (prompt.verbFamilyFormPart && !isLastVerbFamilyFormPart(prompt)) return false;
  if (prompt.verbFamilyFormPart) {
    if (!wasCorrect || familyHadMiss) return false;
    return true;
  }
  if (mode === "capped-attempts") {
    return wasCorrect || prompt.passesRemaining <= 1;
  }
  return wasCorrect;
};

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

export const advanceWritingStudyQueue = (
  queue: StudyPrompt[],
  wasCorrect: boolean,
  familyHadMiss = false,
  mode: StudyQueueAdvanceMode = "repeat-until-correct",
): StudyPrompt[] => {
  const [current, ...rest] = queue;
  if (!current) return rest;

  if (isVerbFamilyWritingPrompt(current) && !current.verbFamilyFormPart) {
    return [...expandVerbFamilyWritingPrompt(current), ...rest];
  }

  if (current.verbFamilyFormPart && current.verbFamilyForms?.length) {
    if (!isLastVerbFamilyFormPart(current, rest.length)) return rest;

    const familyCorrect = wasCorrect && !familyHadMiss;
    const familyHead = collapseVerbFamilyWritingPrompt(current);
    return advanceFamilyWritingBlock(rest, familyHead, familyCorrect, mode);
  }

  return advanceStudyPromptQueue(queue, wasCorrect, mode);
};

/** Skip remaining forms in the current family, append a repeat block, and continue. */
export const advanceWritingStudyQueueAfterFamilyMiss = (
  queue: StudyPrompt[],
  mode: StudyQueueAdvanceMode = "repeat-until-correct",
): StudyPrompt[] => {
  const [current, ...rest] = queue;
  if (!current) return rest;

  if (!isVerbFamilyWritingPrompt(current)) {
    return advanceStudyPromptQueue(queue, false, mode);
  }

  const familyHead = current.verbFamilyFormPart ? collapseVerbFamilyWritingPrompt(current) : current;
  const familyKey = getFamilyWritingBlockId(current);
  const filteredRest = rest.filter((prompt) => {
    if (!prompt.verbFamilyFormPart || !prompt.verbFamilyForms?.length) return true;
    return getFamilyWritingBlockId(prompt) !== familyKey;
  });

  return advanceFamilyWritingBlock(filteredRest, familyHead, false, mode);
};

const DISTRACTOR_COUNT = 3;
const MIN_SAME_BATCH_DISTRACTORS = 2;

const filterSameSectionCards = (currentCard: ExposureCard, lessonCards: ExposureCard[]) =>
  lessonCards.filter(
    (card) => card.section === currentCard.section && card.id !== currentCard.id && !sameMcFamily(card, currentCard),
  );

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

const shuffleChoiceOptions = <T,>(correct: T, distractors: T[], isSame?: (left: T, right: T) => boolean) => {
  const same = isSame ?? ((left, right) => left === right);
  const wrong = shuffle(distractors.slice(0, 3)).filter((option) => !same(option, correct));
  const options = [...wrong];
  options.splice(Math.floor(Math.random() * (options.length + 1)), 0, correct);
  return options;
};

export const getEnglishMultipleChoiceOptions = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  contextCards?: ExposureCard[],
) => {
  const getAnswer = (card: ExposureCard) =>
    contextCards ? formatEnglishCueText(getEnglishCueDisplayCard(card, contextCards)) : getEnglishAnswer(card);
  const correct = getAnswer(currentCard);
  const distractors = pickStemDistractors(currentCard, lessonCards, getCardEnglishStemKey, getAnswer, DISTRACTOR_COUNT);
  return dedupeStrings(shuffleChoiceOptions(correct, distractors));
};

const getVerbFamilyEnglishAnswer = (card: ExposureCard, familyForms?: ExposureCard[]) =>
  getVerbFamilyMeaningLabel(familyForms?.length ? familyForms : [card]);

const getNounFamilyEnglishAnswer = (card: ExposureCard, familyForms?: ExposureCard[]) =>
  getNounFamilyMeaningLabel(familyForms?.length ? familyForms : [card]);

const getBatchEnglishMcAnswer = (
  card: ExposureCard,
  lessonCards: ExposureCard[],
  batchCards: ExposureCard[],
  batchPrep: ReturnType<typeof prepareBatchStudyCards>,
) => {
  if (card.section === "nouns") {
    const familyForms =
      batchPrep.familyFormsByCardId.get(card.id) ?? getNounFamilyFormsForCard(lessonCards, card);
    if (isMultiFormMcFamily(familyForms)) {
      return getNounFamilyEnglishAnswer(card, familyForms ?? undefined);
    }
    return formatEnglishCueText(getEnglishCueDisplayCard(card, batchCards));
  }

  const familyForms =
    batchPrep.familyFormsByCardId.get(card.id) ?? getVerbFamilyFormsForCard(lessonCards, card);
  if (isMultiFormMcFamily(familyForms)) {
    return getVerbFamilyEnglishAnswer(card, familyForms ?? undefined);
  }
  return formatEnglishCueText(getEnglishCueDisplayCard(card, batchCards));
};

export const getBatchEnglishMultipleChoiceOptions = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  batchCards: ExposureCard[],
) => {
  if (currentCard.section === "nouns" && batchCards[0]?.section === "nouns") {
    const batchPrep = prepareBatchStudyCards(batchCards);
    const familyForms =
      batchPrep.familyFormsByCardId.get(currentCard.id) ?? getNounFamilyFormsForCard(lessonCards, currentCard);
    if (!isMultiFormMcFamily(familyForms)) {
      return getEnglishMultipleChoiceOptions(currentCard, lessonCards, batchCards);
    }
    const getAnswer = (card: ExposureCard) => getBatchEnglishMcAnswer(card, lessonCards, batchCards, batchPrep);
    const correct = getAnswer(currentCard);
    const lessonFamilyCards = getLessonNounFamilyCards(lessonCards);
    const distractors = pickStemDistractors(
      currentCard,
      lessonFamilyCards,
      (card) => getNounFamilyIdFromCardId(card.id),
      getAnswer,
      DISTRACTOR_COUNT,
    );
    return dedupeStrings(shuffleChoiceOptions(correct, distractors));
  }

  if (currentCard.section !== "verbs") {
    return getEnglishMultipleChoiceOptions(currentCard, lessonCards, batchCards);
  }

  const batchPrep = prepareBatchStudyCards(batchCards);
  const familyForms =
    batchPrep.familyFormsByCardId.get(currentCard.id) ?? getVerbFamilyFormsForCard(lessonCards, currentCard);
  if (!isMultiFormMcFamily(familyForms)) {
    return getEnglishMultipleChoiceOptions(currentCard, lessonCards, batchCards);
  }
  const getAnswer = (card: ExposureCard) => getBatchEnglishMcAnswer(card, lessonCards, batchCards, batchPrep);
  const correct = getAnswer(currentCard);
  const lessonFamilyCards = getLessonVerbFamilyCards(lessonCards);
  const distractors = pickStemDistractors(
    currentCard,
    lessonFamilyCards,
    (card) => getVerbFamilyIdFromCardId(card.id),
    getAnswer,
    DISTRACTOR_COUNT,
  );
  return dedupeStrings(shuffleChoiceOptions(correct, distractors));
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
  return dedupeCardsByKey(
    shuffleChoiceOptions(currentCard, distractors, (left, right) => sameMcFamily(left, right) || left.id === right.id),
    (card) =>
      currentCard.section === "verbs"
        ? getVerbFamilyIdFromCardId(card.id)
        : currentCard.section === "nouns"
          ? getNounFamilyIdFromCardId(card.id)
          : getArabicAnswer(card),
  );
};

export const getBatchArabicMultipleChoiceOptions = (
  currentCard: ExposureCard,
  lessonCards: ExposureCard[],
  _batchCards: ExposureCard[],
) => {
  if (currentCard.section === "nouns") {
    return getArabicMultipleChoiceOptions(currentCard, getLessonNounFamilyCards(lessonCards));
  }

  if (currentCard.section !== "verbs") {
    return getArabicMultipleChoiceOptions(currentCard, lessonCards);
  }

  const lessonFamilyCards = getLessonVerbFamilyCards(lessonCards);
  return getArabicMultipleChoiceOptions(currentCard, lessonFamilyCards);
};
