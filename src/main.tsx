// @ts-nocheck
import "./styles.css";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleDot, Lock } from "lucide-react";
import {
  EXPOSURE_SAY_REPS_ARABIC,
  EXPOSURE_SAY_REPS_ENGLISH,
  EXPOSURE_WRITES,
  TEST_MISS_SAY_REPS_ARABIC,
  TEST_MISS_SAY_REPS_ENGLISH,
  TEST_MISS_VERB_FAMILY_SAY_ROUNDS,
  VERB_EXPOSURE_SAY_ROUNDS,
  VERB_EXPOSURE_WRITES,
  getLessonLevel,
  MEMORY_MATCH_CLEAN_RUNS,
  MATCH_SECONDS_PER_PAIR,
  MC_SECONDS,
} from "./config";
import { countNounFamilyUnits } from "./batching";
import { lessons } from "./data";
import { EnglishCue } from "./EnglishCue";
import { formatEnglishCueText, getEnglishAnswerInContext } from "./english-cue";
import {
  buildNounBrowseFamilies,
  buildPhraseBrowseRows,
  buildVerbBrowseBatches,
  buildVerbParadigmCells,
  getBatchFamilyId,
  getBatchExposureCards,
  getCachedLessonExposureCards,
  getFamilyMeaningLabel,
  getVerbFamilyEnglishStemLabel,
  getVerbFamilyHarf,
  getVerbFamilyBrowseMeaning,
  getVerbBrowseCells,
  getNounFamilyFormsForCard,
  getVerbFamilyFormsForCard,
  getVerbFamilyIdFromCardId,
  NOUN_FORM_ARABIC_LABELS,
  NOUN_FORM_ORDER,
  getVerbFormLabel,
  getBatchStudyCardCount,
  groupExposureCardsIntoExposureUnits,
  prepareBatchStudyCards,
  prepareLessonTestWritingCards,
  VERB_FORM_ORDER,
  VERB_HARF_ARABIC_LABEL,
  verbFormIndexToParadigmCellIndex,
  vocabularyImageUrl,
} from "./exposure-cards";
import { clearBatchSession, getBatchSession, getResumeBatchPhase, isBatchSessionValid, patchBatchSession, restoreStudyPrompts, restoreWritingStudyPrompts, saveBatchSessionPhase, serializeStudyPrompt } from "./batch-session";
import { getReviewableCardsForLesson, getStepContinueLabel, getVocabularyTestSection, getWritingConfigForStep, getWritingStudyCardsForStep, gradeDailyReviewPrompt, prepareDailyReviewStudyCards, prepareWithinBatchWritingTestCards, prepareWritingTestCardsForStep, toReviewableCard, usesFamilyWritingTest, usesNounFamilyWritingTest, usesVerbFamilyWritingTest } from "./lesson-study";
import { clearLessonMisses, recordLessonFamilyMiss } from "./lesson-misses";
import { warmVocabularyCache, useOfflineWarmProgress } from "./offline-cache";
import { bootstrapPwa } from "./pwa-bootstrap";
import {
  COMPLETED_PHASES_STORAGE_KEY,
  COMPLETED_STEPS_STORAGE_KEY,
  applyInitialStudyPosition,
  applyLesson2AndStreakReset,
  getCurrentLesson,
  getEffectiveMemorizationSteps,
  getInitialSetupSectionOptions,
  getLessonProgressSummary,
  getLessonStatus,
  getNextLessonStep,
  isLessonComplete,
  lessonSectionHasSteps,
  LESSON_SECTION_ORDER,
  needsInitialSetup,
} from "./progress";
import { applyGlobalNewCardStaggerMigration, applyNounFamilyReviewMigration, applyShorterNewCardStaggerMigration, applyStaggeredReviewScheduleMigration, applyVerbFamilyReviewMigration, buildDailyReviewQueue, getDailyReviewStats, recordMemorizationMiss, syncReviewPool } from "./review";
import { resetStreak, recordStudyActivity, readStreak } from "./streak";
import {
  BATCH_TEST_MC_CUE_SIDES,
  BATCH_TEST_WRITING_CONFIG,
  advanceStudyPromptQueue,
  buildDailyReviewFlashcardQueue,
  advanceWritingStudyQueue,
  advanceWritingStudyQueueAfterFamilyMiss,
  batchMultipleChoicePromptTotal,
  buildBatchMultipleChoiceStudyQueue,
  buildLessonTestWritingConfig,
  buildWithinBatchWritingStudyQueue,
  buildWritingStudyQueue,
  getBatchArabicMultipleChoiceOptions,
  getBatchEnglishMultipleChoiceOptions,
  getBatchMultipleChoiceCards,
  getEnglishAnswer,
  getArabicAnswer,
  getMultipleChoiceAnswerKey,
  getMultipleChoiceArabicOptionKey,
  getDailyReviewPromptAnswerCards,
  getDailyReviewPromptCardIds,
  isFirstVerbFamilyFormPart,
  isLastVerbFamilyFormPart,
  getVerbFamilyFormPartIndex,
  getVerbFamilyFormPartCount,
  isValidFamilyWritingQueue,
  shouldIncrementWritingProgress,
  writingTestFamilyTotal,
  WRITING_QUEUE_LOGIC_VERSION,
  type StudyPrompt,
} from "./study-queue";
import { shuffle } from "./shuffle";
import type { BatchPhase, ExposureCard, Lesson, LessonStep, SectionKind, VerbFormKey, VerbFamily } from "./types";
import { VocabularyImage } from "./VocabularyImage";
type ScreenState =
  | {
      name: "initial-setup";
    }
  | {
      name: "home";
    }
  | {
      name: "daily-review";
    }
  | {
      name: "lesson";
      lessonId: string;
    }
  | {
      name: "lesson-vocabulary";
      lessonId: string;
    }
  | {
      name: "batch";
      lessonId: string;
      stepId: string;
      phase: BatchPhase;
    }
  | {
      name: "vocabulary-test";
      lessonId: string;
      stepId: string;
    }
  | {
      name: "final-test";
      lessonId: string;
    };
const BATCH_PHASES: {
  id: BatchPhase;
  label: string;
  shortLabel: string;
  detail: string;
}[] = [
  {
    id: "exposure",
    label: "Exposure",
    shortLabel: "Expose",
    detail: "Say each pair aloud and tap the rep counter.",
  },
  {
    id: "memory-match",
    label: "Memory Match",
    shortLabel: "Match",
    detail: "Tap Start, then match every pair before time runs out. Clear the board twice in a row.",
  },
  {
    id: "multiple-choice",
    label: "Multiple Choice",
    shortLabel: "Choice",
    detail: "Pick the right answer from distractors in the same section, mostly from this batch.",
  },
  {
    id: "writing-test",
    label: "Test",
    shortLabel: "Test",
    detail: "Write Arabic from English cues, then mark correct or incorrect.",
  },
];
const APP_BRANDING = {
  english: "Thabit",
  arabic: "ثابت",
};
const SWIPE_EDGE_MAX_X = 36;
const SWIPE_BACK_MIN_DELTA_X = 72;

const getScrollStorageKey = (screen: ScreenState) => {
  if (screen.name === `home`) return `home`;
  if (screen.name === `lesson`) return `lesson:${screen.lessonId}`;
  return null;
};

const saveScrollPosition = (screen: ScreenState, container: HTMLDivElement | null, positions: Record<string, number>) => {
  let key = getScrollStorageKey(screen);
  if (key && container) positions[key] = container.scrollTop;
};

const restoreScrollPosition = (screen: ScreenState, container: HTMLDivElement | null, positions: Record<string, number>) => {
  if (!container) return;
  let key = getScrollStorageKey(screen);
  container.scrollTop = key ? (positions[key] ?? 0) : 0;
};

