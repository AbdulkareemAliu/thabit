import { clearLessonBatchSessions } from "./batch-session";
import { lessons } from "./data";
import type { BatchPhase, Lesson, LessonStatus, LessonStep, LessonStepKind, SectionKind, StepStatus } from "./types";

const TRACKABLE_STEP_KINDS: LessonStepKind[] = ["batch", "batch-review", "vocabulary-test", "final-test"];

export type LessonProgressSummary = {
  percent: number;
  completedCount: number;
  totalCount: number;
};

export const COMPLETED_PHASES_STORAGE_KEY = "thabit.completedBatchPhases";
export const COMPLETED_STEPS_STORAGE_KEY = "thabit.completedStepIds";
export const INITIAL_SETUP_STORAGE_KEY = "thabit.initialSetup.v1";
const RESET_LESSON_2_MIGRATION_KEY = "thabit.migration.resetLesson2AndStreak_v1";
const ALL_BATCH_PHASES: BatchPhase[] = ["exposure", "memory-match", "multiple-choice", "writing-test"];

export const LESSON_SECTION_ORDER: SectionKind[] = ["nouns", "phrases", "verbs"];
const BATCH_PHASE_MIGRATION_KEY = "thabit.migration.batchPhaseWritingTest_v1";
const BATCH_REVIEW_STEP_MIGRATION_KEY = "thabit.migration.batchReviewSteps_v1";

