/** Local calendar date in YYYY-MM-DD form (used for streak + SRS scheduling). */
export const todayKey = () => new Date().toLocaleDateString("en-CA");

export const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
};

/** Whole local-calendar days from `fromKey` to `toKey` (negative if `toKey` is earlier). */
export const daysBetween = (fromKey: string, toKey: string) => {
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
};
