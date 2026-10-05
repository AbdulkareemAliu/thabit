import { restoreStudyPrompts, serializeStudyPrompt, type SerializedStudyPrompt } from "./batch-session";
import { prepareDailyReviewStudyCards } from "./lesson-study";
import type { ReviewableCard } from "./review";
import type { StudyPrompt } from "./study-queue";
import { todayKey } from "./today";

export const DAILY_REVIEW_SESSION_STORAGE_KEY = "thabit.dailyReviewSession";

export type DailyReviewPhase = "intro" | "study" | "replay" | "complete";

export type DailyReviewSessionState = {
  dateKey: string;
  phase: DailyReviewPhase;
  reviewQueue: ReviewableCard[];
  queue: SerializedStudyPrompt[];
  replayQueue: SerializedStudyPrompt[];
  missed: SerializedStudyPrompt[];
  correctCount: number;
  missedCount: number;
};

const readSession = (): DailyReviewSessionState | null => {
  try {
    const stored = window.localStorage.getItem(DAILY_REVIEW_SESSION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as DailyReviewSessionState;
    if (!parsed?.dateKey || !Array.isArray(parsed.reviewQueue)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearDailyReviewSession = () => {
  window.localStorage.removeItem(DAILY_REVIEW_SESSION_STORAGE_KEY);
};

export const writeDailyReviewSession = (session: Omit<DailyReviewSessionState, "dateKey">) => {
  const payload: DailyReviewSessionState = {
    ...session,
    dateKey: todayKey(),
  };
  window.localStorage.setItem(DAILY_REVIEW_SESSION_STORAGE_KEY, JSON.stringify(payload));
};

const restorePromptList = (serialized: SerializedStudyPrompt[] | undefined, reviewQueue: ReviewableCard[], prep = prepareDailyReviewStudyCards(reviewQueue)) => {
  if (!serialized?.length) return [] as StudyPrompt[];
  return restoreStudyPrompts(prep.cards, serialized, prep.familyFormsByCardId, false);
};

export const readActiveDailyReviewSession = () => {
  const session = readSession();
  if (!session || session.dateKey !== todayKey()) {
    if (session) clearDailyReviewSession();
    return null;
  }
  if (session.phase !== "study" && session.phase !== "replay") return null;
  if (session.queue.length === 0 && session.replayQueue.length === 0 && session.missed.length === 0) return null;

  const prep = prepareDailyReviewStudyCards(session.reviewQueue);
  return {
    phase: session.phase,
    reviewQueue: session.reviewQueue,
    queue: restorePromptList(session.queue, session.reviewQueue, prep),
    replayQueue: restorePromptList(session.replayQueue, session.reviewQueue, prep),
    missed: restorePromptList(session.missed, session.reviewQueue, prep),
    correctCount: session.correctCount,
    missedCount: session.missedCount,
  };
};