const readStoredJson = <T>(key: string, fallback: T): T => {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeCompletedBatchPhases = (phases: Record<string, BatchPhase[]>) => {
  const normalized: Record<string, BatchPhase[]> = {};
  for (const [stepId, completed] of Object.entries(phases)) {
    normalized[stepId] = completed.map((phase) => {
      if ((phase as string) === "flashcards") return "writing-test";
      if ((phase as string) === "timed-mc") return "multiple-choice";
      return phase;
    });
  }
  return normalized;
};

export const applyBatchPhaseMigration = () => {
  if (window.localStorage.getItem(BATCH_PHASE_MIGRATION_KEY)) return;

  const phases = readStoredJson<Record<string, BatchPhase[]>>(COMPLETED_PHASES_STORAGE_KEY, {});
  window.localStorage.setItem(COMPLETED_PHASES_STORAGE_KEY, JSON.stringify(normalizeCompletedBatchPhases(phases)));
  window.localStorage.setItem(BATCH_PHASE_MIGRATION_KEY, "1");
};

/** Credit batch-review steps for users who already finished section or lesson tests. */
export const applyBatchReviewStepMigration = (allLessons: Lesson[] = lessons) => {
  if (window.localStorage.getItem(BATCH_REVIEW_STEP_MIGRATION_KEY)) return readStoredJson<string[]>(COMPLETED_STEPS_STORAGE_KEY, []);

  const completedStepIds = new Set(readStoredJson<string[]>(COMPLETED_STEPS_STORAGE_KEY, []));

  for (const lesson of allLessons) {
    const lessonFinalId = getLessonFinalStepId(lesson.id);
    const lessonFinalComplete = completedStepIds.has(lessonFinalId);

    for (const step of lesson.steps) {
      if (step.kind !== "batch-review") continue;

      const sectionTestId =
        step.section === "nouns"
          ? `${lesson.id}-noun-test`
          : step.section === "verbs"
            ? `${lesson.id}-verb-test`
            : step.section === "phrases"
              ? `${lesson.id}-phrase-test`
              : undefined;

      if (lessonFinalComplete || (sectionTestId && completedStepIds.has(sectionTestId))) {
        completedStepIds.add(step.id);
      }
    }
  }

  const migrated = [...completedStepIds];
  window.localStorage.setItem(COMPLETED_STEPS_STORAGE_KEY, JSON.stringify(migrated));
  window.localStorage.setItem(BATCH_REVIEW_STEP_MIGRATION_KEY, "1");
  return migrated;
};

export const isLessonStepId = (stepId: string, lessonId: string) => stepId.startsWith(`${lessonId}-`);

export const getLessonFinalStepId = (lessonId: string) => `${lessonId}-final`;

export const isLessonFinalComplete = (lessonId: string, completedStepIds: string[]) => completedStepIds.includes(getLessonFinalStepId(lessonId));

export const isLessonComplete = (lesson: Lesson, completedStepIds: string[]) => isLessonFinalComplete(lesson.id, completedStepIds);

export const getCurrentLesson = (allLessons: Lesson[], completedStepIds: string[]) => allLessons.find((lesson) => !isLessonComplete(lesson, completedStepIds));

export const getLessonStatus = (lesson: Lesson, completedStepIds: string[], allLessons: Lesson[]): LessonStatus => {
  if (isLessonComplete(lesson, completedStepIds)) return "complete";
  if (getCurrentLesson(allLessons, completedStepIds)?.id === lesson.id) return "current";
  return "locked";
};

export const countLessonHardItems = (lesson: Lesson) => {
  let count = lesson.nouns.filter((item) => item.hard).length + lesson.phrases.filter((item) => item.hard).length;
  for (const verb of lesson.verbs) {
    count += Object.values(verb.hardForms ?? {}).filter(Boolean).length;
  }
  return count;
};

const getTrackableSteps = (lesson: Lesson) => lesson.steps.filter((step) => TRACKABLE_STEP_KINDS.includes(step.kind));

const getSectionMemorizationSteps = (lesson: Lesson, section: SectionKind) =>
  lesson.steps.filter((step) => step.section === section && (step.kind === "batch" || step.kind === "batch-review"));

export const isSectionMemorizationComplete = (lesson: Lesson, section: SectionKind, completedStepIds: string[]) =>
  getSectionMemorizationSteps(lesson, section).every((step) => completedStepIds.includes(step.id));

const getBatchAndReviewSteps = (lesson: Lesson) => lesson.steps.filter((step) => step.kind === "batch" || step.kind === "batch-review");

export const getLessonProgressSummary = (lesson: Lesson, completedStepIds: string[], allLessons: Lesson[]): LessonProgressSummary => {
  const trackableSteps = getTrackableSteps(lesson);
  const status = getLessonStatus(lesson, completedStepIds, allLessons);

  if (status === "locked") {
    return { percent: 0, completedCount: 0, totalCount: trackableSteps.length };
  }

  if (status === "complete") {
    return { percent: 100, completedCount: trackableSteps.length, totalCount: trackableSteps.length };
  }

  const completedCount = trackableSteps.filter((step) => completedStepIds.includes(step.id)).length;
  const totalCount = trackableSteps.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return { percent, completedCount, totalCount };
};

export const getNextLessonStep = (lesson: Lesson, currentStepId: string) => {
  const index = lesson.steps.findIndex((step) => step.id === currentStepId);
  if (index === -1) return undefined;
  return lesson.steps[index + 1];
};

export const getEffectiveMemorizationSteps = (lesson: Lesson, completedStepIds: string[], allLessons: Lesson[]): LessonStep[] => {
  const status = getLessonStatus(lesson, completedStepIds, allLessons);

  if (status === "complete") {
    return lesson.steps.map((step) => ({ ...step, status: "complete" as const }));
  }

  if (status === "locked") {
    return lesson.steps.map((step) => ({ ...step, status: "locked" as const }));
  }

  const batchReviewSteps = getBatchAndReviewSteps(lesson);
  const firstOpenBatchReviewIndex = batchReviewSteps.findIndex((step) => !completedStepIds.includes(step.id));
  const sectionTests = lesson.steps.filter((step) => step.kind === "vocabulary-test");
  const allSectionTestsComplete = sectionTests.length > 0 && sectionTests.every((step) => completedStepIds.includes(step.id));

  const resolveStatus = (step: LessonStep): StepStatus => {
    if (completedStepIds.includes(step.id)) return "complete";

    if (step.kind === "batch" || step.kind === "batch-review") {
      const stepIndex = batchReviewSteps.findIndex((item) => item.id === step.id);
      if (stepIndex === -1) return "locked";
      if (stepIndex === firstOpenBatchReviewIndex) return "current";
      if (stepIndex === firstOpenBatchReviewIndex + 1) return "available";
      return "locked";
    }

    if (step.kind === "vocabulary-test" && step.section) {
      return isSectionMemorizationComplete(lesson, step.section, completedStepIds) ? "available" : "locked";
    }

    if (step.kind === "final-test") {
      return allSectionTestsComplete ? "available" : "locked";
    }

    return "locked";
  };

  return lesson.steps.map((step) => ({ ...step, status: resolveStatus(step) }));
};

export const needsInitialSetup = () => {
  if (window.localStorage.getItem(INITIAL_SETUP_STORAGE_KEY)) return false;
  return readStoredJson<string[]>(COMPLETED_STEPS_STORAGE_KEY, []).length === 0;
};

export const lessonSectionHasSteps = (lesson: Lesson, section: SectionKind) =>
  lesson.steps.some((step) => step.section === section && TRACKABLE_STEP_KINDS.includes(step.kind));

export const getInitialSetupSectionOptions = (lesson: Lesson) =>
  LESSON_SECTION_ORDER.filter((section) => lessonSectionHasSteps(lesson, section));

/** Credit all prior lessons and earlier sections in the target lesson as complete. */
export const applyInitialStudyPosition = (allLessons: Lesson[], lessonId: string, startSection: SectionKind) => {
  const targetLesson = allLessons.find((lesson) => lesson.id === lessonId);
  if (!targetLesson) {
    throw new Error(`Unknown lesson: ${lessonId}`);
  }

  const startSectionIndex = LESSON_SECTION_ORDER.indexOf(startSection);
  if (startSectionIndex === -1) {
    throw new Error(`Unknown section: ${startSection}`);
  }

  const completedStepIds = new Set<string>();
  const completedBatchPhases: Record<string, BatchPhase[]> = {};

  const creditSteps = (lesson: Lesson, sections?: SectionKind[]) => {
    for (const step of getTrackableSteps(lesson)) {
      if (sections && (!step.section || !sections.includes(step.section))) continue;
      completedStepIds.add(step.id);
      if (step.kind === "batch") {
        completedBatchPhases[step.id] = [...ALL_BATCH_PHASES];
      }
    }
  };

  for (const lesson of allLessons) {
    if (lesson.number < targetLesson.number) {
      creditSteps(lesson);
    }
  }

  creditSteps(targetLesson, LESSON_SECTION_ORDER.slice(0, startSectionIndex));

  const completedStepIdList = [...completedStepIds];

  window.localStorage.setItem(
    INITIAL_SETUP_STORAGE_KEY,
    JSON.stringify({
      lessonId,
      startSection,
      completedAt: new Date().toISOString(),
    }),
  );
  window.localStorage.setItem(COMPLETED_STEPS_STORAGE_KEY, JSON.stringify(completedStepIdList));
  window.localStorage.setItem(COMPLETED_PHASES_STORAGE_KEY, JSON.stringify(completedBatchPhases));

  return { completedStepIds: completedStepIdList, completedBatchPhases };
};

export const resetLessonProgress = (lessonId: string) => {
  const completedStepIds = readStoredJson<string[]>(COMPLETED_STEPS_STORAGE_KEY, []).filter((stepId) => !isLessonStepId(stepId, lessonId));
  const completedBatchPhases = Object.fromEntries(Object.entries(readStoredJson<Record<string, BatchPhase[]>>(COMPLETED_PHASES_STORAGE_KEY, {})).filter(([stepId]) => !isLessonStepId(stepId, lessonId)));

  window.localStorage.setItem(COMPLETED_STEPS_STORAGE_KEY, JSON.stringify(completedStepIds));
  window.localStorage.setItem(COMPLETED_PHASES_STORAGE_KEY, JSON.stringify(completedBatchPhases));
  clearLessonBatchSessions(lessonId);

  return { completedStepIds, completedBatchPhases };
};

/** One-time reset requested for lesson 2 progress and streak. */
export const applyLesson2AndStreakReset = () => {
  applyBatchPhaseMigration();
  const completedStepIds = applyBatchReviewStepMigration();

  if (window.localStorage.getItem(RESET_LESSON_2_MIGRATION_KEY)) {
    return {
      completedStepIds,
      completedBatchPhases: normalizeCompletedBatchPhases(readStoredJson<Record<string, BatchPhase[]>>(COMPLETED_PHASES_STORAGE_KEY, {})),
      didReset: false,
    };
  }

  window.localStorage.setItem(RESET_LESSON_2_MIGRATION_KEY, "1");
  const resetProgress = resetLessonProgress("lesson-2");

  return { ...resetProgress, didReset: true };
};

