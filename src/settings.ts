import {
  EXPOSURE_SAY_REPS_ARABIC,
  EXPOSURE_SAY_REPS_ENGLISH,
  EXPOSURE_WRITES,
  MATCH_SECONDS_PER_PAIR,
  MC_SECONDS,
  MEMORY_MATCH_CLEAN_RUNS,
  REVIEW_MAX_INTERVAL_DAYS,
  REVIEW_MISS_FAMILY_SAY_ROUNDS,
  REVIEW_MISS_SAY_REPS,
  REVIEW_MISS_SPREAD_DAYS,
  REVIEW_NEW_CARD_STAGGER_DAYS,
  REVIEW_SCHEDULE_JITTER_DAYS,
  TEST_MISS_SAY_REPS_ARABIC,
  TEST_MISS_SAY_REPS_ENGLISH,
  TEST_MISS_VERB_FAMILY_SAY_ROUNDS,
  VERB_EXPOSURE_SAY_ROUNDS,
  VERB_EXPOSURE_WRITES,
} from "./config";

export const SETTINGS_STORAGE_KEY = "thabit.settings";
export const SETTINGS_CHANGED_EVENT = "thabit-settings-changed";

export type AppSettings = {
  exposureSayRepsArabic: number;
  exposureSayRepsEnglish: number;
  exposureWrites: number;
  verbExposureSayRounds: number;
  verbExposureWrites: number;
  testMissSayRepsArabic: number;
  testMissSayRepsEnglish: number;
  testMissFamilySayRounds: number;
  reviewMissSayReps: number;
  reviewMissFamilySayRounds: number;
  mcSeconds: number;
  matchSecondsPerPair: number;
  memoryMatchCleanRuns: number;
  reviewMaxIntervalDays: number;
  reviewNewCardStaggerDays: number;
  reviewScheduleJitterDays: number;
  reviewMissSpreadDays: number;
};

export type SettingsFieldKey = keyof AppSettings;

export type SettingsField = {
  key: SettingsFieldKey;
  label: string;
  hint?: string;
  min: number;
  max: number;
};

