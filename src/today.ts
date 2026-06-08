/** Local calendar date in YYYY-MM-DD form (used for streak + SRS scheduling). */
export const todayKey = () => new Date().toLocaleDateString("en-CA");

export const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
};
