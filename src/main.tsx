// @ts-nocheck
import "./styles.css";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleDot, Lock } from "lucide-react";
import { EXPOSURE_SAY_REPS_ARABIC, EXPOSURE_SAY_REPS_ENGLISH, EXPOSURE_WRITES, getLessonLevel, getMemoryMatchCleanRunsRequired, MATCH_SECONDS_PER_PAIR, MC_SECONDS } from "./config";
import { lessons } from "./data";
import { buildNounBrowseRows, buildPhraseBrowseRows, buildVerbBrowseBatches, getBatchExposureCards, getCachedLessonExposureCards, getVerbFormEnglish, getVerbFormLabel, vocabularyImageUrl } from "./exposure-cards";
import { getReviewableCardsForLesson, getStepContinueLabel, getVocabularyTestSection, getWritingConfigForStep, getWritingStudyCardsForStep, resolveDailyReviewCards, toReviewableCard } from "./lesson-study";
import { clearLessonMisses, getLessonMissedCuePasses, recordLessonMiss } from "./lesson-misses";
import { warmVocabularyCache, useOfflineWarmProgress } from "./offline-cache";
import { COMPLETED_PHASES_STORAGE_KEY, COMPLETED_STEPS_STORAGE_KEY, applyLesson2AndStreakReset, getCurrentLesson, getEffectiveMemorizationSteps, getLessonProgressSummary, getLessonStatus, getNextLessonStep, isLessonComplete } from "./progress";
import { applyPrerequisiteReviewCreditMigration, applyStaggeredReviewScheduleMigration, buildDailyReviewQueue, getDailyReviewStats, gradeReviewCard, recordMemorizationMiss, syncReviewPool } from "./review";
import { resetStreak, recordStudyActivity, readStreak } from "./streak";
import {
  BATCH_TEST_WRITING_CONFIG,
  DAILY_REVIEW_WRITING_CONFIG,
  advanceStudyPromptQueue,
  buildLessonTestWritingConfig,
  buildMultipleChoiceStudyQueue,
  buildWritingStudyQueue,
  getArabicMultipleChoiceOptions,
  getEnglishMultipleChoiceOptions,
  getEnglishAnswer,
  getArabicAnswer,
  multipleChoicePromptTotal,
  writingTestPromptTotal,
  type StudyPrompt,
} from "./study-queue";
import { shuffle } from "./shuffle";
import type { BatchPhase, ExposureCard, Lesson, LessonStep, SectionKind, VerbFormKey, VerbFamily } from "./types";
import { VocabularyImage } from "./VocabularyImage";
type ScreenState =
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
    detail: "Match every pair before time runs out. Miss or time out and you must clear the board twice in a row.",
  },
  {
    id: "multiple-choice",
    label: "Multiple Choice",
    shortLabel: "Choice",
    detail: "Pick the right answer from distractors drawn outside this batch.",
  },
  {
    id: "writing-test",
    label: "Test",
    shortLabel: "Test",
    detail: "Write Arabic from English cues and English from Arabic cues, then mark correct or incorrect.",
  },
];
const APP_BRANDING = {
  english: "Thabit",
  arabic: "ثابت",
};
const SWIPE_EDGE_MAX_X = 36;
const SWIPE_BACK_MIN_DELTA_X = 72;
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
  let [screen, setScreen] = useState<ScreenState>({ name: "home" }),
    [n, r] = useState(() => loadBootstrapState().streak),
    [i, a] = useState(() => loadBootstrapState().progress.completedBatchPhases),
    [o, s] = useState(() => loadBootstrapState().progress.completedStepIds);
  (useEffect(() => {
    window.localStorage.setItem(COMPLETED_PHASES_STORAGE_KEY, JSON.stringify(i));
  }, [i]),
    useEffect(() => {
      window.localStorage.setItem(COMPLETED_STEPS_STORAGE_KEY, JSON.stringify(o));
    }, [o]),
    useEffect(() => {
      (applyStaggeredReviewScheduleMigration(), syncReviewPool(lessons, o, getReviewableCardsForLesson), applyPrerequisiteReviewCreditMigration(lessons, getReviewableCardsForLesson));
    }, [o]),
    useEffect(() => {
      void warmVocabularyCache();
    }, []));
  let c = screen.name !== `home` && screen.name !== `daily-review` ? lessons.find((t) => t.id === screen.lessonId) : void 0,
    u = screen.name !== `home`,
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
      (s((t) => (t.includes(e) ? t : [...t, e])), r(recordStudyActivity()));
    };
  return (
    <div className={`min-h-[100dvh] bg-[#07130f] text-stone-100`}>
      {
        <main
          className={`app-shell mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-2xl shadow-black/40`}
        >
          {<AppHeader screen={screen} lesson={c} onBack={d} />}
          {
            <div className={`no-scrollbar min-h-0 flex-1 overflow-auto`}>
              {screen.name === `home` && <HomeScreen streak={n} completedStepIds={o} onNavigate={setScreen} />}
              {screen.name === `daily-review` && <DailyReviewScreen completedStepIds={o} onRecordStudyDay={() => r(recordStudyActivity())} onNavigate={setScreen} />}
              {screen.name === `lesson` && c && <LessonScreen lesson={c} completedStepIds={o} onNavigate={setScreen} />}
              {screen.name === `lesson-vocabulary` && c && <LessonVocabularyScreen lesson={c} />}
              {screen.name === `batch` && c && <BatchScreen lesson={c} stepId={screen.stepId} phase={screen.phase} completedPhases={i[screen.stepId] ?? []} onPhaseComplete={f} onStepComplete={p} completedStepIds={o} onNavigate={setScreen} />}
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
              {e.name !== `home` && (
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
function LessonScreen({ lesson: e, completedStepIds: t, onNavigate: n }) {
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
          {<LessonStepSection title={`Nouns`} steps={o.nouns} lesson={e} onNavigate={n} />}
          {<LessonStepSection title={`Phrases`} steps={o.phrases} lesson={e} onNavigate={n} />}
          {<LessonStepSection title={`Verbs`} steps={o.verbs} lesson={e} onNavigate={n} />}
          {<LessonStepSection title={`Test`} steps={o.final} lesson={e} onNavigate={n} />}
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
function LessonStepSection({ title: e, steps: t, lesson: n, onNavigate: r }) {
  return t.length === 0 ? null : (
    <section>
      {<h2 className={`section-label mb-2`}>{e}</h2>}
      {
        <div className={`divide-y divide-[#d6b56d]/10`}>
          {t.map((e) => (
            <button disabled={e.status === `locked`} onClick={() => openLessonStep(n.id, e, r)} className={`click-row w-full py-4 pl-3 pr-1 text-left disabled:cursor-default disabled:opacity-35`} aria-disabled={e.status === `locked`}>
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
function openLessonStep(e, t, n) {
  if (t.kind === `batch`) {
    n({
      name: `batch`,
      lessonId: e,
      stepId: t.id,
      phase: `exposure`,
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
const getLearnUnitLabel = (lesson: Lesson, stepId: string) => {
  let section = lesson.steps.find((step) => step.id === stepId)?.section;
  return section === `verbs` ? `Family` : `Batch`;
};
function BatchScreen({ lesson: e, stepId: t, phase: n, completedPhases: r, completedStepIds: i, onPhaseComplete: a, onStepComplete: o, onNavigate: s }) {
  let c = e.steps.find((e) => e.id === t),
    u = getLearnUnitLabel(e, t),
    l = i.includes(t) || isLessonComplete(e, i) ? BATCH_PHASES.map((e) => e.id) : r;
  return n === `exposure` ? (
    <ExposurePhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={l} onPhaseComplete={a} onNavigate={s} />
  ) : n === `memory-match` ? (
    <MemoryMatchPhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={l} onPhaseComplete={a} onNavigate={s} />
  ) : n === `multiple-choice` ? (
    <MultipleChoicePhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={l} onPhaseComplete={a} onNavigate={s} />
  ) : n === `writing-test` ? (
    <WritingTestPhase lesson={e} stepId={t} stepTitle={c?.title ?? u} completedPhases={l} completedStepIds={i} onPhaseComplete={a} onStepComplete={o} onNavigate={s} />
  ) : null;
}
const SAY_ORB_ANCHORS = ["center", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
const pickDifferentAnchor = (current: string) => {
  if (SAY_ORB_ANCHORS.length <= 1) return SAY_ORB_ANCHORS[0];
  let next = current;
  while (next === current) next = SAY_ORB_ANCHORS[Math.floor(Math.random() * SAY_ORB_ANCHORS.length)]!;
  return next;
};
function ExposurePhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, onPhaseComplete: i, onNavigate: a }) {
  let o = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    [s, c] = useState(0),
    [u, d] = useState(EXPOSURE_SAY_REPS_ARABIC),
    [f, p] = useState(EXPOSURE_SAY_REPS_ENGLISH),
    [m, h] = useState(`arabic`),
    [g, _] = useState(`center`),
    [v, y] = useState(0),
    [b, x] = useState(0),
    [S, C] = useState(`arabic`),
    [w, T] = useState(!1),
    [isExtraPractice, setIsExtraPractice] = useState(!1),
    [isPadDrawing, setIsPadDrawing] = useState(!1),
    E = o[s],
    D = u === 0 && f === 0,
    k = D,
    le = v >= EXPOSURE_WRITES,
    M = k && le && !isExtraPractice,
    N = k && !M,
    re = m === `arabic` ? u : f,
    ie = (e) => {
      (c(e), d(EXPOSURE_SAY_REPS_ARABIC), p(EXPOSURE_SAY_REPS_ENGLISH), h(`arabic`), _(`center`), y(0), C(`arabic`), setIsExtraPractice(!1), setIsPadDrawing(!1), T(!1), x((n) => n + 1));
    },
    ae = () => x((e) => e + 1),
    oe = () => {
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
    },
    se = () => {
      (setIsExtraPractice(!0), C(`arabic`), T(!1), ae());
    },
    ce = isExtraPractice ? v + 1 : Math.min(v + 1, EXPOSURE_WRITES);
  return E ? (
    <div className={`flex h-full min-h-0 flex-col px-5 ${k ? `overflow-hidden py-4` : `py-5`}`}>
      {<BatchStepMeta stepTitle={n} progress={`${s + 1}/${o.length}`} />}
      {<PhaseRail active={`exposure`} completedPhases={r} lessonId={e.id} stepId={t} onNavigate={a} />}
      {M ? (
        <section className={`exposure-word-choice min-h-0 flex-1 flex flex-col justify-center py-6 text-center`}>
          {<ArabicCardFace card={E} />}
          {
            <p lang={`en`} dir={`ltr`} className={`mt-3 text-base text-stone-300`}>
              {E.english}
            </p>
          }
          {
            <div className={`mt-8 flex flex-col items-center gap-2`}>
              {
                <button type={`button`} onClick={oe} className={`nav-text-action text-[#e8d7a1]`}>
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
            <div className={`writing-surface-host min-h-0 flex flex-1 flex-col overflow-hidden${isPadDrawing ? ` is-drawing` : ``}`} onSelectStart={blockWritingSurfaceEvent} onDragStart={blockWritingSurfaceEvent}>
              {<ExposureWriteCue card={E} writingLanguage={S} onClearPad={ae} />}
              {<MultiStripWritingPad clearToken={b} onHasInkChange={T} onDrawingChange={setIsPadDrawing} />}
            </div>
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
                    <button type={`button`} onClick={oe} className={`text-xs font-semibold text-stone-600`}>
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
                <p lang={`en`} dir={`ltr`} className={`mt-3 text-lg ${m === `english` ? `exposure-say-face is-active text-stone-100` : `exposure-say-face is-dimmed text-stone-300`}`}>
                  {E.english}
                </p>
              }
            </div>
          }
          {
            <div className={`exposure-say-action-zone shrink-0`} aria-label={`Say button area`}>
              {
                <div className={`exposure-say-orb-wrap anchor-${g}`}>
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
                          (p((e) => Math.max(0, e - 1)), h(`arabic`), _((e) => pickDifferentAnchor(e)));
                        }
                      }}
                      className={`repeat-orb compact-repeat-orb disabled:opacity-45${m === `english` ? ` repeat-orb-awaiting-move` : ``}`}
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
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
      {<p className={`section-label`}>{n}</p>}
      {<p className={`mt-4 text-stone-400`}>{`No exposure cards found for this ${getLearnUnitLabel(e, t).toLowerCase()}.`}</p>}
    </div>
  );
}
function ExposureWriteCue({ card: e, writingLanguage: t, onClearPad: n }) {
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
              {<button type={`button`} onClick={n} className={`text-xs font-semibold text-stone-500`}>{`Clear pad`}</button>}
              {
                <button
                  type={`button`}
                  className={`exposure-write-cue-peek rounded px-2.5 py-1.5`}
                  aria-label={`Hold to peek at translation`}
                  onPointerDown={() => i(!0)}
                  onPointerUp={s}
                  onPointerLeave={s}
                  onPointerCancel={s}
                >{`Hold to peek`}</button>
              }
            </div>
          }
        </div>
      }
      {<p className={`mb-2 text-center text-[0.68rem] leading-snug text-stone-500`}>{o}</p>}
      {
        <div className={`space-y-2 text-center`}>
          {a === `english` ? (
            <p lang={`en`} dir={`ltr`} className={`exposure-write-cue-text text-base text-stone-300`}>
              {e.english}
            </p>
          ) : e.imageUrl ? (
            <VocabularyImage src={e.imageUrl} alt={e.english} className={`exposure-write-cue-image`} />
          ) : (
            <p lang={`ar`} dir={`rtl`} className={`exposure-write-cue-text arabic text-2xl font-semibold text-[#e8d7a1]`}>
              {e.arabic}
            </p>
          )}
          {r &&
            (t === `arabic` ? (
              e.imageUrl ? (
                <VocabularyImage src={e.imageUrl} alt={e.english} className={`exposure-write-cue-image opacity-90`} />
              ) : (
                <p lang={`ar`} dir={`rtl`} className={`exposure-write-cue-text arabic text-2xl font-semibold text-[#e8d7a1]/90`}>
                  {e.arabic}
                </p>
              )
            ) : (
              <p lang={`en`} dir={`ltr`} className={`exposure-write-cue-text text-base text-stone-400`}>
                {e.english}
              </p>
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
function MultiStripWritingPad({ clearToken: e, onHasInkChange: t, onDrawingChange: n, className: r = `` }) {
  let [i, a] = useState(INITIAL_WRITING_STRIPS),
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
    (s(!1), (c.current = 0), n?.(!1), a(INITIAL_WRITING_STRIPS), t(!1));
  }, [e, t, n]),
    useLayoutEffect(() => {
      let e = l.current;
      e &&
        ((e.scrollTop = 0),
        requestAnimationFrame(() => {
          e.scrollTop = 0;
        }));
    }, [e]),
    useEffect(() => {
      let e = () => f();
      return (
        window.addEventListener(`pointerup`, e),
        window.addEventListener(`pointercancel`, e),
        window.addEventListener(`touchend`, e),
        () => (window.removeEventListener(`pointerup`, e), window.removeEventListener(`pointercancel`, e), window.removeEventListener(`touchend`, e), f())
      );
    }, [f]));
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
function ArabicCardFace({ card: e, className: t = `` }) {
  return e.imageUrl ? (
    <VocabularyImage src={e.imageUrl} alt={e.english} className={`arabic-inline-image ${t}`} />
  ) : (
    <p lang={`ar`} className={`arabic text-5xl font-semibold leading-[1.9] text-[#e8d7a1] ${t}`}>
      {e.arabic}
    </p>
  );
}
function WritingStudyPanel({ prompt: e, isRevealed: t, onReveal: n, onAdvance: r }) {
  let { card: i, cueSide: a } = e,
    o = a === `arabic` ? `english` : `arabic`,
    [s, c] = useState(!1),
    [u, d] = useState(0),
    [f, p] = useState(!1),
    [isPadDrawing, setIsPadDrawing] = useState(!1),
    m = () => {
      (p(!0), t || n());
    },
    h = () => d((e) => e + 1);
  return (
    useEffect(() => {
      (c(!1), d((e) => e + 1), p(!1), setIsPadDrawing(!1));
    }, [e.card.id, e.cueSide, e.passesRemaining]),
    (
      <Fragment>
        {
          <section className={`writing-flashcard-study flex min-h-0 flex-1 flex-col overflow-hidden py-3`}>
            {<p className={`section-label shrink-0 text-center`}>{o === `arabic` ? `Write the Arabic` : `Write the English meaning`}</p>}
            {
              <div className={`writing-surface-host flex min-h-0 flex-1 flex-col overflow-hidden${isPadDrawing ? ` is-drawing` : ``}`} onSelectStart={blockWritingSurfaceEvent} onDragStart={blockWritingSurfaceEvent}>
                {<div className={`mt-3 shrink-0 text-center`}>{a === `arabic` ? <ArabicCardFace card={i} /> : <p className={`text-2xl font-semibold text-stone-100`}>{i.english}</p>}</div>}
                {
                  <div className={`flex min-h-0 flex-1 flex-col`}>
                    {<div className={`flex shrink-0 justify-end pb-1`}>{<button type={`button`} onClick={h} className={`text-xs font-semibold text-stone-500`}>{`Clear pad`}</button>}</div>}
                    {<div className={`writing-flashcard-pad py-2 ${t ? `writing-flashcard-pad-revealed` : ``}`}>{<MultiStripWritingPad clearToken={u} onHasInkChange={c} onDrawingChange={setIsPadDrawing} />}</div>}
                    {t ? (
                      <div className={`writing-flashcard-answer-zone mt-2 border-t border-[#d6b56d]/10 pt-4 text-center`}>
                        {<p className={`section-label`}>{`Answer`}</p>}
                        {<div className={`mt-3`}>{a === `arabic` ? <p className={`text-lg text-stone-300`}>{i.english}</p> : <ArabicCardFace card={i} />}</div>}
                      </div>
                    ) : (
                      <div className={`writing-flashcard-reveal-zone`}>
                        {<button type={`button`} disabled={!s} onClick={n} className={`nav-text-action py-2 text-[#e8d7a1] disabled:text-stone-700 disabled:opacity-40`}>{`Reveal answer`}</button>}
                        {<button type={`button`} onClick={m} className={`nav-text-action mt-3 py-2 text-stone-500`}>{`I don't know`}</button>}
                      </div>
                    )}
                  </div>
                }
              </div>
            }
          </section>
        }
        {t &&
          (f ? (
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
type MatchTile = {
  id: string;
  pairId: string;
  text: string;
  side: "arabic" | "english";
  imageUrl?: string;
};
const buildMatchTiles = (cards: ExposureCard[]) =>
  shuffle(
    cards.flatMap((card) => [
      {
        id: `${card.id}-arabic`,
        pairId: card.id,
        text: card.arabic,
        side: "arabic" as const,
        imageUrl: card.imageUrl,
      },
      {
        id: `${card.id}-english`,
        pairId: card.id,
        text: getEnglishAnswer(card),
        side: "english" as const,
      },
    ]),
  );
const MATCH_RESHUFFLE_MS = 650;
const MATCH_CLEAR_PAUSE_MS = 700;
function MemoryMatchPhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, onPhaseComplete: i, onNavigate: a }) {
  let o = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    s = o.length,
    c = Math.max(1, s) * MATCH_SECONDS_PER_PAIR,
    u = s >= 5,
    L = getMemoryMatchCleanRunsRequired(s),
    [d, f] = useState(() => buildMatchTiles(o)),
    [p, m] = useState(null),
    [h, g] = useState(null),
    [_, v] = useState([]),
    [y, b] = useState([]),
    [x, S] = useState(!1),
    [C, w] = useState(null),
    [T, E] = useState(!1),
    [D, O] = useState(c),
    [k, ee] = useState(L),
    [te, ne] = useState(0),
    [re, ie] = useState(!1),
    ae = useRef(!1),
    A = useRef(!1),
    j = useCallback(() => {
      (f(buildMatchTiles(o)), m(null), g(null), v([]), b([]), S(!1), w(null), E(!1), O(c), (ae.current = !1), (A.current = !1));
    }, [o, c]);
  useEffect(() => {
    let e = getMemoryMatchCleanRunsRequired(o.length);
    (j(), ee(e), ne(0), ie(!1), (ae.current = !1), (A.current = !1));
  }, [j, o.length]);
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
      if (x || re || se || _.includes(e.pairId)) return;
      if ((T || E(!0), e.side === `arabic`)) {
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
        : k > 1
          ? `Clean run ${te}/${k} — match twice in a row`
          : `Tap Arabic + English. Timer starts on your first tap.`;
  return (
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
      {<BatchStepMeta stepTitle={n} progress={`${oe}/${s}`} />}
      {<PhaseRail active={`memory-match`} completedPhases={r} lessonId={e.id} stepId={t} disabled={x} onNavigate={a} />}
      {
        <div className={`shrink-0 border-b border-[#d6b56d]/10 py-3`}>
          {
            <div className={`flex items-center justify-between gap-3 text-sm`}>
              {<p className={`min-w-0 text-stone-500`}>{pe}</p>}
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
                disabled={x || n}
                onClick={() => N(e)}
                className={`match-card match-card-visible ${u ? `match-card-compact` : ``} ${t ? `match-card-selected` : ``} ${n ? `match-card-matched` : ``} ${r ? `match-card-wrong` : ``}`}
              >
                {e.side === `arabic` && e.imageUrl ? (
                  <VocabularyImage src={e.imageUrl} alt={`Arabic`} className={`arabic-match-image${u ? ` arabic-match-image-compact` : ``}`} />
                ) : (
                  <span lang={e.side === `arabic` ? `ar` : `en`} className={e.side === `arabic` ? `arabic match-card-arabic${u ? ` match-card-arabic-compact` : ``}` : `match-card-english${u ? ` match-card-english-compact` : ``}`}>
                    {e.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      }
    </div>
  );
}
function MultipleChoicePhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, onPhaseComplete: i, onNavigate: a }) {
  let o = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    s = useMemo(() => getCachedLessonExposureCards(e), [e]),
    c = multipleChoicePromptTotal(o.length),
    [u, d] = useState(() => buildMultipleChoiceStudyQueue(o)),
    [f, p] = useState(0),
    [m, h] = useState(MC_SECONDS),
    [g, _] = useState(null),
    [v, y] = useState(null),
    [b, x] = useState(0),
    [S, C] = useState(0),
    [isLocked, setIsLocked] = useState(!1),
    w = u[0],
    T = v !== null,
    E = o.length > 0 && u.length === 0,
    D = w ? `q${f}` : `done`,
    O = useMemo(() => (w ? (w.cueSide === `arabic` ? { kind: `english`, options: getEnglishMultipleChoiceOptions(w.card, s) } : { kind: `arabic`, options: getArabicMultipleChoiceOptions(w.card, s) }) : null), [w, s]),
    k = useCallback((e) => (e.cueSide === `arabic` ? getEnglishAnswer(e.card) : getArabicAnswer(e.card)), []),
    A = useRef(!1),
    j = useRef(null);
  (useEffect(() => {
    (d(buildMultipleChoiceStudyQueue(o)), p(0), h(MC_SECONDS), _(null), y(null), x(0), C(0), setIsLocked(!1), (A.current = !1));
  }, [o]),
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
      <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
        {<p className={`section-label`}>{n}</p>}
        {<p className={`mt-4 text-stone-400`}>{`No multiple choice cards found for this ${getLearnUnitLabel(e, t).toLowerCase()}.`}</p>}
      </div>
    ) : (
      <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
        {<BatchStepMeta stepTitle={n} progress={`${S}/${c}`} />}
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
                      {w.cueSide === `arabic` ? <ArabicCardFace card={w.card} /> : <p className={`text-2xl font-semibold text-stone-100`}>{w.card.english}</p>}
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
                        let n = getArabicAnswer(e) === k(w),
                          r = T && g === getArabicAnswer(e),
                          i = getArabicAnswer(e);
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
                            {e.imageUrl ? (
                              <VocabularyImage src={e.imageUrl} alt={e.english} className={`arabic-choice-image`} draggable={false} />
                            ) : (
                              <p lang={`ar`} className={`arabic text-xl font-medium text-[#e8d7a1]`}>
                                {e.arabic}
                              </p>
                            )}
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
function WritingTestPhase({ lesson: e, stepId: t, stepTitle: n, completedPhases: r, completedStepIds: i, onPhaseComplete: a, onStepComplete: o, onNavigate: s }) {
  let c = useMemo(() => getBatchExposureCards(e, t), [e, t]),
    l = BATCH_TEST_WRITING_CONFIG,
    u = useMemo(() => writingTestPromptTotal(c, l), [c]),
    [d, f] = useState(() => buildWritingStudyQueue(c, l)),
    [p, m] = useState(!1),
    [h, g] = useState(0),
    [R, I] = useState(0),
    _ = d[0],
    v = c.length > 0 && d.length === 0,
    y = useMemo(() => getNextLessonStep(e, t), [e, t]);
  useEffect(() => {
    (f(buildWritingStudyQueue(c, l)), m(!1), g(0), I(0));
  }, [c]);
  let b = () => {
    (a(t, `writing-test`), o(t));
  };
  return !_ && !v ? (
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
      {<p className={`section-label`}>{n}</p>}
      {<p className={`mt-4 text-stone-400`}>{`No test items found for this ${getLearnUnitLabel(e, t).toLowerCase()}.`}</p>}
    </div>
  ) : (
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
      {<BatchStepMeta stepTitle={n} progress={`${R}/${u}`} />}
      {<PhaseRail active={`writing-test`} completedPhases={r} lessonId={e.id} stepId={t} onNavigate={s} />}
      {v ? (
        <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
          {<p className={`section-label`}>{`Complete`}</p>}
          {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`${getLearnUnitLabel(e, t)} complete`}</p>}
          {
            <p className={`mt-3 text-sm text-stone-500`}>
              {`Missed/repeated: `}
              {h}
            </p>
          }
          {y ? (
            <Fragment>
              {
                <button
                  onClick={() => {
                    (b(), openLessonStep(e.id, y, s));
                  }}
                  className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}
                >
                  {getStepContinueLabel(y)}
                </button>
              }
              {
                <button
                  type={`button`}
                  onClick={() => {
                    (b(),
                      s({
                        name: `lesson`,
                        lessonId: e.id,
                      }));
                  }}
                  className={`mx-auto mt-4 text-sm text-stone-500 underline-offset-4 hover:text-stone-300 hover:underline`}
                >{`Return to lesson`}</button>
              }
            </Fragment>
          ) : (
            <button
              onClick={() => {
                (b(),
                  s({
                    name: `lesson`,
                    lessonId: e.id,
                  }));
              }}
              className={`final-test-link mx-auto mt-8`}
            >{`Return to lesson`}</button>
          )}
        </section>
      ) : (
        _ && (
          <WritingStudyPanel
            prompt={_}
            isRevealed={p}
            onReveal={() => m(!0)}
            onAdvance={(t) => {
              (f((n) => {
                let [r] = n;
                if (r && !t) {
                  recordLessonMiss(e.id, r.card.id, r.cueSide);
                  recordMemorizationMiss(toReviewableCard(e.id)(r.card), e, i);
                }
                return advanceStudyPromptQueue(n, t);
              }),
                m(!1),
                I((e) => e + 1),
                t || g((e) => e + 1));
            }}
          />
        )
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
    o = getVocabularyTestSection(t),
    s = o === `nouns` ? `nouns` : o === `verbs` ? `verbs` : o === `phrases` ? `phrases` : (a?.section ?? null),
    c = useMemo(() => getWritingStudyCardsForStep(e, t), [e, t]),
    N = useMemo(() => getWritingConfigForStep(e, t), [e, t]),
    u = useMemo(() => writingTestPromptTotal(c, N), [c, N]),
    [d, f] = useState(`intro`),
    [p, m] = useState([]),
    [h, g] = useState(!1),
    [_, v] = useState(0),
    [C, w] = useState(0),
    y = p[0],
    b = d === `study` && c.length > 0 && p.length === 0,
    x = a?.title ?? `Test`,
    T = useMemo(() => getNextLessonStep(e, t), [e, t]);
  useEffect(() => {
    (f(`intro`), m([]), g(!1), v(0), w(0));
  }, [c, N]);
  let S = () => {
    (f(`study`), m(buildWritingStudyQueue(c, N)), g(!1), v(0), w(0));
  };
  return (!j && (!o || !s)) || c.length === 0 ? (
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
      {<p className={`section-label`}>{x}</p>}
      {<p className={`mt-4 text-stone-400`}>{`No cards found for this test.`}</p>}
    </div>
  ) : (
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
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
              {<p className={`text-xs text-stone-600`}>{d === `study` ? `${C}/${u}` : d === `review` ? `${c.length} items` : `${u} prompts`}</p>}
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
              {j ? `Write the Arabic for each English cue. Missed items repeat until you know them.` : `Write in both directions once per card. Reveal the answer, then mark correct or incorrect. Missed items repeat until you know them.`}
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
      {d === `study` && !b && y && (
        <WritingStudyPanel
          prompt={y}
          isRevealed={h}
          onReveal={() => g(!0)}
          onAdvance={(i) => {
            (m((a) => {
              let [o] = a;
              if (o && !i) {
                recordLessonMiss(e.id, o.card.id, o.cueSide);
                recordMemorizationMiss(toReviewableCard(e.id)(o.card), e, n);
              }
              let s = advanceStudyPromptQueue(a, i);
              return (s.length === 0 && (r(t), f(`complete`)), s);
            }),
              g(!1),
              w((e) => e + 1),
              i || v((e) => e + 1));
          }}
        />
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
  let [r, i] = useState([]),
    [a, o] = useState(!0),
    [s, c] = useState(`intro`),
    [u, d] = useState([]),
    [f, p] = useState([]),
    [m, h] = useState([]),
    [g, _] = useState(!1),
    [v, y] = useState(0),
    [b, x] = useState(0),
    S = useMemo(() => writingTestPromptTotal(r, DAILY_REVIEW_WRITING_CONFIG), [r]);
  useEffect(() => {
    (o(!0), c(`intro`), d([]), p([]), h([]), _(!1), y(0), x(0));
    let t = window.setTimeout(() => {
      (i(resolveDailyReviewCards(buildDailyReviewQueue(lessons, e, getReviewableCardsForLesson))), o(!1));
    }, 0);
    return () => window.clearTimeout(t);
  }, [e]);
  let C = s === `replay` ? f : u,
    w = C[0],
    T = r.length,
    E = () => {
      T !== 0 && (c(`study`), d(buildWritingStudyQueue(r, DAILY_REVIEW_WRITING_CONFIG)), p([]), h([]), _(!1), y(0), x(0));
    },
    D = () => {
      (v > 0 && t(), c(`complete`));
    },
    O = (e) => {
      let t = e.filter((e, t, n) => n.findIndex((t) => t.id === e.id) === t);
      if (t.length === 0) {
        D();
        return;
      }
      (p(buildWritingStudyQueue(t, DAILY_REVIEW_WRITING_CONFIG)), c(`replay`), _(!1));
    };
  return (
    <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
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
          {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{T === 0 ? `Caught up` : `${T} cards due`}</p>}
          {<p className={`mx-auto mt-4 max-w-xs text-sm leading-6 text-stone-500`}>{T === 0 ? `No reviews are due from completed lessons right now.` : `Write the Arabic for each English cue. Cards you miss today repeat once at the end.`}</p>}
          {T > 0 && <button onClick={E} className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}>{`Start Review`}</button>}
        </section>
      )}
      {!a && (s === `study` || s === `replay`) && w && (
        <Fragment>
          {s === `replay` && <p className={`section-label py-4 text-center`}>{`Extra pass`}</p>}
          {
            <WritingStudyPanel
              prompt={w}
              isRevealed={g}
              onReveal={() => _(!0)}
              onAdvance={(e) => {
                let t = C[0];
                if (t) {
                  if ((s !== `replay` && gradeReviewCard(t.card.id, e), y((e) => e + 1), e || x((e) => e + 1), _(!1), s === `replay`)) {
                    p((t) => {
                      let n = advanceStudyPromptQueue(t, e);
                      return (n.length === 0 && D(), n);
                    });
                    return;
                  }
                  h((n) => {
                    let r = e ? n : [...n, t.card];
                    return (
                      d((t) => {
                        let n = advanceStudyPromptQueue(t, e);
                        return (n.length === 0 && O(r), n);
                      }),
                      r
                    );
                  });
                }
              }}
            />
          }
        </Fragment>
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
    L = useMemo(() => buildLessonTestWritingConfig(e.id, (cardId, cueSide) => getLessonMissedCuePasses(e.id, cardId, cueSide)), [e.id]),
    a = useMemo(() => writingTestPromptTotal(i, L), [i, L]),
    [o, s] = useState(`intro`),
    [c, u] = useState([]),
    [d, f] = useState(!1),
    [p, m] = useState(0),
    [h, g] = useState(0),
    _ = c[0],
    v = o === `recall` && i.length > 0 && c.length === 0,
    y = `${e.id}-final`;
  return (
    useEffect(() => {
      (s(`intro`), u([]), f(!1), m(0), g(0));
    }, [i]),
    useEffect(() => {
      t.includes(y) && syncReviewPool(lessons, t, getReviewableCardsForLesson);
    }, [t, y]),
    i.length === 0 ? (
      <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
        {<p className={`section-label`}>{`Lesson Test`}</p>}
        {<p className={`mt-4 text-stone-400`}>{`No lesson items found for this test.`}</p>}
      </div>
    ) : (
      <div className={`flex h-full min-h-0 flex-col px-5 py-6`}>
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
                {<p className={`text-xs text-stone-600`}>{o === `recall` ? `${g}/${a}` : `${a} prompts`}</p>}
              </div>
            }
          </div>
        }
        {o === `intro` && (
          <section className={`flex min-h-0 flex-1 flex-col justify-center py-8 text-center`}>
            {<p className={`section-label`}>{`All Sections`}</p>}
            {<p className={`mt-3 text-3xl font-semibold text-[#e8d7a1]`}>{`Lesson test`}</p>}
            {<p className={`mx-auto mt-4 max-w-xs text-sm leading-6 text-stone-500`}>{`Write in both directions across the whole lesson. Directions you missed earlier in this lesson get an extra pass.`}</p>}
            {
              <div className={`mt-8 grid grid-cols-3 gap-3 border-y border-[#d6b56d]/10 py-4 text-center`}>
                {
                  <div>
                    {<p className={`text-xl font-semibold text-stone-100`}>{e.nouns.length}</p>}
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
                  (s(`recall`), u(buildWritingStudyQueue(i, L)), f(!1), m(0), g(0));
                }}
                className={`final-test-link mx-auto mt-8 text-[#e8d7a1]`}
              >{`Start test`}</button>
            }
          </section>
        )}
        {o === `recall` && !v && _ && (
          <WritingStudyPanel
            prompt={_}
            isRevealed={d}
            onReveal={() => f(!0)}
            onAdvance={(r) => {
              (u((i) => {
                let [a] = i;
                a && !r && recordMemorizationMiss(toReviewableCard(e.id)(a.card), e, t);
                let o = advanceStudyPromptQueue(i, r);
                if (o.length === 0) {
                  clearLessonMisses(e.id);
                  n(y);
                  s(`complete`);
                }
                return o;
              }),
                f(!1),
                g((e) => e + 1),
                r || m((e) => e + 1));
            }}
          />
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
          {t === `nouns` && <VocabularyBrowseRows rows={buildNounBrowseRows(e)} showArabic={r} showEnglish={a} />}
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
              {i === `nouns` && <VocabularyBrowseRows rows={buildNounBrowseRows(e)} showArabic={o} showEnglish={c} />}
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
                  {t ? (
                    r.imageUrl ? (
                      <VocabularyImage src={r.imageUrl} alt={r.english} className={`arabic-review-image`} />
                    ) : (
                      <p className={`arabic text-xl font-medium text-[#e8d7a1]`}>{r.arabic}</p>
                    )
                  ) : (
                    <p className={`font-medium text-stone-600`}>{`••••`}</p>
                  )}
                  {<p className={`font-medium text-stone-300`}>{n ? r.english : `••••`}</p>}
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
  let i = [`past`, `present`, `command`, `masdar`, `passive`, `activeParticiple`],
    a = buildVerbBrowseBatches(t);
  return (
    <section>
      {a.length === 0 ? (
        <p className={`py-5 text-sm text-stone-500`}>{`No items to show.`}</p>
      ) : (
        a.map((o, s) => (
          <Fragment key={o.verb.id}>
            {(s === 0 || o.batchIndex !== a[s - 1].batchIndex) && <VocabularyBrowseBatchDivider batchIndex={o.batchIndex} unitLabel={`Family`} />}
            <div className={`border-b border-[#d6b56d]/10 py-4`}>
              {
                <div className={`grid grid-cols-2 gap-3 text-sm`}>
                  {i.map((i) => {
                    let c = o.verb[i];
                    if (!c) return null;
                    let l = getVerbFormEnglish(o.verb, i);
                    return (
                      <div className={`relative border-l border-[#d6b56d]/10 pl-3 pr-10`}>
                        {o.verb.hardForms?.[i] && <p className={`absolute right-0 top-0 text-[0.55rem] font-medium uppercase tracking-widest text-[#d6b56d]/55`}>{`weak`}</p>}
                        {<p className={`text-xs font-semibold uppercase text-[#d6b56d]/60`}>{getVerbFormLabel(i)}</p>}
                        {n ? (
                          o.verb.images?.[i] ? (
                            <VocabularyImage src={vocabularyImageUrl(e, o.verb.images[i])} alt={`${i} ${l}`} className={`arabic-review-image`} />
                          ) : (
                            <p className={`arabic text-xl font-medium text-[#e8d7a1]`}>{c}</p>
                          )
                        ) : (
                          <p className={`arabic text-xl font-medium text-[#e8d7a1]`}>{`••••`}</p>
                        )}
                        {<p className={`mt-1 font-medium text-stone-300`}>{r ? l : `••••`}</p>}
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
const startOfflineWarm = () => {
  void warmVocabularyCache();
};
registerSW({
  immediate: true,
  onRegisteredSW() {
    startOfflineWarm();
  },
  onOfflineReady() {
    startOfflineWarm();
  },
});
createRoot(document.getElementById("root")!).render(<App />);