export type SettingsGroup = {
  id: string;
  title: string;
  description: string;
  fields: SettingsField[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  exposureSayRepsArabic: EXPOSURE_SAY_REPS_ARABIC,
  exposureSayRepsEnglish: EXPOSURE_SAY_REPS_ENGLISH,
  exposureWrites: EXPOSURE_WRITES,
  verbExposureSayRounds: VERB_EXPOSURE_SAY_ROUNDS,
  verbExposureWrites: VERB_EXPOSURE_WRITES,
  testMissSayRepsArabic: TEST_MISS_SAY_REPS_ARABIC,
  testMissSayRepsEnglish: TEST_MISS_SAY_REPS_ENGLISH,
  testMissFamilySayRounds: TEST_MISS_VERB_FAMILY_SAY_ROUNDS,
  reviewMissSayReps: REVIEW_MISS_SAY_REPS,
  reviewMissFamilySayRounds: REVIEW_MISS_FAMILY_SAY_ROUNDS,
  mcSeconds: MC_SECONDS,
  matchSecondsPerPair: MATCH_SECONDS_PER_PAIR,
  memoryMatchCleanRuns: MEMORY_MATCH_CLEAN_RUNS,
  reviewMaxIntervalDays: REVIEW_MAX_INTERVAL_DAYS,
  reviewNewCardStaggerDays: REVIEW_NEW_CARD_STAGGER_DAYS,
  reviewScheduleJitterDays: REVIEW_SCHEDULE_JITTER_DAYS,
  reviewMissSpreadDays: REVIEW_MISS_SPREAD_DAYS,
};

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "exposure",
    title: "Exposure",
    description: "Reps while learning new words in a batch.",
    fields: [
      { key: "exposureSayRepsArabic", label: "Say reps (Arabic)", min: 1, max: 200 },
      { key: "exposureSayRepsEnglish", label: "Say reps (English)", min: 1, max: 200 },
      { key: "exposureWrites", label: "Write reps", hint: "Nouns and phrases", min: 1, max: 50 },
      { key: "verbExposureSayRounds", label: "Family say rounds", hint: "Verbs and nouns, through every form", min: 1, max: 100 },
      { key: "verbExposureWrites", label: "Family write reps", hint: "Verbs and nouns", min: 1, max: 50 },
    ],
  },
  {
    id: "misses",
    title: "Miss loops",
    description: "Extra say practice after a wrong answer.",
    fields: [
      { key: "testMissSayRepsArabic", label: "Test miss say reps (Arabic)", min: 1, max: 100 },
      { key: "testMissSayRepsEnglish", label: "Test miss say reps (English)", min: 1, max: 100 },
      { key: "testMissFamilySayRounds", label: "Test miss family rounds", min: 1, max: 100 },
      { key: "reviewMissSayReps", label: "Review miss say reps", min: 1, max: 100 },
      { key: "reviewMissFamilySayRounds", label: "Review miss family rounds", min: 1, max: 100 },
    ],
  },
  {
    id: "games",
    title: "Match & multiple choice",
    description: "Timers and how many clean match boards you need.",
    fields: [
      { key: "mcSeconds", label: "Multiple choice seconds", min: 2, max: 30 },
      { key: "matchSecondsPerPair", label: "Match seconds per pair", min: 1, max: 10 },
      { key: "memoryMatchCleanRuns", label: "Clean match boards", min: 1, max: 10 },
    ],
  },
  {
    id: "review",
    title: "Review schedule",
    description: "How far ahead cards can wait, and how misses are spread.",
    fields: [
      { key: "reviewMaxIntervalDays", label: "Max interval (days)", min: 1, max: 30 },
      { key: "reviewNewCardStaggerDays", label: "New-card stagger (days)", min: 1, max: 30 },
      { key: "reviewMissSpreadDays", label: "Miss spread (days)", hint: "Wrong reviews are due across this many upcoming days", min: 1, max: 14 },
      { key: "reviewScheduleJitterDays", label: "Schedule jitter (days)", hint: "Extra drift so same-day reviews separate over time", min: 0, max: 7 },
    ],
  },
];

const FIELD_RANGE = Object.fromEntries(
  SETTINGS_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, { min: field.min, max: field.max }])),
) as Record<SettingsFieldKey, { min: number; max: number }>;

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const sanitizeSettings = (raw: Partial<AppSettings> | null | undefined): AppSettings => {
  const next = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return next;
  (Object.keys(DEFAULT_SETTINGS) as SettingsFieldKey[]).forEach((key) => {
    const range = FIELD_RANGE[key];
    next[key] = clampInt(raw[key], range.min, range.max, DEFAULT_SETTINGS[key]);
  });
  return next;
};

let cachedSettings: AppSettings | null = null;

const readStoredSettings = (): AppSettings => {
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(stored) as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const notifySettingsChanged = () => {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
};

export const getSettings = (): AppSettings => {
  if (!cachedSettings) cachedSettings = readStoredSettings();
  return cachedSettings;
};

export const saveSettings = (partial: Partial<AppSettings>) => {
  cachedSettings = sanitizeSettings({ ...getSettings(), ...partial });
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cachedSettings));
  notifySettingsChanged();
  return cachedSettings;
};

export const resetSettings = () => {
  cachedSettings = { ...DEFAULT_SETTINGS };
  window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  notifySettingsChanged();
  return cachedSettings;
};

/** Live getters so call sites always read the current saved values. */
export const settings: AppSettings = new Proxy(DEFAULT_SETTINGS, {
  get(_target, prop: string | symbol) {
    if (typeof prop === "string" && prop in DEFAULT_SETTINGS) {
      return getSettings()[prop as SettingsFieldKey];
    }
    return undefined;
  },
});

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SETTINGS_STORAGE_KEY) cachedSettings = null;
  });
}
