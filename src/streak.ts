import { addDays, todayKey } from "./today";

export const STREAK_STORAGE_KEY = "thabit.streak";

export type StreakState = {
  current: number;
  best: number;
  lastActiveDate: string | null;
};

const defaultStreak = (): StreakState => ({
  current: 0,
  best: 0,
  lastActiveDate: null,
});

export const readStreak = (): StreakState => {
  try {
    const stored = window.localStorage.getItem(STREAK_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StreakState) : defaultStreak();
  } catch {
    return defaultStreak();
  }
};

const writeStreak = (streak: StreakState) => {
  window.localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(streak));
};

export const resetStreak = () => {
  writeStreak(defaultStreak());
};

/** Counts one study day. Safe to call multiple times on the same day. */
export const recordStudyActivity = (): StreakState => {
  const today = todayKey();
  const streak = readStreak();

  if (streak.lastActiveDate === today) return streak;

  const yesterday = addDays(today, -1);
  const current = streak.lastActiveDate === yesterday ? streak.current + 1 : 1;
  const next: StreakState = {
    current,
    best: Math.max(streak.best, current),
    lastActiveDate: today,
  };
  writeStreak(next);
  return next;
};
