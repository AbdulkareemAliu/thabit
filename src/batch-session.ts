import { expandVerbFamilyWritingPrompt } from "./study-queue";
import { resolveFamilyFormsForCard } from "./exposure-cards";
import type { ExposureCard } from "./types";
import type { BatchPhase } from "./types";
import type { CueSide, StudyPrompt } from "./study-queue";

export const BATCH_SESSION_STORAGE_KEY = "thabit.batchSessions";

const BATCH_PHASE_ORDER: BatchPhase[] = ["exposure", "memory-match", "multiple-choice", "writing-test"];

export type SerializedStudyPrompt = {
  cardId: string;
  cueSide: CueSide;
  passesRemaining: number;
  passesRequired: number;
  verbFamilyFormPart?: boolean;
  verbFamilyFormIndex?: number;
  verbFamilyFormCount?: number;
};

export type ExposureSessionState = {
  cardIndex: number;
  arabicRepsLeft: number;
  englishRepsLeft: number;
  sayLanguage: "arabic" | "english";
  writeRepsDone: number;
  writeLanguage: "arabic" | "english";
  isExtraPractice: boolean;
  verbFamilyMode?: boolean;
  sayRound?: number;
  formIndex?: number;
  writeRound?: number;
  writeFormIndex?: number;
};

export type MemoryMatchSessionState = {
  cardCount: number;
  tileIds: string[];
  matchedPairIds: string[];
  wrongPairIds: string[];
  selectedTileId: string | null;
  pairedTileId: string | null;
  timerSecondsLeft: number;
  timerStarted: boolean;
  cleanRunsRequired: number;
  cleanRunsDone: number;
  boardLocked: boolean;
  feedback: "wrong" | "timeout" | null;
};

export type MultipleChoiceSessionState = {
  queue: SerializedStudyPrompt[];
  questionIndex: number;
  timerSecondsLeft: number;
  missedCount: number;
  correctCount: number;
};

export type WritingTestSessionState = {
  queue: SerializedStudyPrompt[];
  queueVersion?: number;
  gradedCount: number;
  missedCount: number;
  isRevealed: boolean;
};

export type BatchSessionState = {
  phase: BatchPhase;
  cardCount: number;
  exposure?: ExposureSessionState;
  memoryMatch?: MemoryMatchSessionState;
  multipleChoice?: MultipleChoiceSessionState;
  writingTest?: WritingTestSessionState;
};

const readSessions = (): Record<string, BatchSessionState> => {
  try {
    const stored = window.localStorage.getItem(BATCH_SESSION_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, BatchSessionState>) : {};
  } catch {
    return {};
  }
};

const writeSessions = (sessions: Record<string, BatchSessionState>) => {
  window.localStorage.setItem(BATCH_SESSION_STORAGE_KEY, JSON.stringify(sessions));
};

export const getBatchSession = (stepId: string) => readSessions()[stepId];

export const clearBatchSession = (stepId: string) => {
  const sessions = readSessions();
  if (!sessions[stepId]) return;
  delete sessions[stepId];
  writeSessions(sessions);
};

export const clearLessonBatchSessions = (lessonId: string) => {
  const sessions = readSessions();
  let changed = false;
  for (const stepId of Object.keys(sessions)) {
    if (!stepId.startsWith(`${lessonId}-`)) continue;
    delete sessions[stepId];
    changed = true;
  }
  if (changed) writeSessions(sessions);
};

export const isBatchPhaseUnlocked = (phase: BatchPhase, completedPhases: BatchPhase[]) => {
  const index = BATCH_PHASE_ORDER.indexOf(phase);
  if (index <= 0) return true;
  return BATCH_PHASE_ORDER.slice(0, index).every((item) => completedPhases.includes(item));
};

export const getFirstIncompleteBatchPhase = (completedPhases: BatchPhase[]): BatchPhase =>
  BATCH_PHASE_ORDER.find((phase) => !completedPhases.includes(phase)) ?? "writing-test";