let bootstrapCache: {
  progress: ReturnType<typeof applyLesson2AndStreakReset>;
  streak: ReturnType<typeof readStreak>;
} | null = null;
const loadBootstrapState = () => {
  if (bootstrapCache) return bootstrapCache;
  const progress = applyLesson2AndStreakReset();
  if (progress.didReset) resetStreak();
  bootstrapCache = {
    progress,
    streak: readStreak(),
  };
  return bootstrapCache;
};
function App() {
  let [screen, setScreenState] = useState<ScreenState>(() => (needsInitialSetup() ? { name: "initial-setup" } : { name: "home" })),
    [n, r] = useState(() => loadBootstrapState().streak),
    [i, a] = useState(() => loadBootstrapState().progress.completedBatchPhases),
    [o, s] = useState(() => loadBootstrapState().progress.completedStepIds),
    scrollContainerRef = useRef(null),
    scrollPositionsRef = useRef({}),
    setScreen = useCallback((action) => {
      setScreenState((previous) => {
        saveScrollPosition(previous, scrollContainerRef.current, scrollPositionsRef.current);
        return typeof action === `function` ? action(previous) : action;
      });
    }, []);
  useLayoutEffect(() => {
    let apply = () => restoreScrollPosition(screen, scrollContainerRef.current, scrollPositionsRef.current);
    apply();
    requestAnimationFrame(apply);
  }, [screen]);
  (useEffect(() => {
    window.localStorage.setItem(COMPLETED_PHASES_STORAGE_KEY, JSON.stringify(i));
  }, [i]),
    useEffect(() => {
      window.localStorage.setItem(COMPLETED_STEPS_STORAGE_KEY, JSON.stringify(o));
    }, [o]),
    useEffect(() => {
      (applyStaggeredReviewScheduleMigration(),
        applyVerbFamilyReviewMigration(lessons),
        applyNounFamilyReviewMigration(lessons),
        syncReviewPool(lessons, o, getReviewableCardsForLesson),
        applyGlobalNewCardStaggerMigration(lessons, o, getReviewableCardsForLesson),
        applyShorterNewCardStaggerMigration(lessons, o, getReviewableCardsForLesson));
    }, [o]),
    useEffect(() => {
      void warmVocabularyCache();
    }, []));
  let c = screen.name !== `home` && screen.name !== `daily-review` && screen.name !== `initial-setup` ? lessons.find((t) => t.id === screen.lessonId) : void 0,
    u = screen.name !== `home` && screen.name !== `initial-setup`,
    d = useCallback(() => {
      setScreen((previous) => (previous.name === "lesson-vocabulary" || previous.name === "batch" || previous.name === "vocabulary-test" || previous.name === "final-test" ? { name: "lesson", lessonId: previous.lessonId } : { name: "home" }));
    }, []);
  useEffect(() => {
    if (!u) return;
    let e = null,
      t = (t) => {
        let n = t.touches[0];
        !n ||
          n.clientX > SWIPE_EDGE_MAX_X ||
          (e = {
            x: n.clientX,
            y: n.clientY,
          });
      },
      n = (t) => {
        if (!e) return;
        let n = t.touches[0];
        if (!n) return;
        let r = n.clientX - e.x,
          i = Math.abs(n.clientY - e.y);
        i > 48 && i > r && (e = null);
      },
      r = (t) => {
        if (!e) return;
        let n = t.changedTouches[0],
          r = e;
        if (((e = null), !n)) return;
        let i = n.clientX - r.x,
          a = Math.abs(n.clientY - r.y);
        i >= SWIPE_BACK_MIN_DELTA_X && a < i * 0.85 && d();
      },
      i = () => {
        e = null;
      };
    return (
      window.addEventListener(`touchstart`, t, {
        passive: !0,
      }),
      window.addEventListener(`touchmove`, n, {
        passive: !0,
      }),
      window.addEventListener(`touchend`, r, {
        passive: !0,
      }),
      window.addEventListener(`touchcancel`, i, {
        passive: !0,
      }),
      () => {
        (window.removeEventListener(`touchstart`, t), window.removeEventListener(`touchmove`, n), window.removeEventListener(`touchend`, r), window.removeEventListener(`touchcancel`, i));
      }
    );
  }, [u, d]);
  let f = (e, t) => {
      a((n) => {
        let r = n[e] ?? [];
        return r.includes(t)
          ? n
          : {
              ...n,
              [e]: [...r, t],
            };
      });
    },
    p = (e) => {
      (s((t) => (t.includes(e) ? t : [...t, e])), clearBatchSession(e), r(recordStudyActivity()));
    },
    h = (lessonId, startSection) => {
      let progress = applyInitialStudyPosition(lessons, lessonId, startSection);
      bootstrapCache = null;
      s(progress.completedStepIds);
      a(progress.completedBatchPhases);
      setScreen({ name: "lesson", lessonId });
    };
  return (
    <div className={`min-h-[100dvh] bg-[#07130f] text-stone-100`}>
      {
        <main
          className={`app-shell mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-2xl shadow-black/40`}
        >
          {<AppHeader screen={screen} lesson={c} onBack={d} />}
          {
            <div
              ref={scrollContainerRef}
              className={`no-scrollbar min-h-0 flex-1 ${(screen.name === `batch` && screen.phase === `writing-test`) || screen.name === `vocabulary-test` || screen.name === `final-test` || screen.name === `daily-review` ? `flex flex-col overflow-hidden` : `overflow-auto`}`}
            >
              {screen.name === `initial-setup` && <InitialSetupScreen onComplete={h} />}
              {screen.name === `home` && <HomeScreen streak={n} completedStepIds={o} onNavigate={setScreen} />}
              {screen.name === `daily-review` && <DailyReviewScreen completedStepIds={o} onRecordStudyDay={() => r(recordStudyActivity())} onNavigate={setScreen} />}
              {screen.name === `lesson` && c && <LessonScreen lesson={c} completedStepIds={o} completedBatchPhases={i} onNavigate={setScreen} />}
              {screen.name === `lesson-vocabulary` && c && <LessonVocabularyScreen lesson={c} />}
              {screen.name === `batch` && c && (
                <BatchScreen lesson={c} stepId={screen.stepId} phase={screen.phase} completedPhases={i[screen.stepId] ?? []} onPhaseComplete={f} onStepComplete={p} completedStepIds={o} completedBatchPhases={i} onNavigate={setScreen} />
              )}
              {screen.name === `vocabulary-test` && c && <VocabularyTestScreen lesson={c} stepId={screen.stepId} completedStepIds={o} onStepComplete={p} onNavigate={setScreen} />}
              {screen.name === `final-test` && c && <LessonReviewScreen lesson={c} completedStepIds={o} onStepComplete={p} onNavigate={setScreen} />}
            </div>
          }
        </main>
      }
    </div>
  );
}
function OfflineDownloadBanner({ warmState: e }) {
  let t = Math.min(100, Math.round((e.done / e.total) * 100));
  return (
    <section className={`offline-download-banner mb-5`} aria-live={`polite`}>
      {
        <div className={`flex items-center justify-between gap-3`}>
          {<p className={`section-label`}>{`Downloading for offline`}</p>}
          {
            <p className={`text-sm font-medium tabular-nums text-[#e8d7a1]`}>
              {t}
              {`%`}
            </p>
          }
        </div>
      }
      {
        <div className={`offline-prep-progress-track mt-3`}>
          {
            <div
              className={`offline-prep-progress-bar`}
              style={{
                width: `${t}%`,
              }}
            />
          }
        </div>
      }
      {
        <p className={`mt-2 text-xs leading-5 text-stone-500`}>
          {e.done.toLocaleString()}
          {` / `}
          {e.total.toLocaleString()}
          {` images · You can keep using the app on Wi‑Fi`}
        </p>
      }
    </section>
  );
}
function AppHeader({ screen: e, lesson: t, onBack: n }) {
  return (
    <header className={`relative isolate z-50 shrink-0 border-b border-emerald-950/80 bg-[#081511] px-4 py-3 backdrop-blur`}>
      {
        <div className={`grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2`}>
          {
            <div className={`flex justify-start`}>
              {e.name !== `home` && e.name !== `initial-setup` && (
                <button type={`button`} onClick={n} aria-label={`Go back`} className={`header-back-btn flex min-h-11 min-w-11 items-center justify-center border border-[#d6b56d]/15 text-[#d6b56d]`}>
                  {<ChevronLeft size={20} />}
                </button>
              )}
            </div>
          }
          {
            <div className={`text-center`}>
              {<p className={`arabic text-2xl font-bold tracking-wide text-[#e8d7a1]`}>{APP_BRANDING.arabic}</p>}
              {t && (
                <p className={`mt-0.5 text-xs text-stone-500`}>
                  {`Lesson `}
                  {t.number}
                  {`: `}
                  {t.title}
                </p>
              )}
            </div>
          }
          {<div />}
        </div>
      }
    </header>
  );
}
function LessonLevelHeader({ level: e }) {
  return (
    <div className={`border-b border-[#d6b56d]/10 bg-[#081511] py-3`} role={`separator`}>
      {<p className={`text-[0.65rem] font-semibold uppercase tracking-widest text-[#d6b56d]/65`}>{`${e.id} — ${e.label}`}</p>}
    </div>
  );
}
const INITIAL_SETUP_SECTION_LABELS: Record<SectionKind, string> = {
  nouns: `Nouns`,
  phrases: `Phrases`,
  verbs: `Verbs`,
};
function InitialSetupContinueDock({ disabled: e, onClick: t }) {
  return (
    <div className={`setup-continue-dock`}>
      {
        <button type={`button`} disabled={e} onClick={t} className={`setup-continue-btn`}>
          {`Continue`}
        </button>
      }
    </div>
  );
}
function InitialSetupScreen({ onComplete: e }) {
  let t = useMemo(() => getCurrentLesson(lessons, []) ?? lessons[0]!, []),
    [step, setStep] = useState(`lesson`),
    [n, r] = useState(() => t.id),
    i = useMemo(() => lessons.find((e) => e.id === n) ?? t, [n, t]),
    a = useMemo(() => getInitialSetupSectionOptions(i), [i]),
    [o, s] = useState(() => a[0] ?? `nouns`);
  useEffect(() => {
    a.includes(o) || s(a[0] ?? `nouns`);
  }, [a, o]);
  let c = useMemo(() => {
      let e = LESSON_SECTION_ORDER.indexOf(o),
        t = [];
      for (let n of lessons) {
        if (n.number < i.number) t.push(`Lesson ${n.number}`);
      }
      for (let n of LESSON_SECTION_ORDER.slice(0, e)) {
        if (lessonSectionHasSteps(i, n)) t.push(`${INITIAL_SETUP_SECTION_LABELS[n]} in Lesson ${i.number}`);
      }
      return t;
    }, [i, o]),
    l = a.length > 0;
  return (
    <div className={`px-5 py-8 pb-28`}>
      {step === `lesson` ? (
        <Fragment>
          {<p className={`section-label`}>{`Welcome`}</p>}
          {<h1 className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Where are you in the course?`}</h1>}
          {<p className={`mt-3 text-sm leading-6 text-stone-500`}>{`Choose the lesson you are working on now.`}</p>}
          {
            <div className={`mt-8 divide-y divide-[#d6b56d]/10 rounded-xl border border-[#d6b56d]/10`}>
              {lessons.map((e) => {
                let t = n === e.id;
                return (
                  <button key={e.id} type={`button`} onClick={() => r(e.id)} className={`click-row w-full px-4 py-4 text-left ${t ? `bg-[#d6b56d]/10` : ``}`} aria-pressed={t}>
                    {
                      <div>
                        {
                          <p className={`font-medium text-stone-50`}>
                            {`Lesson `}
                            {e.number}
                          </p>
                        }
                        {<p className={`text-sm text-stone-500`}>{e.title}</p>}
                      </div>
                    }
                  </button>
                );
              })}
            </div>
          }
          {<InitialSetupContinueDock disabled={!1} onClick={() => setStep(`section`)} />}
        </Fragment>
      ) : (
        <Fragment>
          {
            <button type={`button`} onClick={() => setStep(`lesson`)} className={`header-back-btn mb-4 flex min-h-11 w-fit items-center gap-1 border border-[#d6b56d]/15 px-3 text-sm text-[#d6b56d]`}>
              {<ChevronLeft size={18} />}
              {`Lessons`}
            </button>
          }
          {<p className={`section-label`}>{`Lesson ${i.number}`}</p>}
          {<h1 className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Where in this lesson?`}</h1>}
          {<p className={`mt-3 text-sm leading-6 text-stone-500`}>{i.title}</p>}
          {<p className={`mt-2 text-sm leading-6 text-stone-500`}>{`Pick the section you are starting from. Earlier sections and prior lessons will be marked complete.`}</p>}
          {
            <div className={`mt-8 grid grid-cols-1 gap-2`}>
              {a.map((t) => {
                let n = o === t;
                return (
                  <button
                    key={t}
                    type={`button`}
                    onClick={() => s(t)}
                    className={`rounded-xl border px-4 py-4 text-left transition ${n ? `border-[#d6b56d]/40 bg-[#d6b56d]/10 text-[#e8d7a1]` : `border-[#d6b56d]/10 text-stone-300 hover:border-[#d6b56d]/25`}`}
                    aria-pressed={n}
                  >
                    {INITIAL_SETUP_SECTION_LABELS[t]}
                  </button>
                );
              })}
            </div>
          }
          {c.length > 0 && (
            <section className={`mt-6 rounded-xl border border-[#d6b56d]/10 px-4 py-4`}>
              {<p className={`section-label`}>{`Will be marked complete`}</p>}
              {
                <ul className={`mt-3 space-y-1 text-sm text-stone-500`}>
                  {c.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            </section>
          )}
          {<InitialSetupContinueDock disabled={!l} onClick={() => e(n, o)} />}
        </Fragment>
      )}
    </div>
  );
}
function HomeScreen({ streak: e, completedStepIds: t, onNavigate: n }) {
  let r = useOfflineWarmProgress(),
    i = useMemo(() => (syncReviewPool(lessons, t, getReviewableCardsForLesson), getDailyReviewStats(lessons, t, getReviewableCardsForLesson)), [t]);
  return (
    <div className={`flex flex-1 flex-col px-5 py-6`}>
      {r.status === `running` && r.total > 0 && <OfflineDownloadBanner warmState={r} />}
      {r.status === `skipped` && (
        <section className={`offline-download-banner mb-5 border-[#d6b56d]/25`}>
          {<p className={`section-label`}>{`Offline download`}</p>}
          {<p className={`mt-2 text-sm leading-6 text-stone-500`}>{`Could not start saving vocabulary images. Check your connection and try again.`}</p>}
          {<button type={`button`} className={`final-test-link mt-3`} onClick={() => void warmVocabularyCache()}>{`Retry download`}</button>}
        </section>
      )}
      {
        <section className={`border-b border-[#d6b56d]/10 pb-5`}>
          {
            <p className={`mb-3 text-right text-xs text-[#d6b56d]/45`}>
              {
                <span className={`font-medium text-[#d6b56d]/80`}>
                  {e.current}
                  {` day streak`}
                </span>
              }
              {<span className={`mx-1.5 text-[#d6b56d]/25`}>{`/`}</span>}
              {`best `}
              {e.best}
            </p>
          }
          {
            <button
              onClick={() =>
                n({
                  name: `daily-review`,
                })
              }
              className={`click-row w-full pl-3 pr-1 text-left`}
            >
              {
                <div className={`min-w-0 flex-1`}>
                  {<p className={`section-label`}>{`Review`}</p>}
                  {
                    <p className={`mt-2 text-base font-medium text-stone-50`}>
                      {i.dueToday}
                      {` `}
                      {i.dueToday === 1 ? `card` : `cards`}
                      {` due today`}
                    </p>
                  }
                  {i.dueToday > 0 && i.reviewCount > 0 && i.newCount > 0 && (
                    <p className={`mt-0.5 text-sm text-stone-500`}>
                      {i.reviewCount}
                      {` reviews · `}
                      {i.newCount}
                      {` new`}
                    </p>
                  )}
                </div>
              }
              {<ChevronRight className={`text-[#d6b56d]/70`} size={16} />}
            </button>
          }
        </section>
      }
      {
        <section className={`pt-6`}>
          {<h2 className={`section-label mb-2`}>{`Lessons`}</h2>}
          {
            <div className={`divide-y divide-[#d6b56d]/10`}>
              {lessons.map((e, o) => {
                let r = getLessonStatus(e, t, lessons),
                  { percent: i } = getLessonProgressSummary(e, t, lessons),
                  a = getLessonLevel(e.number),
                  s = o > 0 ? getLessonLevel(lessons[o - 1]!.number) : null;
                return (
                  <Fragment key={e.id}>
                    {a && a.id !== s?.id && <LessonLevelHeader level={a} />}
                    <button
                      onClick={() =>
                        n({
                          name: `lesson`,
                          lessonId: e.id,
                        })
                      }
                      className={`click-row w-full py-4 pl-3 pr-1 text-left`}
                    >
                      {
                        <div className={`flex min-w-0 items-center gap-3`}>
                          {<LessonStatusIcon status={r} />}
                          {
                            <div className={`min-w-0`}>
                              {
                                <p className={`font-medium text-stone-50`}>
                                  {`Lesson `}
                                  {e.number}
                                </p>
                              }
                              {<p className={`text-sm text-stone-500`}>{e.title}</p>}
                              {r === `locked` && <p className={`mt-0.5 text-xs text-stone-600`}>{`Browse structure & vocabulary`}</p>}
                            </div>
                          }
                        </div>
                      }
                      {
                        <div className={`flex items-center gap-2 text-sm text-[#d6b56d]/75`}>
                          {<span>{r === `locked` ? `—` : `${i}%`}</span>}
                          {<ChevronRight size={14} />}
                        </div>
                      }
                    </button>
                  </Fragment>
                );
              })}
            </div>
          }
        </section>
      }
    </div>
  );
}
function LessonStatusIcon({ status: e }) {
  return e === `complete` ? <CheckCircle2 className={`text-emerald-400`} /> : e === `locked` ? <Lock className={`text-stone-600`} /> : <Circle className={`text-[#d6b56d]`} />;
}
function StepStatusIcon({ status: e }) {
  return e === `complete` ? <CheckCircle2 className={`text-emerald-400`} /> : e === `locked` ? <Lock className={`text-stone-600`} /> : e === `current` ? <CircleDot className={`text-[#d6b56d]`} /> : <Circle className={`text-[#d6b56d]/60`} />;
}
function LessonScreen({ lesson: e, completedStepIds: t, completedBatchPhases: l, onNavigate: n }) {
  let r = useMemo(() => getLessonStatus(e, t, lessons), [e, t]),
    i = useMemo(() => getCurrentLesson(lessons, t), [t]),
    a = useMemo(() => getEffectiveMemorizationSteps(e, t, lessons), [e, t]),
    o = useMemo(() => groupLessonSteps(a), [a]),
    { percent: s, completedCount: c, totalCount: u } = useMemo(() => getLessonProgressSummary(e, t, lessons), [e, t]),
    d = r === `locked`;
  return (
    <div className={`flex flex-1 flex-col px-5 py-6`}>
      {d && (
        <p className={`mb-4 rounded border border-[#d6b56d]/15 bg-[#d6b56d]/5 px-3 py-2.5 text-sm leading-snug text-stone-400`}>
          {`Browse only — finish `}
          {i ? `Lesson ${i.number}` : `your current lesson`}
          {` to unlock practice steps.`}
        </p>
      )}
      {
        <section className={`border-b border-[#d6b56d]/10 pb-6`}>
          {<p className={`section-label`}>{`Memorization Progress`}</p>}
          {
            <div className={`mt-2 flex items-end justify-between`}>
              {<p className={`text-4xl font-semibold tracking-tight text-stone-50`}>{d ? `—` : `${s}%`}</p>}
              {<p className={`text-sm text-stone-500`}>{d ? `${u} steps` : `${c}/${u} steps`}</p>}
            </div>
          }
          {!d && <ProgressBar value={s} />}
        </section>
      }
      {
        <button
          type={`button`}
          onClick={() =>
            n({
              name: `lesson-vocabulary`,
              lessonId: e.id,
            })
          }
          className={`click-row mt-5 w-full border-y border-[#d6b56d]/10 py-4 pl-3 pr-1 text-left`}
        >
          {
            <div className={`min-w-0`}>
              {<p className={`font-medium text-stone-50`}>{`Browse vocabulary`}</p>}
              {
                <p className={`text-sm text-stone-500`}>
                  {e.nouns.length}
                  {` nouns · `}
                  {e.phrases.length}
                  {` phrases · `}
                  {e.verbs.length}
                  {` verbs`}
                </p>
              }
            </div>
          }
          {<ChevronRight className={`shrink-0 text-[#d6b56d]/70`} size={16} />}
        </button>
      }
      {
        <div className={`space-y-8 pt-6`}>
          {<LessonStepSection title={`Nouns`} steps={o.nouns} lesson={e} completedBatchPhases={l} onNavigate={n} />}
          {<LessonStepSection title={`Phrases`} steps={o.phrases} lesson={e} completedBatchPhases={l} onNavigate={n} />}
          {<LessonStepSection title={`Verbs`} steps={o.verbs} lesson={e} completedBatchPhases={l} onNavigate={n} />}
          {<LessonStepSection title={`Test`} steps={o.final} lesson={e} completedBatchPhases={l} onNavigate={n} />}
        </div>
      }
    </div>
  );
}
function groupLessonSteps(e) {
  return {
    nouns: e.filter((e) => e.section === `nouns`),
    verbs: e.filter((e) => e.section === `verbs`),
    phrases: e.filter((e) => e.section === `phrases`),
    final: e.filter((e) => !e.section),
  };
}
function LessonStepSection({ title: e, steps: t, lesson: n, completedBatchPhases: i, onNavigate: r }) {
  return t.length === 0 ? null : (
    <section>
      {<h2 className={`section-label mb-2`}>{e}</h2>}
      {
        <div className={`divide-y divide-[#d6b56d]/10`}>
          {t.map((e) => (
            <button disabled={e.status === `locked`} onClick={() => openLessonStep(n.id, e, r, i)} className={`click-row w-full py-4 pl-3 pr-1 text-left disabled:cursor-default disabled:opacity-35`} aria-disabled={e.status === `locked`}>
              {
                <div className={`flex min-w-0 items-center gap-3`}>
                  {<StepStatusIcon status={e.status} />}
                  {
                    <div className={`min-w-0`}>
                      {<p className={`font-medium text-stone-50`}>{e.title}</p>}
                      {
                        <p className={`text-sm text-stone-500`}>
                          {e.itemCount}
                          {e.itemCount === 1 ? ` item` : ` items`}
                        </p>
                      }
                    </div>
                  }
                </div>
              }
              {
                <div className={`flex items-center gap-2`}>
                  {e.status === `current` && <span className={`text-xs font-semibold uppercase tracking-widest text-[#d6b56d]`}>{`Next`}</span>}
                  {e.status === `locked` && <span className={`text-xs font-semibold uppercase tracking-widest text-stone-600`}>{`Locked`}</span>}
                  {e.status !== `locked` && <ChevronRight className={`text-[#d6b56d]/70`} size={14} />}
                </div>
              }
            </button>
          ))}
        </div>
      }
    </section>
  );
}
function openLessonStep(e, t, n, r = {}) {
  if (t.kind === `batch`) {
    n({
      name: `batch`,
      lessonId: e,
      stepId: t.id,
      phase: getResumeBatchPhase(t.id, r[t.id] ?? []),
    });
    return;
  }
  if (t.kind === `batch-review` || t.kind === `vocabulary-test`) {
    n({
      name: `vocabulary-test`,
      lessonId: e,
      stepId: t.id,
    });
    return;
  }
  if (t.kind === `final-test`) {
    n({
      name: `final-test`,
      lessonId: e,
    });
  }
}
const getLearnUnitLabel = (_lesson: Lesson, _stepId: string) => `Batch`;
function BatchScreen({ lesson: e, stepId: t, phase: n, completedPhases: r, completedStepIds: i, completedBatchPhases: l, onPhaseComplete: a, onStepComplete: o, onNavigate: s }) {
  let c = e.steps.find((e) => e.id === t),
    u = getLearnUnitLabel(e, t),
    d = i.includes(t) || isLessonComplete(e, i) ? BATCH_PHASES.map((e) => e.id) : r,
    f = getBatchStudyCardCount(getBatchExposureCards(e, t)),
    m = useCallback(
      (n) => {
        n.name === `batch` && n.stepId === t && saveBatchSessionPhase(t, n.phase, f);
        s(n);
      },
      [s, t, f],
    );
  useEffect(() => {
    f > 0 && saveBatchSessionPhase(t, n, f);
  }, [t, n, f]);
  return n === `exposure` ? (
    <ExposurePhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={d} onPhaseComplete={a} onNavigate={m} />
  ) : n === `memory-match` ? (
    <MemoryMatchPhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={d} onPhaseComplete={a} onNavigate={m} />
  ) : n === `multiple-choice` ? (
    <MultipleChoicePhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={d} onPhaseComplete={a} onNavigate={m} />
  ) : n === `writing-test` ? (
    <WritingTestPhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={d} completedStepIds={i} completedBatchPhases={l} onPhaseComplete={a} onStepComplete={o} onNavigate={m} />
  ) : null;
}
function ExposureSayLoopPanel({ card: e, heading: t, onComplete: n, arabicReps: r = TEST_MISS_SAY_REPS_ARABIC, englishReps: i = TEST_MISS_SAY_REPS_ENGLISH, cueContextCards: cueContext }) {
  let [a, o] = useState(`arabic`),
    [s, c] = useState(r),
    [u, d] = useState(i),
    m = a === `arabic` ? s : u,
    h = s === 0 && u === 0,
    g = useRef(!1);
  useEffect(() => {
    h && !g.current && ((g.current = !0), n());
  }, [h, n]);
  return (
    <section className={`exposure-say-shell min-h-0 flex-1 flex flex-col overflow-hidden py-3`}>
      {t && <p className={`section-label shrink-0 text-center`}>{t}</p>}
      {<p className={`mt-2 shrink-0 text-center text-xs text-stone-500`}>{`Repeat what's highlighted, then tap Say.`}</p>}
      {
        <div className={`min-h-0 flex-1 overflow-auto border-y border-[#d6b56d]/10 py-5 text-center`}>
          {<div className={a === `arabic` ? `exposure-say-face is-active` : `exposure-say-face is-dimmed`}>{<ArabicCardFace card={e} />}</div>}
          {
            <div className={`mt-3 ${a === `english` ? `exposure-say-face is-active` : `exposure-say-face is-dimmed`}`}>
              <EnglishCue card={e} contextCards={cueContext} size={`sm`} showImageHint={!1} />
            </div>
          }
        </div>
      }
      {
        <div className={`exposure-say-action-zone shrink-0`} aria-label={`Say button area`}>
          {
            <div className={`exposure-say-orb-wrap`}>
              {
                <button
                  type={`button`}
                  disabled={h}
                  onClick={() => {
                    if (!h) {
                      if (a === `arabic`) {
                        (c((e) => Math.max(0, e - 1)), o(`english`));
                        return;
                      }
                      (d((e) => Math.max(0, e - 1)), o(`arabic`));
                    }
                  }}
                  className={`repeat-orb compact-repeat-orb disabled:opacity-45`}
                  aria-label={`Say ${a === `arabic` ? `Arabic` : `English`} — ${m} left`}
                >
                  {<span className={`text-2xl font-semibold leading-none`}>{m}</span>}
                  {<span className={`mt-1 text-[0.56rem] font-semibold uppercase tracking-[0.16em]`}>{`say`}</span>}
                </button>
              }
            </div>
          }
        </div>
      }
    </section>
  );
}
function VerbFamilySayLoopPanel({ forms: e, heading: t, onComplete: n, rounds: r = TEST_MISS_VERB_FAMILY_SAY_ROUNDS, sayRound: i, sayStep: a, onAdvance: o }) {
  let s = getVerbFamilyEnglishStemLabel(e),
    harf = getVerbFamilyHarf(e),
    c = i !== void 0 && a !== void 0 && o,
    [u, d] = useState(0),
    [f, p] = useState(0),
    m = c ? i : u,
    h = c ? a : f,
    g = h === 0,
    _ = g ? null : h - 1,
    v = g ? `English` : e[_]?.label,
    y = m >= r,
    x = () => {
      if (y) return;
      if (h < e.length) {
        let t = h + 1;
        c ? o(m, t) : p(t);
        return;
      }
      let t = m + 1;
      if (c) {
        o(t, 0);
        return;
      }
      if (t >= r) {
        n?.();
        return;
      }
      (d(t), p(0));
    };
  return (
    <section className={`exposure-say-shell min-h-0 flex-1 flex flex-col overflow-hidden py-3`}>
        {
          <div className={`verb-family-say-header shrink-0 text-center`}>
            {t && <p className={`section-label`}>{t}</p>}
            {s && (
              <p lang={`en`} dir={`ltr`} className={`verb-family-meaning${g ? ` is-active` : ` is-dimmed`}${t ? ` mt-2` : ``}`}>
                {s}
              </p>
            )}
            {harf && (
              <p lang={`ar`} dir={`rtl`} className={`verb-family-harf mt-1 text-sm text-[#d6b56d]/70`}>
                {`${VERB_HARF_ARABIC_LABEL}: ${harf}`}
              </p>
            )}
            {
              <p className={`mt-1 text-xs text-stone-500`}>
                {`Round `}
                {Math.min(m + 1, r)}
                {`/`}
                {r}
                {v ? (
                  <Fragment>
                    {` · `}
                    {g ? (
                      v
                    ) : (
                      <span lang={`ar`} dir={`rtl`}>
                        {v}
                      </span>
                    )}
                  </Fragment>
                ) : (
                  ``
                )}
              </p>
            }
            {g && <p className={`mt-2 text-xs text-stone-500`}>{`Say the English meaning, then each Arabic form.`}</p>}
          </div>
        }
        {<div className={`verb-family-paradigm-wrap min-h-0 flex-1 overflow-y-auto py-3`}>{<VerbFamilyParadigmGrid forms={e} activeFormIndex={_} />}</div>}
        {
          <div className={`exposure-say-action-zone shrink-0`} aria-label={`Say button area`}>
            {
              <div className={`exposure-say-orb-wrap`}>
                {
                  <button type={`button`} disabled={y && !c} onClick={x} className={`repeat-orb compact-repeat-orb disabled:opacity-45`} aria-label={g ? `Say English` : `Say Arabic`}>
                    {<span className={`mt-1 text-[0.56rem] font-semibold uppercase tracking-[0.16em]`}>{`say`}</span>}
                  </button>
                }
              </div>
            }
          </div>
        }
      </section>
  );
}
function VerbFamilyParadigmGrid({ forms: e, activeFormIndex: t, compact: n = !1 }) {
  let cells = buildVerbParadigmCells(e),
    highlightIndex = verbFormIndexToParadigmCellIndex(e, t),
    r = cells.length >= 5 ? `forms-${cells.length}` : ``,
    i = t === -1,
    a = typeof t === `number` && t >= 0;
  return (
    <div className={`verb-family-paradigm min-h-0 shrink ${n ? `verb-family-paradigm-test` : ``} ${r}`} data-form-count={cells.length}>
      {cells.map((cell, cellIndex) => {
        let isHarf = cell.id.endsWith(`-harf`),
          o = i || (a && cellIndex === highlightIndex);
        return (
          <div key={cell.id} className={`verb-family-paradigm-cell${isHarf ? ` is-harf` : ``}${o ? (i ? ` is-complete` : ` is-active`) : ``}`}>
            {
              <p className={`verb-family-paradigm-label`} lang={`ar`} dir={`rtl`}>
                {cell.label}
              </p>
            }
            {cell.imageUrl ? (
              <VocabularyImage src={cell.imageUrl} alt={cell.label ?? cell.arabic} className={`verb-family-paradigm-image`} />
            ) : (
              <p lang={`ar`} dir={`rtl`} className={`verb-family-paradigm-arabic arabic`}>
                {cell.arabic}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
function VerbFormWriteCue({ card: e, onClearPad: t }) {
  let [n, r] = useState(!1),
    i = () => r(!1);
  return (
    <div className={`exposure-write-cue shrink-0`}>
      {
        <div className={`mb-2 flex items-center justify-between gap-3`}>
          {<p className={`section-label`}>{`Write form`}</p>}
          {
            <div className={`flex items-center gap-2`}>
              {<button type={`button`} onClick={t} className={`writing-surface-action text-xs font-semibold text-stone-500`}>{`Clear pad`}</button>}
              {
                <button
                  type={`button`}
                  className={`writing-surface-action exposure-write-cue-peek rounded px-2.5 py-1.5`}
                  aria-label={`Hold to reveal form`}
                  onPointerDown={() => r(!0)}
                  onPointerUp={i}
                  onPointerLeave={i}
                  onPointerCancel={i}
                >{`Hold to reveal`}</button>
              }
            </div>
          }
        </div>
      }
      {<p className={`mb-2 text-center text-[0.68rem] leading-snug text-stone-500`}>{`Write the Arabic for the highlighted form.`}</p>}
      {
        <div className={`space-y-2 text-center`}>
          {
            <p className={`writing-cue-copy text-sm font-semibold text-[#d6b56d]/80`} lang={`ar`} dir={`rtl`}>
              {e.label}
            </p>
          }
          {n &&
            (e.imageUrl ? (
              <VocabularyImage src={e.imageUrl} alt={e.arabic} className={`writing-cue-copy exposure-write-cue-image opacity-90`} />
            ) : (
              <div lang={`ar`} dir={`rtl`} className={`writing-cue-copy exposure-write-cue-text arabic text-2xl font-semibold text-[#e8d7a1]/90`}>
                {e.arabic}
              </div>
            ))}
        </div>
      }
    </div>
  );
}
function getExposureUnitLabel(e, t) {
  return Array.isArray(e) ? getFamilyMeaningLabel(e) || `Family ${t + 1}` : formatEnglishCueText(e.english) || e.label || `Word ${t + 1}`;
}
function getExposureUnitArabic(e) {
  return (Array.isArray(e) ? e[0]?.arabic : e.arabic) ?? ``;
}
function ExposureActionBar({ onSkip: e, skipLabel: t = `Already know this`, onReviewEarlier: n, showReviewEarlier: r }) {
  return (
    <div className={`exposure-skip-bar`}>
      {
        r ? (
          <button type={`button`} onClick={n} className={`exposure-skip-bar-btn`}>{`Earlier in batch`}</button>
        ) : (
          <span aria-hidden={`true`} />
        )
      }
      {
        <button type={`button`} onClick={e} className={`exposure-skip-bar-btn`}>
          {t}
        </button>
      }
    </div>
  );
}
function ExposureUnitReviewSheet({ units: e, maxIndex: t, currentIndex: n, open: r, onClose: i, onSelect: a }) {
  if (!r || t < 0) return null;
  let o = e.slice(0, t + 1);
  return (
    <Fragment>
      {<button type={`button`} className={`exposure-review-sheet-backdrop`} aria-label={`Close review list`} onClick={i} />}
      {
        <div className={`exposure-review-sheet`} role={`dialog`} aria-modal={`true`} aria-label={`Review earlier words`}>
          {<p className={`section-label`}>{`Review earlier words in this batch`}</p>}
          {<p className={`mt-1 text-sm text-stone-500`}>{`Pick a word from this batch to run exposure again.`}</p>}
          {
            <div className={`exposure-review-sheet-list mt-4`}>
              {o.map((e, t) => (
                <button
                  key={t}
                  type={`button`}
                  className={`exposure-review-sheet-item${t === n ? ` is-current` : ``}`}
                  onClick={() => {
                    (a(t), i());
                  }}
                >
                  {
                    <div className={`min-w-0`}>
                      {<p className={`truncate text-sm font-medium text-stone-100`}>{getExposureUnitLabel(e, t)}</p>}
                      {
                        getExposureUnitArabic(e) && (
                          <p lang={`ar`} dir={`rtl`} className={`arabic mt-0.5 truncate text-base text-[#e8d7a1]/85`}>
                            {getExposureUnitArabic(e)}
                          </p>
                        )
                      }
                    </div>
                  }
                  {t === n && <span className={`shrink-0 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#d6b56d]`}>{`Current`}</span>}
                </button>
              ))}
            </div>
          }
          {
            <button type={`button`} onClick={i} className={`nav-text-action mt-4 w-full text-stone-500`}>
              {`Close`}
            </button>
          }
        </div>
      }
    </Fragment>
  );
}

function VerbFamilyExposurePhase({ lesson: e, stepId: t, stepTitle: n, families: r, cardCount: i, completedPhases: a, onPhaseComplete: o, onNavigate: s }) {
  let c = getBatchSession(t),
    u = isBatchSessionValid(c, i) && c?.exposure?.verbFamilyMode ? c.exposure : void 0,
    [d, f] = useState(() => Math.min(u?.cardIndex ?? 0, Math.max(0, r.length - 1))),
    [p, m] = useState(u?.sayRound ?? 0),
    [h, g] = useState(u?.formIndex ?? 0),
    [x, S] = useState(u?.writeRound ?? 0),
    [C, w] = useState(u?.writeFormIndex ?? 0),
    [D, k] = useState(u?.isExtraPractice ?? !1),
    [le, M] = useState(!1),
    [N, re] = useState(0),
    [ie, ae] = useState(!1),
    [reviewPickerOpen, setReviewPickerOpen] = useState(!1),
    oe = r[d] ?? [],
    se = getFamilyMeaningLabel(oe),
    ue = p >= VERB_EXPOSURE_SAY_ROUNDS,
    de = x >= VERB_EXPOSURE_WRITES,
    fe = ue && de && !D,
    pe = ue && (!de || D),
    me = D ? x + 1 : Math.min(x + 1, VERB_EXPOSURE_WRITES),
    advanceToNextFamily = useCallback(() => {
      let n = d + 1;
      if (n < r.length) {
        (f(n), m(0), g(0), S(0), w(0), k(!1), M(!1), ae(!1), re((e) => e + 1));
        return;
      }
      (o(t, `exposure`),
        s({
          name: `batch`,
          lessonId: e.id,
          stepId: t,
          phase: `memory-match`,
        }));
    }, [d, r.length, t, e.id, o, s]),
    _e = () => {
      (k(!0), S(0), w(0), M(!1), ae(!1), re((e) => e + 1));
    },
    ve = () => re((e) => e + 1),
    restartFamilyAt = useCallback((e) => {
      (f(e), m(0), g(0), S(0), w(0), k(!1), M(!1), ae(!1), re((t) => t + 1));
    }, []),
    showReviewEarlier = r.length > 1 && (d > 0 || fe),
    reviewMaxIndex = fe ? d : d - 1;
  useEffect(() => {
    i > 0 &&
      patchBatchSession(t, {
        phase: `exposure`,
        cardCount: i,
        exposure: {
          cardIndex: d,
          arabicRepsLeft: 0,
          englishRepsLeft: 0,
          sayLanguage: `arabic`,
          writeRepsDone: x,
          writeLanguage: `arabic`,
          isExtraPractice: D,
          verbFamilyMode: !0,
          sayRound: p,
          formIndex: h,
          writeRound: x,
          writeFormIndex: C,
        },
      });
  }, [t, i, d, p, h, x, D, C]);
  if (!oe.length)
    return (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
        {<p className={`section-label`}>{n}</p>}
        {<p className={`mt-4 text-stone-400`}>{`No verb forms found for this family.`}</p>}
      </div>
    );
  return (
    <div className={`flex h-full min-h-0 flex-col px-5 ${pe ? `overflow-hidden py-4` : `py-5`}`}>
      {<BatchStepMeta stepTitle={n} progress={`${d + 1}/${r.length}`} />}
      {<PhaseRail active={`exposure`} completedPhases={a} lessonId={e.id} stepId={t} onNavigate={s} />}
      {
        <ExposureActionBar
          onSkip={advanceToNextFamily}
          skipLabel={`Already know this family`}
          showReviewEarlier={showReviewEarlier}
          onReviewEarlier={() => setReviewPickerOpen(!0)}
        />
      }
      {
        <ExposureUnitReviewSheet
          units={r}
          maxIndex={reviewMaxIndex}
          currentIndex={d}
          open={reviewPickerOpen}
          onClose={() => setReviewPickerOpen(!1)}
          onSelect={restartFamilyAt}
        />
      }
      {fe ? (
        <section className={`exposure-word-choice min-h-0 flex-1 flex flex-col justify-center py-6 text-center`}>
          {se && (
            <p lang={`en`} dir={`ltr`} className={`verb-family-meaning`}>
              {se}
            </p>
          )}
          {<VerbFamilyParadigmGrid forms={oe} activeFormIndex={-1} />}
          {
            <div className={`mt-8 flex flex-col items-center gap-2`}>
              {
                <button type={`button`} onClick={advanceToNextFamily} className={`nav-text-action text-[#e8d7a1]`}>
                  {d === r.length - 1 ? `Continue to Match` : `Next family`}
                </button>
              }
              {<button type={`button`} onClick={_e} className={`text-xs font-semibold text-stone-600`}>{`More practice on this family`}</button>}
            </div>
          }
        </section>
      ) : pe ? (
        <div className={`exposure-write-shell min-h-0 flex-1 overflow-hidden py-1`}>
          {
            <WritingSurfaceHost isDrawing={ie}>
              {<VerbFormWriteCue card={oe[C] ?? oe[0]!} onClearPad={ve} />}
              {<MultiStripWritingPad clearToken={N} onHasInkChange={M} onDrawingChange={ae} />}
            </WritingSurfaceHost>
          }
          {
            <div className={`exposure-write-actions mt-2 shrink-0`}>
              {
                <Fragment>
                  {
                    <p className={`exposure-write-rep${D ? ` is-extra-practice` : ``}`} aria-label={D ? `Extra practice repetition ${me}` : `Repetition ${me} of ${VERB_EXPOSURE_WRITES}`}>
                      {D ? (
                        <Fragment>
                          {<span className={`exposure-write-rep-current`}>{me}</span>}
                          {<span className={`exposure-write-rep-sep`}>{`·`}</span>}
                          {<span className={`exposure-write-rep-total`}>{`extra`}</span>}
                        </Fragment>
                      ) : (
                        <Fragment>
                          {<span className={`exposure-write-rep-current`}>{me}</span>}
                          {<span className={`exposure-write-rep-sep`}>{`/`}</span>}
                          {<span className={`exposure-write-rep-total`}>{VERB_EXPOSURE_WRITES}</span>}
                        </Fragment>
                      )}
                    </p>
                  }
                  {
                    <div className={`exposure-write-steps mt-1.5`} aria-label={`Writing steps for this repetition`}>
                      {<span className={`is-active`}>{`Arabic`}</span>}
                      {oe[C]?.label && (
                        <span className={`is-active`} lang={`ar`} dir={`rtl`}>
                          {oe[C].label}
                        </span>
                      )}
                    </div>
                  }
                </Fragment>
              }
              {
                <div className={`mt-2 flex flex-col items-center gap-2`}>
                  {
                    <button
                      type={`button`}
                      disabled={!le}
                      onClick={() => {
                        if (!le) return;
                        let e = C + 1,
                          t = x;
                        if (e >= oe.length) {
                          ((e = 0), (t = x + 1));
                        }
                        if (D && t >= 1) {
                          (k(!1), S(VERB_EXPOSURE_WRITES), w(0), M(!1), ae(!1), ve());
                          return;
                        }
                        if (!D && t >= VERB_EXPOSURE_WRITES) {
                          (S(t), w(0), M(!1), ae(!1), ve());
                          return;
                        }
                        (w(e), S(t), M(!1), ae(!1), ve());
                      }}
                      className={`nav-text-action text-[#e8d7a1] disabled:text-stone-700 disabled:opacity-40`}
                    >{`Done`}</button>
                  }
                  {D && (
                    <button type={`button`} onClick={advanceToNextFamily} className={`text-xs font-semibold text-stone-600`}>
                      {d === r.length - 1 ? `Continue to Match` : `Next family`}
                    </button>
                  )}
                </div>
              }
            </div>
          }
        </div>
      ) : (
        <VerbFamilySayLoopPanel forms={oe} rounds={VERB_EXPOSURE_SAY_ROUNDS} sayRound={p} sayStep={h} onAdvance={(e, t) => (m(e), g(t))} />
      )}
    </div>
  );
}
function ExposurePhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, onPhaseComplete: i, onNavigate: a }) {
  let o = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    l = useMemo(() => groupExposureCardsIntoExposureUnits(o), [o]);
  if (o[0]?.section === `verbs` || o[0]?.section === `nouns`) {
    return <VerbFamilyExposurePhase lesson={e} stepId={t} stepTitle={n} families={l} cardCount={l.length} completedPhases={r} onPhaseComplete={i} onNavigate={a} />;
  }
  let P = getBatchSession(t),
    L = isBatchSessionValid(P, o.length) ? P?.exposure : undefined,
    [s, c] = useState(() => Math.min(L?.cardIndex ?? 0, Math.max(0, o.length - 1))),
    [u, d] = useState(L?.arabicRepsLeft ?? EXPOSURE_SAY_REPS_ARABIC),
    [f, p] = useState(L?.englishRepsLeft ?? EXPOSURE_SAY_REPS_ENGLISH),
    [m, h] = useState(L?.sayLanguage ?? `arabic`),
    [v, y] = useState(L?.writeRepsDone ?? 0),
    [b, x] = useState(0),
    [S, C] = useState(L?.writeLanguage ?? `arabic`),
    [w, T] = useState(!1),
    [isExtraPractice, setIsExtraPractice] = useState(L?.isExtraPractice ?? !1),
    [isPadDrawing, setIsPadDrawing] = useState(!1),
    [reviewPickerOpen, setReviewPickerOpen] = useState(!1),
    E = o[s],
    D = u === 0 && f === 0,
    k = D,
    le = v >= EXPOSURE_WRITES,
    M = k && le && !isExtraPractice,
    N = k && !M,
    re = m === `arabic` ? u : f,
    ie = (e) => {
      (c(e), d(EXPOSURE_SAY_REPS_ARABIC), p(EXPOSURE_SAY_REPS_ENGLISH), h(`arabic`), y(0), C(`arabic`), setIsExtraPractice(!1), setIsPadDrawing(!1), T(!1), x((n) => n + 1));
    },
    ae = () => x((e) => e + 1),
    advanceToNextWord = useCallback(() => {
      let n = s + 1;
      if (n < o.length) {
        ie(n);
        return;
      }
      (i(t, `exposure`),
        a({
          name: `batch`,
          lessonId: e.id,
          stepId: t,
          phase: `memory-match`,
        }));
    }, [s, o.length, t, e.id, i, a]),
    se = () => {
      (setIsExtraPractice(!0), C(`arabic`), T(!1), ae());
    },
    ce = isExtraPractice ? v + 1 : Math.min(v + 1, EXPOSURE_WRITES),
    showReviewEarlier = o.length > 1 && (s > 0 || M),
    reviewMaxIndex = M ? s : s - 1;
  useEffect(() => {
    o.length > 0 &&
      patchBatchSession(t, {
        phase: `exposure`,
        cardCount: o.length,
        exposure: {
          cardIndex: s,
          arabicRepsLeft: u,
          englishRepsLeft: f,
          sayLanguage: m,
          writeRepsDone: v,
          writeLanguage: S,
          isExtraPractice,
        },
      });
  }, [t, o.length, s, u, f, m, v, S, isExtraPractice]);
  return E ? (
    <div className={`flex h-full min-h-0 flex-col px-5 ${k ? `overflow-hidden py-4` : `py-5`}`}>
      {<BatchStepMeta stepTitle={n} progress={`${s + 1}/${o.length}`} />}
      {<PhaseRail active={`exposure`} completedPhases={r} lessonId={e.id} stepId={t} onNavigate={a} />}
      {
        <ExposureActionBar
          onSkip={advanceToNextWord}
          showReviewEarlier={showReviewEarlier}
          onReviewEarlier={() => setReviewPickerOpen(!0)}
        />
      }
      {
        <ExposureUnitReviewSheet
          units={o}
          maxIndex={reviewMaxIndex}
          currentIndex={s}
          open={reviewPickerOpen}
          onClose={() => setReviewPickerOpen(!1)}
          onSelect={ie}
        />
      }
      {M ? (
        <section className={`exposure-word-choice min-h-0 flex-1 flex flex-col justify-center py-6 text-center`}>
          {<ArabicCardFace card={E} />}
          {
            <div className={`mt-3`}>
              <EnglishCue card={E} contextCards={o} size={`sm`} showImageHint={!0} />
            </div>
          }
          {
            <div className={`mt-8 flex flex-col items-center gap-2`}>
              {
                <button type={`button`} onClick={advanceToNextWord} className={`nav-text-action text-[#e8d7a1]`}>
                  {s === o.length - 1 ? `Continue to Match` : `Next Word`}
                </button>
              }
              {<button type={`button`} onClick={se} className={`text-xs font-semibold text-stone-600`}>{`More practice on this word`}</button>}
            </div>
          }
        </section>
      ) : N ? (
        <div className={`exposure-write-shell min-h-0 flex-1 overflow-hidden py-1`}>
          {
            <WritingSurfaceHost isDrawing={isPadDrawing}>
              {<ExposureWriteCue card={E} writingLanguage={S} onClearPad={ae} cueContextCards={o} />}
              {<MultiStripWritingPad clearToken={b} onHasInkChange={T} onDrawingChange={setIsPadDrawing} />}
            </WritingSurfaceHost>
          }
          {
            <div className={`exposure-write-actions mt-2 shrink-0`}>
              {
                <Fragment>
                  {
                    <p className={`exposure-write-rep${isExtraPractice ? ` is-extra-practice` : ``}`} aria-label={isExtraPractice ? `Extra practice repetition ${ce}` : `Repetition ${ce} of ${EXPOSURE_WRITES}`}>
                      {isExtraPractice ? (
                        <Fragment>
                          {<span className={`exposure-write-rep-current`}>{ce}</span>}
                          {<span className={`exposure-write-rep-sep`}>{`·`}</span>}
                          {<span className={`exposure-write-rep-total`}>{`extra`}</span>}
                        </Fragment>
                      ) : (
                        <Fragment>
                          {<span className={`exposure-write-rep-current`}>{ce}</span>}
                          {<span className={`exposure-write-rep-sep`}>{`/`}</span>}
                          {<span className={`exposure-write-rep-total`}>{EXPOSURE_WRITES}</span>}
                        </Fragment>
                      )}
                    </p>
                  }
                  {
                    <div className={`exposure-write-steps mt-1.5`} aria-label={`Writing steps for this repetition`}>
                      {<span className={S === `arabic` ? `is-active` : `is-done`}>{`Arabic`}</span>}
                      {<span className={S === `english` ? `is-active` : ``}>{`English`}</span>}
                    </div>
                  }
                </Fragment>
              }
              {
                <div className={`mt-2 flex flex-col items-center gap-2`}>
                  {
                    <button
                      type={`button`}
                      disabled={!w}
                      onClick={() => {
                        if (!(!N || !w)) {
                          if (S === `arabic`) {
                            (C(`english`), ae());
                            return;
                          }
                          (y((e) => e + 1), C(`arabic`), ae());
                        }
                      }}
                      className={`nav-text-action text-[#e8d7a1] disabled:text-stone-700 disabled:opacity-40`}
                    >{`Done`}</button>
                  }
                  {isExtraPractice && (
                    <button type={`button`} onClick={advanceToNextWord} className={`text-xs font-semibold text-stone-600`}>
                      {s === o.length - 1 ? `Continue to Match` : `Next word`}
                    </button>
                  )}
                </div>
              }
            </div>
          }
        </div>
      ) : (
        <section className={`exposure-say-shell min-h-0 flex-1 flex flex-col overflow-hidden py-3`}>
          {E.label && <p className={`section-label shrink-0 text-center`}>{E.label}</p>}
          {<p className={`mt-2 shrink-0 text-center text-xs text-stone-500`}>{`Repeat what's highlighted, then tap Say.`}</p>}
          {
            <div className={`min-h-0 flex-1 overflow-auto border-y border-[#d6b56d]/10 py-5 text-center`}>
              {<div className={m === `arabic` ? `exposure-say-face is-active` : `exposure-say-face is-dimmed`}>{<ArabicCardFace card={E} />}</div>}
              {
                <div className={`mt-3 ${m === `english` ? `exposure-say-face is-active` : `exposure-say-face is-dimmed`}`}>
                  <EnglishCue card={E} contextCards={o} size={`sm`} showImageHint={!1} />
                </div>
              }
            </div>
          }
          {
            <div className={`exposure-say-action-zone shrink-0`} aria-label={`Say button area`}>
              {
                <div className={`exposure-say-orb-wrap`}>
                  {
                    <button
                      type={`button`}
                      disabled={D}
                      onClick={() => {
                        if (!D) {
                          if (m === `arabic`) {
                            (d((e) => Math.max(0, e - 1)), h(`english`));
                            return;
                          }
                          (p((e) => Math.max(0, e - 1)), h(`arabic`));
                        }
                      }}
                      className={`repeat-orb compact-repeat-orb disabled:opacity-45`}
                      aria-label={`Say ${m === `arabic` ? `Arabic` : `English`} — ${re} left`}
                    >
                      {<span className={`text-2xl font-semibold leading-none`}>{re}</span>}
                      {<span className={`mt-1 text-[0.56rem] font-semibold uppercase tracking-[0.16em]`}>{`say`}</span>}
                    </button>
                  }
                </div>
              }
            </div>
          }
        </section>
      )}
    </div>
  ) : (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
      {<p className={`section-label`}>{n}</p>}
      {<p className={`mt-4 text-stone-400`}>{`No exposure cards found for this ${getLearnUnitLabel(e, t).toLowerCase()}.`}</p>}
    </div>
  );
}
function ExposureWriteCue({ card: e, writingLanguage: t, onClearPad: n, cueContextCards: cueContext }) {
  let [r, i] = useState(!1),
    a = t === `arabic` ? `english` : `arabic`,
    o = t === `english` ? `Optional: memory notes or other meanings you want to remember.` : `In a sentence if you can — no need to be perfect.`,
    s = () => i(!1);
  return (
    <div className={`exposure-write-cue shrink-0`}>
      {
        <div className={`mb-2 flex items-center justify-between gap-3`}>
          {<p className={`section-label`}>{`Write translation`}</p>}
          {
            <div className={`flex items-center gap-2`}>
              {<button type={`button`} onClick={n} className={`writing-surface-action text-xs font-semibold text-stone-500`}>{`Clear pad`}</button>}
              {
                <button
                  type={`button`}
                  className={`writing-surface-action exposure-write-cue-peek rounded px-2.5 py-1.5`}
                  aria-label={`Hold to reveal translation`}
                  onPointerDown={() => i(!0)}
                  onPointerUp={s}
                  onPointerLeave={s}
                  onPointerCancel={s}
                >{`Hold to reveal`}</button>
              }
            </div>
          }
        </div>
      }
      {<p className={`mb-2 text-center text-[0.68rem] leading-snug text-stone-500`}>{o}</p>}
      {
        <div className={`space-y-2 text-center`}>
          {a === `english` ? (
            <EnglishCue card={e} contextCards={cueContext} className={`writing-cue-copy exposure-write-cue-text`} size={`sm`} showImageHint={!1} />
          ) : e.imageUrl ? (
            <VocabularyImage src={e.imageUrl} alt={e.english} className={`writing-cue-copy exposure-write-cue-image`} />
          ) : (
            <div lang={`ar`} dir={`rtl`} className={`writing-cue-copy exposure-write-cue-text arabic text-2xl font-semibold text-[#e8d7a1]`}>
              {e.arabic}
            </div>
          )}
          {r &&
            (t === `arabic` ? (
              e.imageUrl ? (
                <VocabularyImage src={e.imageUrl} alt={e.english} className={`writing-cue-copy exposure-write-cue-image opacity-90`} />
              ) : (
                <div lang={`ar`} dir={`rtl`} className={`writing-cue-copy exposure-write-cue-text arabic text-2xl font-semibold text-[#e8d7a1]/90`}>
                  {e.arabic}
                </div>
              )
            ) : (
              <EnglishCue card={e} contextCards={cueContext} className={`writing-cue-copy exposure-write-cue-text opacity-90`} size={`sm`} showImageHint={!1} />
            ))}
        </div>
      }
    </div>
  );
}
const INITIAL_WRITING_STRIPS = 2;
const clearDocumentSelection = () => {
  let e = window.getSelection?.();
  e && !e.isCollapsed && e.removeAllRanges();
};
const blockWritingSurfaceEvent = (e) => e.preventDefault();
const isWritingSurfaceAction = (e) => e instanceof Element && !!e.closest(`.writing-surface-action`);
function useWritingSurfaceTouchGuard(e, t) {
  (useEffect(() => {
    let n = t.current;
    if (!n) return;
    let r = (t) => {
        if (isWritingSurfaceAction(t.target)) return;
        (e && t.preventDefault(), clearDocumentSelection());
      },
      i = (t) => {
        e && !isWritingSurfaceAction(t.target) && (t.preventDefault(), clearDocumentSelection());
      },
      a = (e) => {
        e.preventDefault();
      };
    return (
      n.addEventListener(`touchstart`, r, {
        passive: !1,
      }),
      n.addEventListener(`touchmove`, i, {
        passive: !1,
      }),
      n.addEventListener(`selectstart`, a),
      () => (n.removeEventListener(`touchstart`, r), n.removeEventListener(`touchmove`, i), n.removeEventListener(`selectstart`, a))
    );
  }, [e, t]),
    useEffect(() => {
      if (!e) return;
      let t = () => clearDocumentSelection();
      return (document.addEventListener(`selectionchange`, t), () => document.removeEventListener(`selectionchange`, t));
    }, [e]));
}
function WritingSurfaceHost({ isDrawing: e, className: t = ``, children: n }) {
  let r = useRef(null);
  return (
    useWritingSurfaceTouchGuard(e, r),
    (
      <div ref={r} className={`writing-surface-host relative min-h-0 flex flex-1 flex-col overflow-hidden${e ? ` is-drawing` : ``}${t ? ` ${t}` : ``}`} onSelectStart={blockWritingSurfaceEvent} onDragStart={blockWritingSurfaceEvent}>
        {n}
      </div>
    )
  );
}
function MultiStripWritingPad({ clearToken: e, onHasInkChange: t, onDrawingChange: n, className: r = ``, initialStrips: stripCount = INITIAL_WRITING_STRIPS }) {
  let [i, a] = useState(stripCount),
    [o, s] = useState(!1),
    l = useRef(null),
    c = useRef(0),
    u = `${e}`,
    d = useCallback(() => {
      (c.current === 0 && ((c.current = 1), s(!0), n?.(!0)), clearDocumentSelection());
    }, [n]),
    f = useCallback(() => {
      c.current !== 0 && ((c.current = 0), s(!1), n?.(!1), clearDocumentSelection());
    }, [n]);
  (useEffect(() => {
    (s(!1), (c.current = 0), n?.(!1), a(stripCount), t(!1));
  }, [e, t, n, stripCount]),
    useLayoutEffect(() => {
      let e = l.current;
      e &&
        ((e.scrollTop = 0),
        requestAnimationFrame(() => {
          e.scrollTop = 0;
        }));
    }, [e]),
    useEffect(() => {
      let e = l.current;
      if (!e) return;
      let t = (e) => {
          o && e.preventDefault();
        },
        n = () => f();
      return (
        e.addEventListener(`touchmove`, t, {
          passive: !1,
        }),
        window.addEventListener(`pointerup`, n),
        window.addEventListener(`pointercancel`, n),
        window.addEventListener(`touchend`, n),
        () => (e.removeEventListener(`touchmove`, t), window.removeEventListener(`pointerup`, n), window.removeEventListener(`pointercancel`, n), window.removeEventListener(`touchend`, n), f())
      );
    }, [f, o]));
  let p = (e) => {
    if (e !== i - 1) return;
    let t = l.current,
      n = t?.scrollTop ?? 0;
    (a((e) => e + 1),
      requestAnimationFrame(() => {
        t && (t.scrollTop = n);
      }));
  };
  return (
    <div className={`writing-surface min-h-0 flex flex-1 flex-col overflow-hidden${o ? ` is-drawing` : ``}${r ? ` ${r}` : ``}`} onSelectStart={blockWritingSurfaceEvent} onDragStart={blockWritingSurfaceEvent}>
      {
        <div ref={l} className={`writing-strips-scroll min-h-0 flex-1`}>
          {
            <div className={`writing-strips-row`}>
              {<div className={`writing-strips-gutter`} aria-hidden={!0} />}
              {
                <div className={`writing-strips-main`}>
                  {Array.from(
                    {
                      length: i,
                    },
                    (e, n) => (
                      <WritingStripCanvas key={`${u}-${n}`} clearToken={u} isLast={n === i - 1} onStroke={() => p(n)} onInk={() => t(!0)} onDrawStart={d} onDrawEnd={f} />
                    ),
                  )}
                </div>
              }
              {<div className={`writing-strips-gutter`} aria-hidden={!0} />}
            </div>
          }
        </div>
      }
    </div>
  );
}
function WritingStripCanvas({ clearToken: e, isLast: t, onStroke: n, onInk: i, onDrawStart: a, onDrawEnd: o }) {
  let s = useRef(null),
    c = useRef(!1),
    u = useRef(null),
    d = useRef(!1),
    f = () => {
      let e = s.current;
      if (!e) return;
      let t = e.getBoundingClientRect(),
        n = window.devicePixelRatio || 1;
      ((e.width = Math.floor(t.width * n)), (e.height = Math.floor(t.height * n)));
      let r = e.getContext(`2d`);
      r && (r.setTransform(n, 0, 0, n, 0, 0), (r.lineCap = `round`), (r.lineJoin = `round`), (r.lineWidth = t.width < 480 ? 6 : 4), (r.strokeStyle = `#e8d7a1`));
    };
  (useEffect(() => (f(), window.addEventListener(`resize`, f), () => window.removeEventListener(`resize`, f)), []),
    useEffect(() => {
      let e = s.current,
        t = e?.getContext(`2d`);
      e && t && (f(), t.clearRect(0, 0, e.width, e.height), (d.current = !1), (c.current = !1), (u.current = null));
    }, [e]),
    useEffect(() => {
      let e = s.current;
      if (!e) return;
      let t = (e) => {
          (e.preventDefault(), clearDocumentSelection());
        },
        n = (e) => {
          c.current && (e.preventDefault(), clearDocumentSelection());
        };
      return (
        e.addEventListener(`touchstart`, t, {
          passive: !1,
        }),
        e.addEventListener(`touchmove`, n, {
          passive: !1,
        }),
        () => (e.removeEventListener(`touchstart`, t), e.removeEventListener(`touchmove`, n))
      );
    }, []));
  let p = (e) => {
      let t = s.current;
      if (!t) return null;
      let n = t.getBoundingClientRect();
      return {
        x: e.clientX - n.left,
        y: e.clientY - n.top,
      };
    },
    m = (e) => {
      let t = s.current,
        n = t?.getContext(`2d`);
      if (!t || !n) return;
      let r = (t.getBoundingClientRect().width < 480 ? 6 : 4) / 2;
      ((n.fillStyle = `#e8d7a1`), n.beginPath(), n.arc(e.x, e.y, r, 0, Math.PI * 2), n.fill());
    },
    h = (e) => {
      if (e.pointerType === `mouse` && e.button !== 0) return;
      (e.preventDefault(), e.currentTarget.setPointerCapture(e.pointerId), a?.(), t && !d.current && ((d.current = !0), n()), (c.current = !0));
      let r = p(e);
      r && ((u.current = r), m(r), i());
    },
    g = (e) => {
      if (!c.current) return;
      (e.preventDefault(), clearDocumentSelection());
      let t = s.current?.getContext(`2d`),
        n = u.current,
        r = p(e);
      !t || !n || !r || (t.beginPath(), t.moveTo(n.x, n.y), t.lineTo(r.x, r.y), t.stroke(), (u.current = r), i());
    },
    _ = (e) => {
      (e.currentTarget.hasPointerCapture(e.pointerId) && e.currentTarget.releasePointerCapture(e.pointerId), c.current && o?.(), (c.current = !1), (u.current = null), clearDocumentSelection());
    },
    v = () => {
      (c.current && o?.(), (c.current = !1), (u.current = null));
    };
  return <canvas ref={s} className={`writing-strip-canvas`} draggable={false} onPointerDown={h} onPointerMove={g} onPointerUp={_} onPointerCancel={_} onLostPointerCapture={v} onContextMenu={(e) => e.preventDefault()} />;
}
function useVerbFamilyWritingMiss() {
  let familyHadMissRef = useRef(!1);
  return {
    trackPrompt: (prompt) => {
      prompt && isFirstVerbFamilyFormPart(prompt) && (familyHadMissRef.current = !1);
    },
    noteFormResult: (wasCorrect) => {
      wasCorrect || (familyHadMissRef.current = !0);
    },
    getFamilyHadMiss: () => familyHadMissRef.current,
    resetAfterFamily: () => {
      familyHadMissRef.current = !1;
    },
  };
}
function WritingMissSayLoop({ forms, onComplete, cueContextCards }) {
  let familyForms = forms?.length ? forms : [];
  if (familyForms.length <= 1) {
    let card = familyForms[0];
    if (!card) {
      onComplete?.();
      return null;
    }
    return (
      <ExposureSayLoopPanel
        card={card}
        heading={`Say this word`}
        onComplete={onComplete}
        cueContextCards={cueContextCards}
      />
    );
  }
  return (
    <VerbFamilySayLoopPanel
      forms={familyForms}
      heading={`Say this family`}
      rounds={TEST_MISS_VERB_FAMILY_SAY_ROUNDS}
      onComplete={onComplete}
    />
  );
}
function WritingFamilyMissSayLoop({ forms, onComplete, cueContextCards }) {
  return <WritingMissSayLoop forms={forms} onComplete={onComplete} cueContextCards={cueContextCards} />;
}
function ArabicCardFace({ card: e, className: t = `` }) {
  return e.imageUrl ? (
    <VocabularyImage src={e.imageUrl} alt={e.english} className={`arabic-inline-image ${t}`} />
  ) : (
    <p lang={`ar`} className={`arabic text-5xl font-semibold leading-[1.9] text-[#e8d7a1] ${t}`}>
      {e.arabic}
    </p>
  );
}
function FlashcardStudyPanel({ prompt: e, isRevealed: t, onReveal: n, onAdvance: r }) {
  let { card: i, cueSide: a, verbFamilyForms: o } = e,
    s = a === `arabic` ? `english` : `arabic`,
    familyForms = o?.length ? o : null,
    dailyReviewAnswers = e.dailyReviewAnswerCards?.length ? e.dailyReviewAnswerCards : null,
    [u, d] = useState(!1);
  return (
    useEffect(() => {
      d(!1);
    }, [e.card.id, e.cueSide, e.passesRemaining]),
    (
      <Fragment>
        {
          <section className={`writing-flashcard-study flex min-h-0 flex-1 flex-col overflow-hidden py-3`}>
            {<p className={`section-label shrink-0 text-center`}>{s === `arabic` ? `Recall the Arabic` : `Recall the English meaning`}</p>}
            {
              <div className={`flex min-h-0 flex-1 flex-col justify-center py-4 text-center`}>
                {
                  <div className={`shrink-0`}>
                    {a === `arabic` ? (
                      <ArabicCardFace card={i} className={`writing-cue-copy`} />
                    ) : dailyReviewAnswers ? (
                      <EnglishCue card={{ ...i, englishVariant: undefined, englishVariantTotal: undefined }} className={`writing-cue-copy mx-auto`} showImageHint={!1} />
                    ) : familyForms && familyForms.length > 1 ? (
                      <div className={`writing-cue-copy text-2xl font-semibold text-stone-100`}>{getFamilyMeaningLabel(familyForms)}</div>
                    ) : (
                      <EnglishCue card={i} className={`writing-cue-copy mx-auto`} showImageHint={!1} />
                    )}
                  </div>
                }
                {t ? (
                  <div className={`writing-flashcard-answer-zone mt-6 border-t border-[#d6b56d]/10 pt-6 text-center`}>
                    {<p className={`section-label`}>{`Answer`}</p>}
                    {
                      <div className={`mt-3`}>
                        {a === `arabic` ? (
                          <p className={`text-lg text-stone-300`}>{i.english}</p>
                        ) : dailyReviewAnswers && dailyReviewAnswers.length > 1 ? (
                          <div className={`grid grid-cols-2 gap-3`} dir={`rtl`}>
                            {dailyReviewAnswers.map((card) => (
                              <ArabicCardFace key={card.id} card={card} />
                            ))}
                          </div>
                        ) : dailyReviewAnswers ? (
                          <ArabicCardFace card={dailyReviewAnswers[0]!} />
                        ) : familyForms && familyForms.length > 1 ? (
                          <VerbFamilyParadigmGrid forms={familyForms} activeFormIndex={-1} compact />
                        ) : (
                          <ArabicCardFace card={i} />
                        )}
                      </div>
                    }
                  </div>
                ) : (
                  <div className={`flashcard-study-reveal-zone mt-8`}>
                    {
                      <button type={`button`} onClick={n} className={`nav-text-action py-2 text-[#e8d7a1]`}>
                        {`Reveal answer`}
                      </button>
                    }
                    {
                      <button
                        type={`button`}
                        onClick={() => {
                          (d(!0), t || n());
                        }}
                        className={`nav-text-action mt-3 py-2 text-stone-500`}
                      >{`I don't know`}</button>
                    }
                  </div>
                )}
              </div>
            }
          </section>
        }
        {t &&
          (u ? (
            <div className={`shrink-0 border-t border-[#d6b56d]/10 pt-4 text-center`}>{<button type={`button`} onClick={() => r(!1)} className={`nav-text-action text-stone-400`}>{`Continue`}</button>}</div>
          ) : (
            <div className={`shrink-0 grid grid-cols-2 gap-5 border-t border-[#d6b56d]/10 pt-4`}>
              {<button type={`button`} onClick={() => r(!1)} className={`nav-text-action justify-self-start text-stone-400`}>{`Incorrect`}</button>}
              {<button type={`button`} onClick={() => r(!0)} className={`nav-text-action justify-self-end text-[#e8d7a1]`}>{`Correct`}</button>}
            </div>
          ))}
      </Fragment>
    )
  );
}
function WritingStudyPanel({ prompt: e, isRevealed: t, onReveal: n, onAdvance: r, cueContextCards: cueContext }) {
  let { card: i, cueSide: a, verbFamilyForms: o, verbFamilyFormPart: formPart } = e,
    s = a === `arabic` ? `english` : `arabic`,
    formPartIndex = getVerbFamilyFormPartIndex(e),
    formPartCount = getVerbFamilyFormPartCount(e),
    [u, d] = useState(!1),
    [f, p] = useState(0),
    [m, h] = useState(!1),
    [isPadDrawing, setIsPadDrawing] = useState(!1),
    studyScrollRef = useRef(null),
    g = () => {
      (h(!0), t || n());
    },
    _ = () => p((e) => e + 1);
  useEffect(() => {
    (d(!1), p((e) => e + 1), h(!1), setIsPadDrawing(!1));
  }, [e.card.id, e.cueSide, e.passesRemaining, formPart, formPartIndex]);
  useLayoutEffect(() => {
    let el = studyScrollRef.current;
    el && (el.scrollTop = 0);
  }, [e.card.id, e.cueSide, e.passesRemaining, formPart]);
  useLayoutEffect(() => {
    if (!t) return;
    let el = studyScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      let answer = el.querySelector(`.writing-flashcard-answer-zone`);
      answer ? answer.scrollIntoView({ block: `start` }) : (el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight));
    });
  }, [t, e.card.id, e.cueSide, e.passesRemaining, formPart]);
  return (
    <div className={`writing-flashcard-study-shell flex min-h-0 flex-1 flex-col overflow-hidden`}>
        {
          <section ref={studyScrollRef} className={`writing-flashcard-study min-h-0 flex-1 overflow-y-auto py-3`}>
            {
              <p className={`section-label shrink-0 text-center`}>
                {formPart ? `Write the Arabic form` : o && o.length > 1 ? `Write every Arabic form` : s === `arabic` ? `Write the Arabic` : `Write the English meaning`}
              </p>
            }
            {
              <WritingSurfaceHost isDrawing={isPadDrawing} className={`writing-flashcard-surface`}>
                {
                  <div className={`mt-3 shrink-0 text-center`}>
                    {a === `arabic` ? (
                      <ArabicCardFace card={i} className={`writing-cue-copy`} />
                    ) : formPart && o?.length ? (
                      <div>
                        <div className={`writing-cue-copy text-2xl font-semibold text-stone-100`}>{getFamilyMeaningLabel(o)}</div>
                        {
                          <p lang={`ar`} dir={`rtl`} className={`mt-2 text-lg font-semibold text-[#e8d7a1]`}>
                            {i.label}
                          </p>
                        }
                        {formPartIndex >= 0 && formPartCount > 0 && (
                          <p className={`mt-1 text-xs text-stone-500`}>
                            {`Form `}
                            {formPartIndex + 1}
                            {` of `}
                            {formPartCount}
                          </p>
                        )}
                      </div>
                    ) : o && o.length > 1 ? (
                      <div className={`writing-cue-copy text-2xl font-semibold text-stone-100`}>{getFamilyMeaningLabel(o)}</div>
                    ) : (
                      <EnglishCue card={i} contextCards={cueContext} className={`writing-cue-copy`} showImageHint={!1} />
                    )}
                  </div>
                }
                {
                  <div className={`flex flex-col`}>
                    {<div className={`flex shrink-0 justify-end pb-1`}>{<button type={`button`} onClick={_} className={`writing-surface-action text-xs font-semibold text-stone-500`}>{`Clear pad`}</button>}</div>}
                    {
                      <div className={`writing-flashcard-pad py-2 ${t ? `writing-flashcard-pad-revealed` : ``}`}>
                        {<MultiStripWritingPad clearToken={f} initialStrips={formPart ? 1 : INITIAL_WRITING_STRIPS} onHasInkChange={d} onDrawingChange={setIsPadDrawing} />}
                      </div>
                    }
                    {t ? (
                      <div className={`writing-flashcard-answer-zone mt-2 border-t border-[#d6b56d]/10 pt-4 text-center`}>
                        {<p className={`section-label`}>{`Answer`}</p>}
                        {
                          <div className={`mt-3`}>
                            {formPart ? (
                              <ArabicCardFace card={i} />
                            ) : o && o.length > 1 ? (
                              <VerbFamilyParadigmGrid forms={o} activeFormIndex={-1} compact />
                            ) : a === `arabic` ? (
                              <p className={`text-lg text-stone-300`}>{i.english}</p>
                            ) : (
                              <ArabicCardFace card={i} />
                            )}
                          </div>
                        }
                      </div>
                    ) : (
                      <div className={`writing-flashcard-reveal-zone`}>
                        {
                          <button type={`button`} disabled={!u} onClick={n} className={`writing-surface-action nav-text-action py-2 text-[#e8d7a1] disabled:text-stone-700 disabled:opacity-40`}>
                            {`Reveal answer`}
                          </button>
                        }
                        {<button type={`button`} onClick={g} className={`writing-surface-action nav-text-action mt-3 py-2 text-stone-500`}>{`I don't know`}</button>}
                      </div>
                    )}
                  </div>
                }
              </WritingSurfaceHost>
            }
          </section>
        }
        {t &&
          (m ? (
            <div className={`writing-flashcard-study-actions px-1 pt-4 text-center`}>{<button type={`button`} onClick={() => r(!1)} className={`nav-text-action text-stone-400`}>{`Continue`}</button>}</div>
          ) : (
            <div className={`writing-flashcard-study-actions grid grid-cols-2 gap-5 px-1 pt-4`}>
              {<button type={`button`} onClick={() => r(!1)} className={`nav-text-action justify-self-start text-stone-400`}>{`Incorrect`}</button>}
              {<button type={`button`} onClick={() => r(!0)} className={`nav-text-action justify-self-end text-[#e8d7a1]`}>{`Correct`}</button>}
            </div>
          ))}
    </div>
  );
}
type MatchTile = {
  id: string;
  pairId: string;
  text: string;
  side: "arabic" | "english";
  imageUrl?: string;
  verbFamilyForms?: ExposureCard[];
};
const buildMatchTiles = (cards: ExposureCard[]) => {
  let prep = prepareBatchStudyCards(cards);
  if (cards[0]?.section === `verbs` || cards[0]?.section === `nouns`) {
    return shuffle(
      prep.cards.flatMap((card) => {
        let familyId = getBatchFamilyId(card),
          forms = prep.familyFormsByCardId.get(card.id) ?? [card],
          english = getFamilyMeaningLabel(forms);
        return [
          {
            id: `${familyId}-arabic`,
            pairId: familyId,
            text: forms.map((form) => form.arabic).join(` · `),
            side: `arabic` as const,
            verbFamilyForms: forms,
          },
          {
            id: `${familyId}-english`,
            pairId: familyId,
            text: english,
            side: `english` as const,
          },
        ];
      }),
    );
  }
  return shuffle(
    cards.flatMap((card) => [
      {
        id: `${card.id}-arabic`,
        pairId: card.id,
        text: card.arabic,
        side: `arabic` as const,
        imageUrl: card.imageUrl,
      },
      {
        id: `${card.id}-english`,
        pairId: card.id,
        text: getEnglishAnswerInContext(card, cards),
        side: `english` as const,
      },
    ]),
  );
};
const getBatchMatchPairCount = (cards: ExposureCard[]) => getBatchStudyCardCount(cards);
const MATCH_RESHUFFLE_MS = 650;
const MATCH_CLEAR_PAUSE_MS = 700;
const restoreMatchTiles = (cards, tileIds) => {
  let e = buildMatchTiles(cards),
    t = new Map(e.map((e) => [e.id, e])),
    n = tileIds.map((e) => t.get(e)).filter(Boolean);
  return n.length === tileIds.length ? n : buildMatchTiles(cards);
};
function MemoryMatchPhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, onPhaseComplete: i, onNavigate: a }) {
  let o = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    s = useMemo(() => getBatchMatchPairCount(o), [o]),
    c = Math.max(1, s) * MATCH_SECONDS_PER_PAIR,
    u = s >= 5,
    P = getBatchSession(t),
    B = P?.memoryMatch?.cardCount === s ? P.memoryMatch : undefined,
    [d, f] = useState(() => (B?.tileIds?.length ? restoreMatchTiles(o, B.tileIds) : buildMatchTiles(o))),
    [p, m] = useState(B?.selectedTileId ?? null),
    [h, g] = useState(B?.pairedTileId ?? null),
    [_, v] = useState(B?.matchedPairIds ?? []),
    [y, b] = useState(B?.wrongPairIds ?? []),
    [x, S] = useState(B?.boardLocked ?? !1),
    [C, w] = useState(B?.feedback ?? null),
    [T, E] = useState(B?.timerStarted ?? !1),
    [D, O] = useState(B?.timerSecondsLeft ?? c),
    [k, ee] = useState(B?.cleanRunsRequired ?? MEMORY_MATCH_CLEAN_RUNS),
    [te, ne] = useState(B?.cleanRunsDone ?? 0),
    [re, ie] = useState(!1),
    ae = useRef(!1),
    A = useRef(!1),
    j = useCallback(() => {
      (f(buildMatchTiles(o)), m(null), g(null), v([]), b([]), S(!1), w(null), E(!1), O(c), (ae.current = !1), (A.current = !1));
    }, [o, c]);
  useEffect(() => {
    let P = getBatchSession(t);
    if (P?.memoryMatch?.cardCount === s && P.memoryMatch.tileIds?.length) return;
    (j(), ee(MEMORY_MATCH_CLEAN_RUNS), ne(0), ie(!1), (ae.current = !1), (A.current = !1));
  }, [j, s, t]);
  useEffect(() => {
    o.length > 0 &&
      patchBatchSession(t, {
        phase: `memory-match`,
        cardCount: getBatchStudyCardCount(o),
        memoryMatch: {
          cardCount: s,
          tileIds: d.map((e) => e.id),
          matchedPairIds: _,
          wrongPairIds: y,
          selectedTileId: p,
          pairedTileId: h,
          timerSecondsLeft: D,
          timerStarted: T,
          cleanRunsRequired: k,
          cleanRunsDone: te,
          boardLocked: x,
          feedback: C,
        },
      });
  }, [t, s, d, _, y, p, h, D, T, k, te, x, C]);
  let oe = _.length,
    se = s > 0 && oe === s,
    ce = T && !x && !re && !se;
  useEffect(() => {
    if (!ce || D <= 0) return;
    let e = window.setTimeout(() => O((e) => Math.max(0, e - 1)), 1e3);
    return () => window.clearTimeout(e);
  }, [ce, D]);
  let le = useCallback(() => {
      ne(0);
    }, []),
    M = useCallback(
      (e, t = []) => {
        (le(),
          S(!0),
          w(e),
          b(t),
          window.setTimeout(() => {
            j();
          }, MATCH_RESHUFFLE_MS));
      },
      [le, j],
    );
  (useEffect(() => {
    (D > 0 && (A.current = !1), !(!T || x || re || D > 0 || !s || A.current) && ((A.current = !0), M(`timeout`)));
  }, [T, x, re, D, s, M]),
    useEffect(() => {
      if (!se || x || re || ae.current) return;
      ae.current = !0;
      let e = te + 1;
      if (e >= k) {
        (ne(e), ie(!0), (ae.current = !1));
        return;
      }
      (ne(e),
        S(!0),
        w(`clear`),
        window.setTimeout(() => {
          j();
        }, MATCH_CLEAR_PAUSE_MS));
    }, [se, x, re, te, k, j]));
  let N = (e) => {
      if (!T || x || re || se || _.includes(e.pairId)) return;
      if (e.side === `arabic`) {
        if (p === e.id) {
          m(null);
          return;
        }
        m(e.id);
      } else if (h === e.id) {
        g(null);
        return;
      } else g(e.id);
      let t = e.side === `arabic` ? e.id : p,
        n = e.side === `english` ? e.id : h;
      if (!t || !n) return;
      let r = d.find((e) => e.id === t),
        i = d.find((e) => e.id === n);
      if (!(!r || !i)) {
        if (r.pairId === i.pairId) {
          (v((e) => [...e, r.pairId]), m(null), g(null));
          return;
        }
        M(`wrong`, [r.pairId, i.pairId]);
      }
    },
    ue = (e) => e.id === p || e.id === h,
    de = (e) => _.includes(e.pairId),
    fe = c > 0 ? (D / c) * 100 : 0,
    pe = re
      ? `Board cleared. Continue when ready.`
      : x
        ? C === `timeout`
          ? `Time's up. Reshuffling...`
          : C === `clear`
            ? `Board cleared. Reshuffling...`
            : `Wrong pair. Reshuffling...`
        : !T
          ? `Clean run ${te + 1}/${k} — tap Start to reveal cards and begin.`
          : `Clean run ${te + 1}/${k} — match every pair before time runs out.`;
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
      {<BatchStepMeta stepTitle={n} progress={`${oe}/${s}`} />}
      {<PhaseRail active={`memory-match`} completedPhases={r} lessonId={e.id} stepId={t} disabled={x} onNavigate={a} />}
      {
        <div className={`shrink-0 border-b border-[#d6b56d]/10 py-3`}>
          {
            <div className={`flex items-center justify-between gap-3 text-sm`}>
              {<p className={`min-w-0 text-stone-500`}>{pe}</p>}
              {!T && !x && !re && (
                <button
                  type={`button`}
                  onClick={() => {
                    (E(!0), O(c));
                  }}
                  className={`final-test-link shrink-0`}
                >{`Start`}</button>
              )}
              {re && (
                <button
                  type={`button`}
                  onClick={() => {
                    (i(t, `memory-match`),
                      a({
                        name: `batch`,
                        lessonId: e.id,
                        stepId: t,
                        phase: `multiple-choice`,
                      }));
                  }}
                  className={`final-test-link shrink-0`}
                >{`Continue`}</button>
              )}
            </div>
          }
          {
            <div className={`mt-2 flex items-center gap-3`}>
              {
                <div className={`match-timer min-w-0 flex-1`} aria-label={T ? `${D} seconds left` : `Timer not started`}>
                  {
                    <div className={`match-timer-track`}>
                      {
                        <div
                          className={`match-timer-fill${D <= 3 && T ? ` is-urgent` : ``}`}
                          style={{
                            width: `${T ? fe : 100}%`,
                          }}
                        />
                      }
                    </div>
                  }
                </div>
              }
              {<p className={`match-timer-label shrink-0 tabular-nums ${D <= 3 && T ? `is-urgent` : ``}`}>{T ? `${D}s` : `${c}s`}</p>}
            </div>
          }
        </div>
      }
      {
        <div className={`no-scrollbar match-grid min-h-0 flex-1 overflow-auto py-4 ${u ? `match-grid-dense` : ``}`}>
          {d.map((e) => {
            let t = ue(e),
              n = de(e),
              r = y.includes(e.pairId) || (C === `timeout` && !n);
            return (
              <button
                type={`button`}
                disabled={x || n || !T}
                onClick={() => N(e)}
                className={`match-card ${T ? `match-card-visible` : `match-card-facedown`} ${u ? `match-card-compact` : ``} ${t ? `match-card-selected` : ``} ${n ? `match-card-matched` : ``} ${r ? `match-card-wrong` : ``}`}
              >
                {T ? (
                  e.side === `arabic` && e.verbFamilyForms && e.verbFamilyForms.length > 1 ? (
                    <VerbFamilyParadigmGrid forms={e.verbFamilyForms} activeFormIndex={-1} compact />
                  ) : e.side === `arabic` && e.imageUrl ? (
                    <VocabularyImage src={e.imageUrl} alt={`Arabic`} className={`arabic-match-image${u ? ` arabic-match-image-compact` : ``}`} />
                  ) : (
                    <span lang={e.side === `arabic` ? `ar` : `en`} className={e.side === `arabic` ? `arabic match-card-arabic${u ? ` match-card-arabic-compact` : ``}` : `match-card-english${u ? ` match-card-english-compact` : ``}`}>
                      {e.text}
                    </span>
                  )
                ) : (
                  <span className={`match-card-back`} aria-hidden={`true`}>{`•••`}</span>
                )}
              </button>
            );
          })}
        </div>
      }
    </div>
  );
}
function getMcFamilyForms(batchPrep, lessonCards, card) {
  return (
    batchPrep.familyFormsByCardId.get(card.id) ??
    (card.section === `nouns` ? getNounFamilyFormsForCard(lessonCards, card) : null) ??
    (card.section === `verbs` ? getVerbFamilyFormsForCard(lessonCards, card) : null) ??
    [card]
  );
}
function MultipleChoicePhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, onPhaseComplete: i, onNavigate: a }) {
  let o = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    batchStudyCount = useMemo(() => getBatchStudyCardCount(o), [o]),
    batchPrep = useMemo(() => prepareBatchStudyCards(o), [o]),
    mcCards = useMemo(() => getBatchMultipleChoiceCards(o), [o]),
    s = useMemo(() => getCachedLessonExposureCards(e), [e]),
    c = batchMultipleChoicePromptTotal(o, BATCH_TEST_MC_CUE_SIDES),
    P = getBatchSession(t),
    B = isBatchSessionValid(P, batchStudyCount) ? P?.multipleChoice : undefined,
    F = () => {
      if (B?.queue?.length) {
        let e = restoreStudyPrompts(mcCards, B.queue, batchPrep.familyFormsByCardId);
        if (e.length) return e;
      }
      return buildBatchMultipleChoiceStudyQueue(o, BATCH_TEST_MC_CUE_SIDES);
    },
    [u, d] = useState(F),
    [f, p] = useState(B?.questionIndex ?? 0),
    [m, h] = useState(B?.timerSecondsLeft ?? MC_SECONDS),
    [g, _] = useState(null),
    [v, y] = useState(null),
    [b, x] = useState(B?.missedCount ?? 0),
    [S, C] = useState(B?.correctCount ?? 0),
    [isLocked, setIsLocked] = useState(!1),
    w = u[0],
    T = v !== null,
    E = mcCards.length > 0 && u.length === 0,
    D = w ? `q${f}` : `done`,
    O = useMemo(
      () =>
        w
          ? w.cueSide === `arabic`
            ? { kind: `english`, options: getBatchEnglishMultipleChoiceOptions(w.card, s, o) }
            : { kind: `arabic`, options: getBatchArabicMultipleChoiceOptions(w.card, s, o) }
          : null,
      [w, s, o],
    ),
    k = useCallback((prompt) => getMultipleChoiceAnswerKey(prompt, o), [o]),
    A = useRef(!1),
    j = useRef(null);
  (useEffect(() => {
    if (isBatchSessionValid(getBatchSession(t), batchStudyCount) && getBatchSession(t)?.multipleChoice) return;
    (d(buildBatchMultipleChoiceStudyQueue(o, BATCH_TEST_MC_CUE_SIDES)), p(0), h(MC_SECONDS), _(null), y(null), x(0), C(0), setIsLocked(!1), (A.current = !1));
  }, [o, batchStudyCount, t]),
    useEffect(() => {
      o.length > 0 &&
        patchBatchSession(t, {
          phase: `multiple-choice`,
          cardCount: batchStudyCount,
          multipleChoice: {
            queue: u.map(serializeStudyPrompt),
            questionIndex: f,
            timerSecondsLeft: m,
            missedCount: b,
            correctCount: S,
          },
        });
    }, [t, batchStudyCount, o.length, u, f, m, b, S]),
    useEffect(() => {
      (setIsLocked(!1), (A.current = !1), _(null), y(null), h(MC_SECONDS), document.activeElement instanceof HTMLElement && document.activeElement.blur());
    }, [f]));
  let ee = useCallback(
    (e) => {
      if (!w || isLocked || A.current) return;
      ((A.current = !0), setIsLocked(!0));
      let t = e === k(w);
      (_(e),
        y(t ? `correct` : e ? `wrong` : `timeout`),
        t || x((e) => e + 1),
        t && C((e) => e + 1),
        j.current && window.clearTimeout(j.current),
        (j.current = window.setTimeout(() => {
          ((j.current = null), (A.current = !1));
          d((e) => advanceStudyPromptQueue(e, t));
          p((e) => e + 1);
          setIsLocked(!1);
          _(null);
          y(null);
          h(MC_SECONDS);
          document.activeElement instanceof HTMLElement && document.activeElement.blur();
        }, 900)));
    },
    [w, k, isLocked],
  );
  return (
    useEffect(() => {
      if (!w || isLocked || E) return;
      if (m <= 0) {
        ee(null);
        return;
      }
      let e = window.setTimeout(() => h((e) => Math.max(0, e - 1)), 1e3);
      return () => window.clearTimeout(e);
    }, [w, isLocked, E, m, ee]),
    useEffect(
      () => () => {
        j.current && window.clearTimeout(j.current);
      },
      [],
    ),
    !w && !E ? (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
        {<p className={`section-label`}>{n}</p>}
        {<p className={`mt-4 text-stone-400`}>{`No multiple choice cards found for this ${getLearnUnitLabel(e, t).toLowerCase()}.`}</p>}
      </div>
    ) : (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
        {<BatchStepMeta stepTitle={n} progress={`${E ? c : Math.min(f + (w ? 1 : 0), c)}/${c}`} />}
        {<PhaseRail active={`multiple-choice`} completedPhases={r} lessonId={e.id} stepId={t} disabled={isLocked} onNavigate={a} />}
        {E ? (
          <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
            {<p className={`section-label`}>{`Complete`}</p>}
            {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Multiple choice complete`}</p>}
            {
              <p className={`mt-3 text-sm text-stone-500`}>
                {`Missed: `}
                {b}
              </p>
            }
            {
              <button
                onClick={() => {
                  (i(t, `multiple-choice`),
                    a({
                      name: `batch`,
                      lessonId: e.id,
                      stepId: t,
                      phase: `writing-test`,
                    }));
                }}
                className={`final-test-link mx-auto mt-8`}
              >{`Continue to Test`}</button>
            }
          </section>
        ) : (
          w && (
            <Fragment>
              {
                <div className={`shrink-0 border-b border-[#d6b56d]/10 py-3`}>
                  {
                    <div className={`flex items-center justify-between gap-3 text-xs text-stone-500`}>
                      {
                        <span>
                          {v === `timeout` ? `Time` : v === `wrong` ? `Incorrect` : v === `correct` ? `Correct` : w.cueSide === `arabic` ? `Choose the meaning` : `Choose the Arabic`}
                          {w.passesRemaining < 2 ? ` · ${w.passesRemaining} left` : ``}
                        </span>
                      }
                      {
                        <span className={`font-semibold text-[#e8d7a1]`}>
                          {m}
                          {`s`}
                        </span>
                      }
                    </div>
                  }
                  {
                    <div className={`mt-3 h-px bg-[#d6b56d]/10`}>
                      {
                        <div
                          className={`h-full bg-[#d6b56d] transition-all`}
                          style={{
                            width: `${(m / MC_SECONDS) * 100}%`,
                          }}
                        />
                      }
                    </div>
                  }
                </div>
              }
              {
                <section className={`min-h-0 flex-1 overflow-auto py-4`}>
                  {
                    <div className={`border-y border-[#d6b56d]/10 text-center ${O?.kind === `arabic` ? `py-5` : `py-7`}`}>
                      {w.cueSide === `arabic` ? (
                        (() => {
                          let familyForms = getMcFamilyForms(batchPrep, s, w.card);
                          return familyForms.length > 1 ? (
                            <VerbFamilyParadigmGrid forms={familyForms} activeFormIndex={-1} compact />
                          ) : (
                            <ArabicCardFace card={w.card} />
                          );
                        })()
                      ) : w.card.section === `verbs` || (w.card.section === `nouns` && getMcFamilyForms(batchPrep, s, w.card).length > 1) ? (
                        <p className={`text-2xl font-semibold text-stone-100`}>
                          {getFamilyMeaningLabel(getMcFamilyForms(batchPrep, s, w.card))}
                        </p>
                      ) : (
                        <EnglishCue card={w.card} contextCards={o} className={`mx-auto max-w-xs`} showImageHint={!1} />
                      )}
                    </div>
                  }
                  {O?.kind === `english` && (
                    <div className={`mt-4 grid gap-3`} key={D}>
                      {O.options.map((e, t) => {
                        let n = e === k(w),
                          r = T && g === e;
                        return (
                          <button
                            key={`${D}-${t}`}
                            type={`button`}
                            disabled={isLocked}
                            onClick={(t) => {
                              (ee(e), t.currentTarget.blur());
                            }}
                            className={`choice-card ${r && n ? `choice-card-correct` : ``} ${r && !n ? `choice-card-wrong` : ``}`}
                          >
                            {e}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {O?.kind === `arabic` && (
                    <div className={`choice-grid-images mt-4 grid`} key={D}>
                      {O.options.map((e, t) => {
                        let i = getMultipleChoiceArabicOptionKey(w, e),
                          n = i === k(w),
                          r = T && g === i;
                        return (
                          <button
                            key={`${D}-${e.id}`}
                            type={`button`}
                            disabled={isLocked}
                            onClick={(t) => {
                              (ee(i), t.currentTarget.blur());
                            }}
                            className={`choice-card choice-card-image ${r && n ? `choice-card-correct` : ``} ${r && !n ? `choice-card-wrong` : ``}`}
                          >
                            {(() => {
                              let familyForms = getMcFamilyForms(batchPrep, s, e);
                              return familyForms.length > 1 ? (
                                <VerbFamilyParadigmGrid forms={familyForms} activeFormIndex={-1} compact />
                              ) : e.imageUrl ? (
                                <VocabularyImage src={e.imageUrl} alt={e.english} className={`arabic-choice-image`} draggable={false} />
                              ) : (
                                <p lang={`ar`} className={`arabic text-xl font-medium text-[#e8d7a1]`}>
                                  {e.arabic}
                                </p>
                              );
                            })()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              }
            </Fragment>
          )
        )}
      </div>
    )
  );
}
function WritingTestPhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, completedStepIds: i, completedBatchPhases: l, onPhaseComplete: a, onStepComplete: o, onNavigate: s }) {
  let q = useMemo(() => prepareWithinBatchWritingTestCards(e, t), [e, t]),
    c = q.cards,
    stepComplete = i.includes(t),
    [retryingCompletedTest, setRetryingCompletedTest] = useState(!1),
    testIsActive = !stepComplete || retryingCompletedTest,
    P = getBatchSession(t),
    z = useMemo(() => writingTestFamilyTotal(c, q.familyFormsByCardId), [c, q.familyFormsByCardId]),
    B = !stepComplete && isBatchSessionValid(P, c.length) ? P?.writingTest : undefined,
    buildQueue = () => buildWithinBatchWritingStudyQueue(q, BATCH_TEST_WRITING_CONFIG),
    F = () => {
      if (!testIsActive) return [];
      if (B?.queue?.length && B.queueVersion === WRITING_QUEUE_LOGIC_VERSION) {
        let restored = restoreWritingStudyPrompts(c, B.queue, q.familyFormsByCardId);
        if (restored.length && isValidFamilyWritingQueue(restored)) return restored;
      }
      return buildQueue();
    },
    [d, f] = useState(F),
    [p, m] = useState(testIsActive ? (B?.isRevealed ?? !1) : !1),
    [h, g] = useState(testIsActive ? (B?.missedCount ?? 0) : 0),
    [R, I] = useState(testIsActive ? (B?.gradedCount ?? 0) : 0),
    _ = d[0],
    queueComplete = c.length > 0 && d.length === 0,
    showComplete = !testIsActive || queueComplete,
    y = useMemo(() => getNextLessonStep(e, t), [e, t]),
    batchMarkedCompleteRef = useRef(!1),
    verbFamilyMiss = useVerbFamilyWritingMiss(),
    [sayLoopForms, setSayLoopForms] = useState(null);
  useEffect(() => {
    verbFamilyMiss.trackPrompt(_);
  }, [_?.card.id, _?.cueSide, _?.passesRemaining, _?.verbFamilyFormIndex]);
  useEffect(() => {
    if (!testIsActive) {
      (setSayLoopForms(null), (batchMarkedCompleteRef.current = !0));
      return;
    }
    let session = getBatchSession(t);
    if (isBatchSessionValid(session, c.length) && session?.writingTest) {
      let restored = restoreWritingStudyPrompts(c, session.writingTest.queue, q.familyFormsByCardId);
      if (
        session.writingTest.queueVersion === WRITING_QUEUE_LOGIC_VERSION &&
        restored.length &&
        isValidFamilyWritingQueue(restored)
      ) {
        return;
      }
    }
    (f(buildQueue()), m(!1), g(0), I(0), setSayLoopForms(null), (batchMarkedCompleteRef.current = !1));
  }, [c, t, testIsActive, q.familyFormsByCardId]);
  useEffect(() => {
    if (!queueComplete || batchMarkedCompleteRef.current || stepComplete) return;
    batchMarkedCompleteRef.current = !0;
    (a(t, `writing-test`), o(t));
  }, [queueComplete, t, a, o, stepComplete]);
  useEffect(() => {
    if (stepComplete) return;
    c.length > 0 &&
      patchBatchSession(t, {
        phase: `writing-test`,
        cardCount: c.length,
        writingTest: {
          queue: d.map(serializeStudyPrompt),
          queueVersion: WRITING_QUEUE_LOGIC_VERSION,
          gradedCount: R,
          missedCount: h,
          isRevealed: p,
        },
      });
  }, [t, c.length, d, R, h, p, stepComplete]);
  if (c.length === 0) {
    return (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
        {<p className={`section-label`}>{n}</p>}
        {<p className={`mt-4 text-stone-400`}>{`No test items found for this ${getLearnUnitLabel(e, t).toLowerCase()}.`}</p>}
      </div>
    );
  }
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
      {<BatchStepMeta stepTitle={n} progress={`${R}/${z}`} />}
      {<PhaseRail active={`writing-test`} completedPhases={r} lessonId={e.id} stepId={t} onNavigate={s} />}
      {showComplete ? (
        <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
          {<p className={`section-label`}>{`Complete`}</p>}
          {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`${getLearnUnitLabel(e, t)} complete`}</p>}
          {
            <p className={`mt-3 text-sm text-stone-500`}>
              {`Missed/repeated: `}
              {h}
            </p>
          }
          {stepComplete && (
            <button
              type={`button`}
              onClick={() => setRetryingCompletedTest(!0)}
              className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}
            >{`Retake test`}</button>
          )}
          {y ? (
            <Fragment>
              {
                <button onClick={() => openLessonStep(e.id, y, s, l)} className={`final-test-link mx-auto ${stepComplete ? `mt-4` : `mt-8`} text-[#e8d7a1]`}>
                  {getStepContinueLabel(y)}
                </button>
              }
              {
                <button
                  type={`button`}
                  onClick={() =>
                    s({
                      name: `lesson`,
                      lessonId: e.id,
                    })
                  }
                  className={`mx-auto mt-4 text-sm text-stone-500 underline-offset-4 hover:text-stone-300 hover:underline`}
                >{`Return to lesson`}</button>
              }
            </Fragment>
          ) : (
            <button
              onClick={() =>
                s({
                  name: `lesson`,
                  lessonId: e.id,
                })
              }
              className={`final-test-link mx-auto mt-8`}
            >{`Return to lesson`}</button>
          )}
        </section>
      ) : (
        <div className={`study-phase-shell`}>
          {sayLoopForms ? (
            <WritingFamilyMissSayLoop
              forms={sayLoopForms}
              onComplete={() => {
                (setSayLoopForms(null),
                  verbFamilyMiss.resetAfterFamily(),
                  f((queue) => advanceWritingStudyQueueAfterFamilyMiss(queue)),
                  m(!1));
              }}
            />
          ) : (
            _ && (
            <WritingStudyPanel
              key={`${_?.card.id}:${_?.cueSide}:${_?.passesRemaining}:${getVerbFamilyFormPartIndex(_)}`}
              prompt={_}
              isRevealed={p}
              cueContextCards={c}
              onReveal={() => m(!0)}
              onAdvance={(wasCorrect) => {
                if (!wasCorrect && _?.verbFamilyFormPart && _?.verbFamilyForms?.length) {
                  (verbFamilyMiss.noteFormResult(!1),
                    g((count) => count + 1));
                  let reviewCard = _.verbFamilyForms[0] ?? _.card;
                  (recordLessonFamilyMiss(e.id, reviewCard, _.cueSide, _.verbFamilyForms),
                    recordMemorizationMiss(toReviewableCard(e.id)(reviewCard), e, i),
                    setSayLoopForms(_.verbFamilyForms),
                    m(!1));
                  return;
                }
                if (!wasCorrect && _ && !_.verbFamilyFormPart) {
                  (recordLessonFamilyMiss(e.id, _.card, _.cueSide, _.verbFamilyForms),
                    recordMemorizationMiss(toReviewableCard(e.id)(_.card), e, i),
                    g((count) => count + 1),
                    setSayLoopForms(_.verbFamilyForms ?? [_.card]),
                    m(!1));
                  return;
                }
                _?.verbFamilyFormPart && verbFamilyMiss.noteFormResult(wasCorrect);
                let familyHadMiss = verbFamilyMiss.getFamilyHadMiss(),
                  familyComplete = _ ? !_.verbFamilyFormPart || isLastVerbFamilyFormPart(_, d.length - 1) : !1,
                  familyCorrect = wasCorrect && !familyHadMiss;
                (f((queue) => {
                  let [prompt] = queue;
                  if (prompt) {
                    if (familyComplete && !familyCorrect) {
                      let reviewCard = prompt.verbFamilyForms?.[0] ?? prompt.card;
                      (recordLessonFamilyMiss(e.id, reviewCard, prompt.cueSide, prompt.verbFamilyForms),
                        recordMemorizationMiss(toReviewableCard(e.id)(reviewCard), e, i));
                    } else if (!prompt.verbFamilyFormPart && !wasCorrect) {
                      (recordLessonFamilyMiss(e.id, prompt.card, prompt.cueSide, prompt.verbFamilyForms),
                        recordMemorizationMiss(toReviewableCard(e.id)(prompt.card), e, i));
                    }
                  }
                  return advanceWritingStudyQueue(queue, wasCorrect, familyHadMiss);
                }),
                  familyComplete && verbFamilyMiss.resetAfterFamily(),
                  m(!1),
                  _ && shouldIncrementWritingProgress(_, wasCorrect, `repeat-until-correct`, familyHadMiss) && I((count) => count + 1),
                  familyComplete && !familyCorrect && g((count) => count + 1));
              }}
            />
            )
          )}
        </div>
      )}
    </div>
  );
}
function BatchStepMeta({ stepTitle: e, progress: t }) {
  return (
    <div className={`batch-step-meta shrink-0`}>
      {<p className={`min-w-0 truncate`}>{e}</p>}
      {t && <p className={`shrink-0 tabular-nums`}>{t}</p>}
    </div>
  );
}
function PhaseRail({ active: e, completedPhases: t, lessonId: n, stepId: r, disabled: i = !1, onNavigate: a }) {
  let o = BATCH_PHASES.findIndex((t) => t.id === e);
  return (
    <nav className={`phase-rail shrink-0 border-b border-[#d6b56d]/10`} aria-label={`Batch phases`}>
      {BATCH_PHASES.map((s, c) => {
        let l = s.id === e,
          u = l || t.includes(s.id) || (c === o + 1 && t.includes(e));
        return (
          <button
            type={`button`}
            title={s.label}
            disabled={i || !u}
            onClick={() =>
              a({
                name: `batch`,
                lessonId: n,
                stepId: r,
                phase: s.id,
              })
            }
            className={`phase-rail-tab disabled:cursor-default ${l ? `is-active` : u ? `is-accessible` : ``}`}
          >
            {s.shortLabel}
          </button>
        );
      })}
    </nav>
  );
}
function VocabularyTestScreen({ lesson: e, stepId: t, completedStepIds: n, onStepComplete: r, onNavigate: i }) {
  let a = e.steps.find((e) => e.id === t),
    j = a?.kind === `batch-review`,
    R = a?.kind === `batch-review` || a?.kind === `vocabulary-test`,
    o = getVocabularyTestSection(t),
    s = o === `nouns` ? `nouns` : o === `verbs` ? `verbs` : o === `phrases` ? `phrases` : (a?.section ?? null),
    c = useMemo(() => getWritingStudyCardsForStep(e, t), [e, t]),
    q = useMemo(() => prepareWritingTestCardsForStep(e, t), [e, t]),
    N = useMemo(() => getWritingConfigForStep(e, t), [e, t]),
    u = useMemo(() => writingTestFamilyTotal(q.cards, q.familyFormsByCardId), [q.cards, q.familyFormsByCardId]),
    [d, f] = useState(`intro`),
    [p, m] = useState([]),
    [h, g] = useState(!1),
    [_, v] = useState(0),
    [C, w] = useState(0),
    y = p[0],
    b = d === `study` && q.cards.length > 0 && p.length === 0,
    x = a?.title ?? `Test`,
    T = useMemo(() => getNextLessonStep(e, t), [e, t]),
    verbFamilyMiss = useVerbFamilyWritingMiss(),
    [sayLoopForms, setSayLoopForms] = useState(null);
  useEffect(() => {
    verbFamilyMiss.trackPrompt(y);
  }, [y?.card.id, y?.cueSide, y?.passesRemaining]);
  useEffect(() => {
    (f(`intro`), m([]), g(!1), v(0), w(0), setSayLoopForms(null));
  }, [q.cards, N]);
  let S = () => {
    (f(`study`), m(buildWritingStudyQueue(q.cards, N, R, q.familyFormsByCardId)), g(!1), v(0), w(0), setSayLoopForms(null));
  };
  return (!j && (!o || !s)) || q.cards.length === 0 ? (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
      {<p className={`section-label`}>{x}</p>}
      {<p className={`mt-4 text-stone-400`}>{`No cards found for this test.`}</p>}
    </div>
  ) : (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
      {
        <div className={`shrink-0 border-b border-[#d6b56d]/10 pb-4`}>
          {
            <div className={`flex items-end justify-between gap-4`}>
              {
                <div>
                  {
                    <p className={`section-label`}>
                      {`Lesson `}
                      {e.number}
                    </p>
                  }
                  {<h2 className={`mt-1.5 text-lg font-semibold tracking-tight text-[#e8d7a1]`}>{x}</h2>}
                </div>
              }
              {<p className={`text-xs text-stone-600`}>{d === `study` ? `${C}/${u}` : d === `review` ? `${q.cards.length} items` : `${u} prompts`}</p>}
            </div>
          }
        </div>
      }
      {d === `intro` && (
        <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
          {<p className={`section-label`}>{x}</p>}
          {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Ready?`}</p>}
          {
            <p className={`mx-auto mt-4 max-w-xs text-sm leading-6 text-stone-500`}>
              {j && usesFamilyWritingTest(a)
                ? `Write each Arabic form one at a time for every ${usesNounFamilyWritingTest(a) ? `noun family` : `verb family`} in this review. Reveal the answer to check that form, then mark correct or incorrect. Missed items repeat until you know them.`
                : j
                  ? `Write the Arabic for each English cue. Missed items repeat until you know them.`
                  : s === `verbs`
                    ? `Write each Arabic form one at a time for every verb family. Reveal the answer to check that form, then mark correct or incorrect. Missed items repeat until you know them.`
                    : s === `nouns`
                      ? `Write each Arabic form one at a time for every noun with a plural. Reveal the answer to check that form, then mark correct or incorrect. Missed items repeat until you know them.`
                      : `Write the Arabic for each English cue once. Reveal the answer, then mark correct or incorrect. Missed items repeat until you know them.`}
            </p>
          }
          {!j && s && <button onClick={() => f(`review`)} className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}>{`Review vocabulary`}</button>}
          {
            <button onClick={S} className={`${j ? `final-test-link mx-auto mt-8 text-[#e8d7a1]` : `mx-auto mt-4 text-sm text-stone-500 underline-offset-4 hover:text-stone-300 hover:underline`}`}>
              {j ? `Start review` : `Skip to test`}
            </button>
          }
        </section>
      )}
      {d === `review` && (
        <Fragment>
          {
            <div className={`shrink-0 border-b border-[#d6b56d]/10 py-3`}>
              {
                <div className={`flex items-center justify-between gap-4`}>
                  {<p className={`section-label`}>{`Section review`}</p>}
                  {
                    <button onClick={S} className={`final-test-link`}>
                      {`Start `}
                      {x}
                    </button>
                  }
                </div>
              }
            </div>
          }
          {<SectionVocabularyBrowse lesson={e} section={s} className={`min-h-0 flex-1`} />}
        </Fragment>
      )}
      {d === `study` && !b && (
        <div className={`study-phase-shell`}>
          {sayLoopForms ? (
            <WritingFamilyMissSayLoop
              forms={sayLoopForms}
              onComplete={() => {
                (setSayLoopForms(null),
                  verbFamilyMiss.resetAfterFamily(),
                  m((queue) => {
                    let next = advanceWritingStudyQueueAfterFamilyMiss(queue);
                    return (next.length === 0 && (r(t), f(`complete`)), next);
                  }),
                  g(!1));
              }}
            />
          ) : (
            y && (
            <WritingStudyPanel
              key={`${y?.card.id}:${y?.cueSide}:${y?.passesRemaining}:${getVerbFamilyFormPartIndex(y)}`}
              prompt={y}
              isRevealed={h}
              cueContextCards={q.cards}
              onReveal={() => g(!0)}
              onAdvance={(wasCorrect) => {
                if (!wasCorrect && y?.verbFamilyFormPart && y?.verbFamilyForms?.length) {
                  (verbFamilyMiss.noteFormResult(!1), v((count) => count + 1));
                  let reviewCard = y.verbFamilyForms[0] ?? y.card;
                  (recordLessonFamilyMiss(e.id, reviewCard, y.cueSide, y.verbFamilyForms),
                    recordMemorizationMiss(toReviewableCard(e.id)(reviewCard), e, n),
                    setSayLoopForms(y.verbFamilyForms),
                    g(!1));
                  return;
                }
                if (!wasCorrect && y && !y.verbFamilyFormPart) {
                  (recordLessonFamilyMiss(e.id, y.card, y.cueSide, y.verbFamilyForms),
                    recordMemorizationMiss(toReviewableCard(e.id)(y.card), e, n),
                    v((count) => count + 1),
                    setSayLoopForms(y.verbFamilyForms ?? [y.card]),
                    g(!1));
                  return;
                }
                y?.verbFamilyFormPart && verbFamilyMiss.noteFormResult(wasCorrect);
                let familyHadMiss = verbFamilyMiss.getFamilyHadMiss(),
                  familyComplete = y ? !y.verbFamilyFormPart || isLastVerbFamilyFormPart(y, p.length - 1) : !1,
                  familyCorrect = wasCorrect && !familyHadMiss;
                if (familyComplete && !familyCorrect && y) {
                  let reviewCard = y.verbFamilyForms?.[0] ?? y.card;
                  (recordLessonFamilyMiss(e.id, reviewCard, y.cueSide, y.verbFamilyForms),
                    recordMemorizationMiss(toReviewableCard(e.id)(reviewCard), e, n),
                    v((count) => count + 1));
                } else if (y && !y.verbFamilyFormPart && !wasCorrect) {
                  (recordLessonFamilyMiss(e.id, y.card, y.cueSide, y.verbFamilyForms),
                    recordMemorizationMiss(toReviewableCard(e.id)(y.card), e, n),
                    v((count) => count + 1));
                }
                (m((queue) => {
                  let next = advanceWritingStudyQueue(queue, wasCorrect, familyHadMiss);
                  return (next.length === 0 && (r(t), f(`complete`)), next);
                }),
                  familyComplete && verbFamilyMiss.resetAfterFamily(),
                  g(!1),
                  y && shouldIncrementWritingProgress(y, wasCorrect, `repeat-until-correct`, familyHadMiss) && w((count) => count + 1));
              }}
            />
            )
          )}
        </div>
      )}
      {(d === `complete` || b) && (
        <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
          {<p className={`section-label`}>{`Complete`}</p>}
          {
            <p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>
              {x}
              {` complete`}
            </p>
          }
          {
            <p className={`mt-3 text-sm text-stone-500`}>
              {`Missed/repeated: `}
              {_}
            </p>
          }
          {T ? (
            <Fragment>
              {
                <button onClick={() => openLessonStep(e.id, T, i)} className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}>
                  {getStepContinueLabel(T)}
                </button>
              }
              {
                <button
                  type={`button`}
                  onClick={() =>
                    i({
                      name: `lesson`,
                      lessonId: e.id,
                    })
                  }
                  className={`mx-auto mt-4 text-sm text-stone-500 underline-offset-4 hover:text-stone-300 hover:underline`}
                >{`Return to lesson`}</button>
              }
            </Fragment>
          ) : (
            <button
              onClick={() =>
                i({
                  name: `lesson`,
                  lessonId: e.id,
                })
              }
              className={`final-test-link mx-auto mt-8`}
            >{`Return to lesson`}</button>
          )}
        </section>
      )}
    </div>
  );
}
function DailyReviewScreen({ completedStepIds: e, onRecordStudyDay: t, onNavigate: n }) {
  let [reviewQueue, i] = useState([]),
    [a, o] = useState(!0),
    [s, c] = useState(`intro`),
    [u, d] = useState([]),
    [f, p] = useState([]),
    [m, h] = useState([]),
    [g, _] = useState(!1),
    [v, y] = useState(0),
    [b, x] = useState(0),
    studyPrep = useMemo(() => prepareDailyReviewStudyCards(reviewQueue), [reviewQueue]),
    S = useMemo(() => buildDailyReviewFlashcardQueue(reviewQueue, studyPrep).length, [reviewQueue, studyPrep]);
  useEffect(() => {
    (o(!0), c(`intro`), d([]), p([]), h([]), _(!1), y(0), x(0));
    let t = window.setTimeout(() => {
      (i(buildDailyReviewQueue(lessons, e, getReviewableCardsForLesson)), o(!1));
    }, 0);
    return () => window.clearTimeout(t);
  }, [e]);
  let C = s === `replay` ? f : u,
    w = C[0],
    T = studyPrep.cards.length,
    [sayLoopForms, setSayLoopForms] = useState(null);
  let E = () => {
      T !== 0 &&
        (c(`study`),
        d(buildDailyReviewFlashcardQueue(reviewQueue, studyPrep)),
        p([]),
        h([]),
        _(!1),
        y(0),
        x(0),
        setSayLoopForms(null));
    },
    D = () => {
      (v > 0 && t(), c(`complete`));
    },
    O = (e) => {
      let t = e.filter(
        (prompt, index, prompts) =>
          prompts.findIndex((candidate) => getDailyReviewPromptCardIds(candidate).join(`:`) === getDailyReviewPromptCardIds(prompt).join(`:`)) === index,
      );
      if (t.length === 0) {
        D();
        return;
      }
      let n = new Set(t.flatMap(getDailyReviewPromptCardIds)),
        a = reviewQueue.filter((card) => n.has(card.id)),
        o = prepareDailyReviewStudyCards(a);
      (p(buildDailyReviewFlashcardQueue(a, o)), c(`replay`), _(!1), setSayLoopForms(null));
    },
    finishFamilySayLoop = () => {
      (setSayLoopForms(null), _(!1));
      if (s === `replay`) {
        p((queue) => {
          let next = advanceStudyPromptQueue(queue, !1);
          return (next.length === 0 && D(), next);
        });
        return;
      }
      d((queue) => {
        let next = advanceStudyPromptQueue(queue, !1);
        if (next.length === 0) {
          h((missed) => (O(missed), missed));
        }
        return next;
      });
    },
    advanceReview = (wasCorrect, prompt) => {
      let reviewCardIds = getDailyReviewPromptCardIds(prompt);
      if (s !== `replay`) {
        reviewCardIds.forEach((cardId) => gradeDailyReviewPrompt(cardId, wasCorrect));
        wasCorrect ? y((count) => count + 1) : x((count) => count + 1);
      }
      _(!1);
      if (s === `replay`) {
        p((queue) => {
          let next = advanceStudyPromptQueue(queue, wasCorrect);
          return (next.length === 0 && D(), next);
        });
        return;
      }
      h((missed) => {
        let promptKey = reviewCardIds.join(`:`),
          nextMissed = !wasCorrect && !missed.some((item) => getDailyReviewPromptCardIds(item).join(`:`) === promptKey) ? [...missed, prompt] : missed;
        return (
          d((queue) => {
            let next = advanceStudyPromptQueue(queue, wasCorrect);
            return (next.length === 0 && O(nextMissed), next);
          }),
          nextMissed
        );
      });
    };
  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
      {
        <div className={`shrink-0 border-b border-[#d6b56d]/10 pb-4`}>
          {
            <div className={`flex items-end justify-between gap-4`}>
              {
                <div>
                  {<p className={`section-label`}>{`Review`}</p>}
                  {<h2 className={`mt-1.5 text-lg font-semibold tracking-tight text-[#e8d7a1]`}>{`Daily Review`}</h2>}
                </div>
              }
              {<p className={`text-xs text-stone-600`}>{s === `study` || s === `replay` ? `${v}/${S}` : `${T} due`}</p>}
            </div>
          }
        </div>
      }
      {a && <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>{<p className={`section-label`}>{`Loading review`}</p>}</section>}
      {!a && s === `intro` && (
        <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
          {<p className={`section-label`}>{`Today`}</p>}
          {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{T === 0 ? `Caught up` : `${T} items due`}</p>}
          {
            <p className={`mx-auto mt-4 max-w-xs text-sm leading-6 text-stone-500`}>
              {T === 0
                ? `No reviews are due from completed lessons right now.`
                : `Flip through each due item. See the English cue, recall the Arabic, then reveal and mark correct or incorrect. Items you miss repeat once at the end.`}
            </p>
          }
          {T > 0 && <button onClick={E} className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}>{`Start Review`}</button>}
        </section>
      )}
      {!a && (s === `study` || s === `replay`) && w && (
        <div className={`study-phase-shell`}>
          {s === `replay` && !sayLoopForms && <p className={`section-label shrink-0 py-4 text-center`}>{`Extra pass`}</p>}
          {sayLoopForms ? (
            <WritingMissSayLoop forms={sayLoopForms} onComplete={finishFamilySayLoop} />
          ) : (
            <FlashcardStudyPanel
              key={`${w?.card.id}:${w?.cueSide}:${w?.passesRemaining}`}
              prompt={w}
              isRevealed={g}
              onReveal={() => _(!0)}
              onAdvance={(wasCorrect) => {
                let prompt = C[0];
                if (!prompt) return;
                if (!wasCorrect) {
                  let reviewCardIds = getDailyReviewPromptCardIds(prompt),
                    sayForms = getDailyReviewPromptAnswerCards(prompt);
                  s !== `replay` && reviewCardIds.forEach((cardId) => gradeDailyReviewPrompt(cardId, !1));
                  s !== `replay` && x((count) => count + 1);
                  s !== `replay` &&
                    h((missed) =>
                      missed.some((item) => getDailyReviewPromptCardIds(item).join(`:`) === reviewCardIds.join(`:`)) ? missed : [...missed, prompt],
                    );
                  setSayLoopForms(sayForms);
                  _(!1);
                  return;
                }
                advanceReview(wasCorrect, prompt);
              }}
            />
          )}
        </div>
      )}
      {!a && s === `complete` && (
        <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
          {<p className={`section-label`}>{`Complete`}</p>}
          {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Review complete`}</p>}
          {
            <p className={`mt-3 text-sm text-stone-500`}>
              {`Graded: `}
              {v}
              {` · Missed: `}
              {b}
            </p>
          }
          {
            <button
              onClick={() =>
                n({
                  name: `home`,
                })
              }
              className={`final-test-link mx-auto mt-8`}
            >{`Return Home`}</button>
          }
        </section>
      )}
    </div>
  );
}
function LessonReviewScreen({ lesson: e, completedStepIds: t, onStepComplete: n, onNavigate: r }) {
  let i = useMemo(() => getCachedLessonExposureCards(e), [e]),
    q = useMemo(() => prepareLessonTestWritingCards(i), [i]),
    L = useMemo(() => buildLessonTestWritingConfig(), []),
    P = useMemo(() => writingTestFamilyTotal(q.cards, q.familyFormsByCardId), [q.cards, q.familyFormsByCardId]),
    [o, s] = useState(`intro`),
    [c, u] = useState([]),
    [d, f] = useState(!1),
    [p, m] = useState(0),
    [h, g] = useState(0),
    _ = c[0],
    v = o === `recall` && q.cards.length > 0 && c.length === 0,
    y = `${e.id}-final`,
    verbFamilyMiss = useVerbFamilyWritingMiss(),
    [sayLoopForms, setSayLoopForms] = useState(null);
  useEffect(() => {
    verbFamilyMiss.trackPrompt(_);
  }, [_?.card.id, _?.cueSide, _?.passesRemaining, _?.verbFamilyFormIndex]);
  return (
    useEffect(() => {
      (s(`intro`), u([]), f(!1), m(0), g(0), setSayLoopForms(null));
    }, [i]),
    useEffect(() => {
      t.includes(y) && syncReviewPool(lessons, t, getReviewableCardsForLesson);
    }, [t, y]),
    i.length === 0 ? (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
        {<p className={`section-label`}>{`Lesson Test`}</p>}
        {<p className={`mt-4 text-stone-400`}>{`No lesson items found for this test.`}</p>}
      </div>
    ) : (
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-6`}>
        {
          <div className={`shrink-0 border-b border-[#d6b56d]/10 pb-4`}>
            {
              <div className={`flex items-end justify-between gap-4`}>
                {
                  <div>
                    {
                      <p className={`section-label`}>
                        {`Lesson `}
                        {e.number}
                      </p>
                    }
                    {<h2 className={`mt-1.5 text-lg font-semibold tracking-tight text-[#e8d7a1]`}>{`Lesson Test`}</h2>}
                  </div>
                }
                {<p className={`text-xs text-stone-600`}>{o === `recall` ? `${h}/${P}` : `${P} prompts`}</p>}
              </div>
            }
          </div>
        }
        {o === `intro` && (
          <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
            {<p className={`section-label`}>{`All Sections`}</p>}
            {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Lesson test`}</p>}
            {<p className={`mx-auto mt-4 max-w-xs text-sm leading-6 text-stone-500`}>{`Write the Arabic for each English cue across the whole lesson. Verbs are tested form by form within each family. Incorrect items repeat until you know them.`}</p>}
            {
              <div className={`mt-8 grid grid-cols-3 gap-3 border-y border-[#d6b56d]/10 py-4 text-center`}>
                {
                  <div>
                    {<p className={`text-xl font-semibold text-stone-100`}>{countNounFamilyUnits(e.nouns)}</p>}
                    {<p className={`section-label mt-1`}>{`Nouns`}</p>}
                  </div>
                }
                {
                  <div>
                    {<p className={`text-xl font-semibold text-stone-100`}>{e.phrases.length}</p>}
                    {<p className={`section-label mt-1`}>{`Phrases`}</p>}
                  </div>
                }
                {
                  <div>
                    {<p className={`text-xl font-semibold text-stone-100`}>{e.verbs.length}</p>}
                    {<p className={`section-label mt-1`}>{`Verbs`}</p>}
                  </div>
                }
              </div>
            }
            {
              <button
                onClick={() => {
                  (s(`recall`), u(buildWritingStudyQueue(q.cards, L, !0, q.familyFormsByCardId)), f(!1), m(0), g(0), setSayLoopForms(null));
                }}
                className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}
              >{`Start test`}</button>
            }
          </section>
        )}
        {o === `recall` && !v && (
          <div className={`study-phase-shell`}>
            {sayLoopForms ? (
              <WritingFamilyMissSayLoop
                forms={sayLoopForms}
                onComplete={() => {
                  (setSayLoopForms(null),
                    verbFamilyMiss.resetAfterFamily(),
                    u((queue) => {
                      let next = advanceWritingStudyQueueAfterFamilyMiss(queue);
                      if (next.length === 0) {
                        clearLessonMisses(e.id);
                        n(y);
                        s(`complete`);
                      }
                      return next;
                    }),
                    f(!1));
                }}
              />
            ) : (
              _ && (
              <WritingStudyPanel
                key={`${_?.card.id}:${_?.cueSide}:${_?.passesRemaining}:${getVerbFamilyFormPartIndex(_)}`}
                prompt={_}
                isRevealed={d}
                cueContextCards={i}
                onReveal={() => f(!0)}
                onAdvance={(wasCorrect) => {
                  if (!wasCorrect && _?.verbFamilyFormPart && _?.verbFamilyForms?.length) {
                    (verbFamilyMiss.noteFormResult(!1), m((count) => count + 1));
                    let reviewCard = _.verbFamilyForms[0] ?? _.card;
                    recordMemorizationMiss(toReviewableCard(e.id)(reviewCard), e, t);
                    setSayLoopForms(_.verbFamilyForms);
                    f(!1);
                    return;
                  }
                  if (!wasCorrect && _ && !_.verbFamilyFormPart) {
                    (recordMemorizationMiss(toReviewableCard(e.id)(_.card), e, t),
                      m((count) => count + 1),
                      setSayLoopForms(_.verbFamilyForms ?? [_.card]),
                      f(!1));
                    return;
                  }
                  _?.verbFamilyFormPart && verbFamilyMiss.noteFormResult(wasCorrect);
                  let familyHadMiss = verbFamilyMiss.getFamilyHadMiss(),
                    familyComplete = _ ? !_.verbFamilyFormPart || isLastVerbFamilyFormPart(_, c.length - 1) : !1,
                    familyCorrect = wasCorrect && !familyHadMiss;
                  if (familyComplete && !familyCorrect && _) {
                    let reviewCard = _.verbFamilyForms?.[0] ?? _.card;
                    (recordMemorizationMiss(toReviewableCard(e.id)(reviewCard), e, t), m((count) => count + 1));
                  } else if (_ && !_.verbFamilyFormPart && !wasCorrect) {
                    (recordMemorizationMiss(toReviewableCard(e.id)(_.card), e, t), m((count) => count + 1));
                  }
                  (u((queue) => {
                    let next = advanceWritingStudyQueue(queue, wasCorrect, familyHadMiss);
                    if (next.length === 0) {
                      clearLessonMisses(e.id);
                      n(y);
                      s(`complete`);
                    }
                    return next;
                  }),
                    familyComplete && verbFamilyMiss.resetAfterFamily(),
                    f(!1),
                    _ && shouldIncrementWritingProgress(_, wasCorrect, `repeat-until-correct`, familyHadMiss) && g((count) => count + 1));
                }}
              />
              )
            )}
          </div>
        )}
        {(o === `complete` || v) && (
          <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
            {<p className={`section-label`}>{`Complete`}</p>}
            {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Lesson test complete`}</p>}
            {
              <p className={`mt-3 text-sm text-stone-500`}>
                {`Missed/repeated: `}
                {p}
              </p>
            }
            {
              <button
                onClick={() =>
                  r({
                    name: `lesson`,
                    lessonId: e.id,
                  })
                }
                className={`final-test-link mx-auto mt-8`}
              >{`Return to Lesson`}</button>
            }
          </section>
        )}
      </div>
    )
  );
}
function LessonVocabularyScreen({ lesson: e }) {
  return <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>{<LessonVocabularyBrowse lesson={e} title={`Vocabulary`} className={`min-h-0 flex-1`} />}</div>;
}
function SectionVocabularyBrowse({ lesson: e, section: t, className: n = `` }) {
  let [r, i] = useState(!0),
    [a, o] = useState(!0);
  return (
    <div className={`flex flex-col ${n}`}>
      {
        <div className={`shrink-0 border-b border-[#d6b56d]/10 bg-[#081511] py-3`}>
          {
            <div className={`flex items-end justify-between gap-8`}>
              {
                <button type={`button`} onClick={() => i((e) => !e)} className={`toggle-line text-[#e8d7a1]`}>
                  {r ? `Hide Arabic` : `Show Arabic`}
                </button>
              }
              {
                <button type={`button`} onClick={() => o((e) => !e)} className={`toggle-line text-right text-[#e8d7a1]`}>
                  {a ? `Hide English` : `Show English`}
                </button>
              }
            </div>
          }
        </div>
      }
      {
        <div className={`no-scrollbar min-w-0 flex-1 overflow-auto`}>
          {t === `nouns` && <NounVocabularyBrowseRows lesson={e} showArabic={r} showEnglish={a} />}
          {t === `verbs` && <VerbVocabularyBrowseRows lesson={e} verbs={e.verbs} showArabic={r} showEnglish={a} />}
          {t === `phrases` && <VocabularyBrowseRows rows={buildPhraseBrowseRows(e)} showArabic={r} showEnglish={a} />}
        </div>
      }
    </div>
  );
}
function LessonVocabularyBrowse({ lesson: e, title: t, className: n = `` }) {
  let r = [
      {
        id: `nouns`,
        label: `Nouns`,
        count: e.nouns.length,
      },
      {
        id: `phrases`,
        label: `Phrases`,
        count: e.phrases.length,
      },
      {
        id: `verbs`,
        label: `Verbs`,
        count: e.verbs.length,
      },
    ].filter((e) => e.count > 0),
    [i, a] = useState(r[0]?.id ?? `nouns`),
    [o, s] = useState(!0),
    [c, u] = useState(!0);
  return (
    <div className={`flex flex-col ${n}`}>
      {t && <div className={`shrink-0 border-b border-[#d6b56d]/10 pb-4`}>{<h2 className={`text-xl font-semibold tracking-tight text-[#e8d7a1]`}>{t}</h2>}</div>}
      {
        <div className={`shrink-0 border-b border-[#d6b56d]/10 bg-[#081511] py-3`}>
          {
            <div className={`flex items-end justify-between gap-8`}>
              {
                <button type={`button`} onClick={() => s((e) => !e)} className={`toggle-line text-[#e8d7a1]`}>
                  {o ? `Hide Arabic` : `Show Arabic`}
                </button>
              }
              {
                <button type={`button`} onClick={() => u((e) => !e)} className={`toggle-line text-right text-[#e8d7a1]`}>
                  {c ? `Hide English` : `Show English`}
                </button>
              }
            </div>
          }
        </div>
      }
      {
        <div className={`flex min-h-0 flex-1 border-t border-[#d6b56d]/10`}>
          {
            <nav className={`shrink-0 border-r border-[#d6b56d]/10 pr-3 pt-4`}>
              {
                <div className={`flex flex-col gap-4`}>
                  {r.map((e) => (
                    <button type={`button`} onClick={() => a(e.id)} className={`writing-vertical text-xs font-semibold uppercase tracking-wider ${i === e.id ? `text-[#d6b56d]` : `text-stone-600`}`}>
                      {e.label}
                    </button>
                  ))}
                </div>
              }
            </nav>
          }
          {
            <div className={`no-scrollbar min-w-0 flex-1 overflow-auto pl-4`}>
              {i === `nouns` && <NounVocabularyBrowseRows lesson={e} showArabic={o} showEnglish={c} />}
              {i === `verbs` && <VerbVocabularyBrowseRows lesson={e} verbs={e.verbs} showArabic={o} showEnglish={c} />}
              {i === `phrases` && <VocabularyBrowseRows rows={buildPhraseBrowseRows(e)} showArabic={o} showEnglish={c} />}
            </div>
          }
        </div>
      }
    </div>
  );
}
function VocabularyBrowseBatchDivider({ batchIndex: e, unitLabel: t = `Batch` }) {
  return (
    <div className={`border-b border-[#d6b56d]/20 bg-[#081511] py-2`} role={`separator`}>
      {<p className={`text-[0.65rem] font-semibold uppercase tracking-widest text-[#d6b56d]/65`}>{`${t} ${e + 1}`}</p>}
    </div>
  );
}
function BrowseMaskedText({ visible: e, children: t, className: n = ``, dir: r, lang: i, placeholderClassName: a = `` }) {
  return (
    <div className={`browse-text-slot ${n}`} dir={r} lang={i}>
      {<span className={e ? `` : `invisible`}>{t}</span>}
      {!e && <span className={`browse-text-placeholder ${a}`} aria-hidden={`true`}>{`••••`}</span>}
    </div>
  );
}
function BrowseEnglishMeaning({ visible: e, children: t }) {
  return (
    <BrowseMaskedText visible={e} className={`verb-family-meaning browse-english-meaning mb-3`} dir={`ltr`} lang={`en`}>
      {t}
    </BrowseMaskedText>
  );
}
function BrowseArabicSlot({ visible: e, imageUrl: t, alt: n, text: r, className: i = `arabic-review-image` }) {
  return (
    <div className={`browse-arabic-slot`}>
      {e ? (
        t ? (
          <VocabularyImage src={t} alt={n} className={i} />
        ) : (
          <p className={`arabic text-xl font-medium text-[#e8d7a1]`}>{r}</p>
        )
      ) : (
        <div className={`browse-arabic-placeholder`} aria-hidden={`true`}>
          {`••••`}
        </div>
      )}
    </div>
  );
}
function NounVocabularyBrowseRows({ lesson: e, showArabic: t, showEnglish: n }) {
  let r = buildNounBrowseFamilies(e);
  return (
    <section>
      {r.length === 0 ? (
        <p className={`py-5 text-sm text-stone-500`}>{`No items to show.`}</p>
      ) : (
        r.map((a, o) => (
          <Fragment key={a.id}>
            {(o === 0 || a.batchIndex !== r[o - 1].batchIndex) && <VocabularyBrowseBatchDivider batchIndex={a.batchIndex} unitLabel={`Batch`} />}
            <div className={`border-b border-[#d6b56d]/10 py-4`}>
              {<BrowseEnglishMeaning visible={n}>{a.meaning}</BrowseEnglishMeaning>}
              {
                <div
                  className={`grid gap-3 text-sm ${a.forms.length > 1 ? `grid-cols-2` : `mx-auto grid-cols-1 max-w-[11rem]`}`}
                  dir={`rtl`}
                >
                  {NOUN_FORM_ORDER.map((i) => {
                    let c = a.forms.find((form) => form.key === i);
                    if (!c) return null;
                    return (
                      <div key={i} className={`relative border-s border-[#d6b56d]/10 ps-3 pe-10`}>
                        {c.weak && <p className={`absolute end-0 top-0 text-[0.55rem] font-medium uppercase tracking-widest text-[#d6b56d]/55`}>{`weak`}</p>}
                        {
                          <p className={`text-xs font-semibold text-[#d6b56d]/60`} lang={`ar`} dir={`rtl`}>
                            {NOUN_FORM_ARABIC_LABELS[i]}
                          </p>
                        }
                        {<BrowseArabicSlot visible={t} imageUrl={c.imageUrl} alt={NOUN_FORM_ARABIC_LABELS[i]} text={c.arabic} />}
                      </div>
                    );
                  })}
                </div>
              }
            </div>
          </Fragment>
        ))
      )}
    </section>
  );
}
function VocabularyBrowseRows({ rows: e, showArabic: t, showEnglish: n }) {
  return (
    <section>
      {e.length === 0 ? (
        <p className={`py-5 text-sm text-stone-500`}>{`No items to show.`}</p>
      ) : (
        e.map((r, i) => (
          <Fragment key={r.id}>
            {(i === 0 || r.batchIndex !== e[i - 1].batchIndex) && <VocabularyBrowseBatchDivider batchIndex={r.batchIndex} />}
            <div className={`relative border-b border-[#d6b56d]/10 py-3 text-sm`}>
              {r.weak && <p className={`absolute right-0 top-3 text-[0.55rem] font-medium uppercase tracking-widest text-[#d6b56d]/55`}>{`weak`}</p>}
              {
                <div className={`grid grid-cols-2 gap-3 pr-12`}>
                  {<BrowseArabicSlot visible={t} imageUrl={r.imageUrl} alt={r.english} text={r.arabic} />}
                  {
                    <BrowseMaskedText visible={n} className={`font-medium text-stone-300`} dir={`ltr`} lang={`en`}>
                      {formatEnglishCueText({ id: r.id, english: r.english, arabic: r.arabic, section: `phrases` })}
                    </BrowseMaskedText>
                  }
                </div>
              }
            </div>
          </Fragment>
        ))
      )}
    </section>
  );
}
function VerbVocabularyBrowseRows({ lesson: e, verbs: t, showArabic: n, showEnglish: r }) {
  let a = buildVerbBrowseBatches(t);
  return (
    <section>
      {a.length === 0 ? (
        <p className={`py-5 text-sm text-stone-500`}>{`No items to show.`}</p>
      ) : (
        a.map((o, s) => (
          <Fragment key={o.verb.id}>
            {(s === 0 || o.batchIndex !== a[s - 1].batchIndex) && <VocabularyBrowseBatchDivider batchIndex={o.batchIndex} unitLabel={`Batch`} />}
            <div className={`border-b border-[#d6b56d]/10 py-4`}>
              {<BrowseEnglishMeaning visible={r}>{getVerbFamilyBrowseMeaning(o.verb)}</BrowseEnglishMeaning>}
              {
                <div
                  className={`grid gap-3 text-sm ${getVerbBrowseCells(o.verb).length > 2 ? `grid-cols-2` : `mx-auto grid-cols-1 max-w-[11rem]`}`}
                  dir={`rtl`}
                >
                  {getVerbBrowseCells(o.verb).map((cell) =>
                    cell.kind === `harf` ? (
                      <div key={`harf`} className={`relative border-s border-[#d6b56d]/10 ps-3 pe-10`}>
                        {
                          <p className={`text-xs font-semibold text-[#d6b56d]/60`} lang={`ar`} dir={`rtl`}>
                            {VERB_HARF_ARABIC_LABEL}
                          </p>
                        }
                        {
                          <BrowseMaskedText visible={n} className={`arabic text-xl font-medium text-[#e8d7a1]`} dir={`rtl`} lang={`ar`}>
                            {cell.arabic}
                          </BrowseMaskedText>
                        }
                      </div>
                    ) : (
                      <div key={cell.key} className={`relative border-s border-[#d6b56d]/10 ps-3 pe-10`}>
                        {cell.weak && <p className={`absolute end-0 top-0 text-[0.55rem] font-medium uppercase tracking-widest text-[#d6b56d]/55`}>{`weak`}</p>}
                        {
                          <p className={`text-xs font-semibold text-[#d6b56d]/60`} lang={`ar`} dir={`rtl`}>
                            {getVerbFormLabel(cell.key)}
                          </p>
                        }
                        {
                          <BrowseArabicSlot
                            visible={n}
                            imageUrl={cell.imageUrl ? vocabularyImageUrl(e, cell.imageUrl) : undefined}
                            alt={getVerbFormLabel(cell.key)}
                            text={cell.arabic}
                          />
                        }
                      </div>
                    ),
                  )}
                </div>
              }
            </div>
          </Fragment>
        ))
      )}
    </section>
  );
}
function ProgressBar({ value: e, dark: t = !1 }) {
  return (
    <div className={`mt-3 h-px overflow-hidden ${t ? `bg-white/10` : `bg-[#d6b56d]/10`}`}>
      {
        <div
          className={`h-full bg-[#d6b56d]`}
          style={{
            width: `${e}%`,
          }}
        />
      }
    </div>
  );
}
bootstrapPwa();
createRoot(document.getElementById("root")!).render(<App />);
