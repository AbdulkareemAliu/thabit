export type LessonStatus = "complete" | "current" | "locked";
export type SectionKind = "nouns" | "verbs" | "phrases";
export type StepStatus = "complete" | "current" | "available" | "locked";
export type BatchPhase = "exposure" | "memory-match" | "multiple-choice" | "writing-test";
export type LessonStepKind = "batch" | "batch-review" | "vocabulary-test" | "final-test";

export type NounItem = {
  id: string;
  arabic: string;
  arabicImage?: string;
  english: string;
  stem: string;
  tags: string[];
  plural?: string;
  hard?: boolean;
};

export type PhraseItem = {
  id: string;
  arabic: string;
  arabicImage?: string;
  english: string;
  hard?: boolean;
};

export type VerbFormKey = "past" | "present" | "command" | "masdar" | "passive" | "activeParticiple";

export type VerbFamily = {
  id: string;
  /** Fallback label when a form has no english in the CSV. */
  meaning: string;
  past: string;
  present: string;
  command: string;
  masdar: string;
  passive?: string;
  activeParticiple?: string;
  englishByForm?: Partial<Record<VerbFormKey, string>>;
  images?: Partial<Record<VerbFormKey, string>>;
  hardForms?: Partial<Record<VerbFormKey, boolean>>;
};

export type LessonStep = {
  id: string;
  title: string;
  kind: LessonStepKind;
  section?: SectionKind;
  status: StepStatus;
  itemCount?: number;
  /** Inclusive 0-based batch indices covered by a batch-review step. */
  batchReviewStart?: number;
  batchReviewEnd?: number;
};

export type ExposureCard = {
  id: string;
  arabic: string;
  english: string;
  section: SectionKind;
  batchIndex?: number;
  imageUrl?: string;
  label?: string;
};

export type Lesson = {
  id: string;
  number: number;
  /** Folder under /vocabulary, e.g. 01_Greetings */
  folder: string;
  title: string;
  steps: LessonStep[];
  nouns: NounItem[];
  verbs: VerbFamily[];
  phrases: PhraseItem[];
};