export const getResumeBatchPhase = (stepId: string, completedPhases: BatchPhase[]) => {
  const session = getBatchSession(stepId);
  if (session?.phase && isBatchPhaseUnlocked(session.phase, completedPhases)) {
    return session.phase;
  }
  return getFirstIncompleteBatchPhase(completedPhases);
};

export const saveBatchSession = (stepId: string, update: BatchSessionState) => {
  const sessions = readSessions();
  sessions[stepId] = update;
  writeSessions(sessions);
};

export const patchBatchSession = (stepId: string, patch: Partial<BatchSessionState> & Pick<BatchSessionState, "phase" | "cardCount">) => {
  saveBatchSession(stepId, {
    ...(getBatchSession(stepId) ?? { phase: patch.phase, cardCount: patch.cardCount }),
    ...patch,
  });
};

export const saveBatchSessionPhase = (stepId: string, phase: BatchPhase, cardCount: number) => {
  patchBatchSession(stepId, { phase, cardCount });
};

export const serializeStudyPrompt = (prompt: StudyPrompt): SerializedStudyPrompt => ({
  cardId: prompt.card.id,
  cueSide: prompt.cueSide,
  passesRemaining: prompt.passesRemaining,
  passesRequired: prompt.passesRequired,
  verbFamilyFormPart: prompt.verbFamilyFormPart,
  verbFamilyFormIndex: prompt.verbFamilyFormIndex,
  verbFamilyFormCount: prompt.verbFamilyFormCount,
});

const findFamilyFormCard = (cardId: string, familyFormsByCardId?: Map<string, ExposureCard[]>) => {
  if (!familyFormsByCardId) return undefined;
  for (const forms of familyFormsByCardId.values()) {
    const match = forms.find((form) => form.id === cardId);
    if (match) return match;
  }
  return undefined;
};

export const restoreStudyPrompts = (
  cards: ExposureCard[],
  serialized: SerializedStudyPrompt[],
  familyFormsByCardId?: Map<string, ExposureCard[]>,
  expandFamilyBlocks = true,
): StudyPrompt[] => {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const restored: StudyPrompt[] = [];
  for (const item of serialized) {
    const card = cardById.get(item.cardId) ?? findFamilyFormCard(item.cardId, familyFormsByCardId);
    if (!card) continue;
    const verbFamilyForms = resolveFamilyFormsForCard(card, familyFormsByCardId);
    const resolvedFormIndex =
      item.verbFamilyFormIndex ??
      (item.verbFamilyFormPart && verbFamilyForms
        ? verbFamilyForms.findIndex((form) => form.id === card.id)
        : undefined);
    restored.push({
      card,
      cueSide: item.cueSide,
      passesRemaining: item.passesRemaining,
      passesRequired: item.passesRequired,
      verbFamilyForms,
      verbFamilyFormPart: item.verbFamilyFormPart,
      verbFamilyFormIndex: resolvedFormIndex !== undefined && resolvedFormIndex >= 0 ? resolvedFormIndex : item.verbFamilyFormIndex,
      verbFamilyFormCount: item.verbFamilyFormCount ?? verbFamilyForms?.length,
    });
  }
  if (!expandFamilyBlocks) return restored;
  return restored.flatMap((prompt) => (prompt.verbFamilyFormPart ? [prompt] : expandVerbFamilyWritingPrompt(prompt)));
};

export const restoreWritingStudyPrompts = (
  cards: ExposureCard[],
  serialized: SerializedStudyPrompt[],
  familyFormsByCardId?: Map<string, ExposureCard[]>,
) => restoreStudyPrompts(cards, serialized, familyFormsByCardId, false);

export const isBatchSessionValid = (session: BatchSessionState | undefined, cardCount: number) =>
  Boolean(session && session.cardCount === cardCount);
