import { getBatchReviewGroupSizes, MAX_BATCHES_WITHOUT_REVIEW } from "./batch-groups";
import { getNounBatches, getVerbBatches, parseEnglishStemAndTags } from "./batching";
import { countVerbFamilyForms, normalizeVerbFormEnglish } from "./exposure-cards";
import { MIN_NON_VERB_BATCH_SIZE, NOUN_BATCH_SIZE, PHRASE_BATCH_SIZE, VERB_BATCH_SIZE } from "./config";
import type { Lesson, LessonStep, NounItem, SectionKind, VerbFamily, VerbFormKey } from "./types";

type CsvRow = Record<string, string>;
type LessonCsvKind = "nouns" | "verbs" | "phrases";

const csvFiles = import.meta.glob<string>("/vocabulary/*/{nouns,verbs,phrases}.csv", {
  eager: true,
  query: "?raw",
  import: "default",
});

export { NOUN_BATCH_SIZE, PHRASE_BATCH_SIZE, VERB_BATCH_SIZE, MIN_NON_VERB_BATCH_SIZE } from "./config";

const parseCsv = (csv: string): CsvRow[] => {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && next === '"' && inQuotes) {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);

  const [headers = [], ...dataRows] = rows;
  return dataRows.map((dataRow) =>
    headers.reduce<CsvRow>((record, header, index) => {
      record[header] = dataRow[index] ?? "";
      return record;
    }, {}),
  );
};

const parseBool = (value?: string) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "hard";
};

/** Remove corrupted English glosses accidentally embedded in Arabic phrase text. */
const sanitizePhraseArabic = (text: string) => {
  const cleaned = text
    .replace(/\([^)]*[A-Za-z][^)]*\)/g, "")
    .replace(/\)[^(]*[A-Za-z][^(]*\(/g, "")
    .replace(/[A-Za-z+#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || text;
};

/** Strip harakat and spacing so phrase rows can be compared reliably. */
const normalizePhraseArabicKey = (text: string) =>
  text.replace(/[\s\u0640\u200c\u200d\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");

/** PDF phrase tables often export the expression and example sentence as separate rows with the same English gloss. */
const isPhraseExampleRow = (expressionArabic: string, rowArabic: string) => {
  const expression = normalizePhraseArabicKey(expressionArabic);
  const current = normalizePhraseArabicKey(rowArabic);
  if (!expression || !current) return false;

  const containsExpression = expression.length >= 2 && current.includes(expression) && current.length > expression.length;
  const muchLonger = current.length >= Math.max(expression.length + 6, expression.length * 2);
  return containsExpression || muchLonger;
};

const parsePhraseRows = (rows: CsvRow[], lessonId: string) => {
  const phrases: Lesson["phrases"] = [];

  for (const row of rows) {
    if (!row.arabic && !row.english) continue;

    const previous = phrases.at(-1);
    if (previous && row.english === previous.english && isPhraseExampleRow(previous.arabic, row.arabic)) {
      continue;
    }

    phrases.push({
      id: `${lessonId}-phrase-${phrases.length + 1}`,
      arabic: sanitizePhraseArabic(row.arabic),
      arabicImage: row.arabic_image || undefined,
      english: row.english,
      hard: parseBool(row.hard),
    });
  }

  return phrases;
};

const verbHardColumns: Array<{ key: VerbFormKey; hard: string }> = [
  { key: "past", hard: "past_hard" },
  { key: "present", hard: "present_hard" },
  { key: "command", hard: "command_hard" },
  { key: "masdar", hard: "masdar_hard" },
  { key: "passive", hard: "passive_hard" },
  { key: "activeParticiple", hard: "active_participle_hard" },
];

export const getBatchSizes = (count: number, batchSize: number, shouldMergeSmallFinalBatch: boolean) => {
  if (count <= 0) return [];

  const sizes: number[] = [];
  let remaining = count;

  while (remaining > 0) {
    const nextSize = Math.min(batchSize, remaining);
    sizes.push(nextSize);
    remaining -= nextSize;
  }

  const finalSize = sizes.at(-1) ?? 0;
  if (shouldMergeSmallFinalBatch && sizes.length > 1 && finalSize < MIN_NON_VERB_BATCH_SIZE) {
    sizes[sizes.length - 2] += finalSize;
    sizes.pop();
  }

  return sizes;
};

const makeBatchSteps = ({
  lessonId,
  title,
  section,
  count,
  batchSize,
}: {
  lessonId: string;
  title: string;
  section: SectionKind;
  count: number;
  batchSize: number;
}) => makeSectionBatchSteps({ lessonId, title, section, batchSizes: getBatchSizes(count, batchSize, section !== "verbs") });

const getSectionUnitLabel = (_section: SectionKind) => "Batch";

const makeSectionBatchSteps = ({
  lessonId,
  title,
  section,
  batchSizes,
  batchItemCounts,
}: {
  lessonId: string;
  title: string;
  section: SectionKind;
  batchSizes: number[];
  batchItemCounts?: number[];
}) => {
  if (batchSizes.length === 0) return [];

  const unitLabel = getSectionUnitLabel(section);
  const getItemCount = (index: number) => batchItemCounts?.[index] ?? batchSizes[index];

  if (batchSizes.length <= MAX_BATCHES_WITHOUT_REVIEW) {
    return batchSizes.map((size, index) => ({
      id: `${lessonId}-${section}-batch-${index + 1}`,
      title: `${title} ${unitLabel} ${index + 1}`,
      kind: "batch" as const,
      section,
      status: "locked" as const,
      itemCount: getItemCount(index),
    }));
  }

  const groupSizes = getBatchReviewGroupSizes(batchSizes.length);
  const steps: LessonStep[] = [];
  let batchIndex = 0;
  let reviewIndex = 1;

  for (const groupSize of groupSizes) {
    for (let offset = 0; offset < groupSize; offset += 1) {
      const index = batchIndex + offset;
      steps.push({
        id: `${lessonId}-${section}-batch-${index + 1}`,
        title: `${title} ${unitLabel} ${index + 1}`,
        kind: "batch",
        section,
        status: "locked",
        itemCount: getItemCount(index),
      });
    }

    const reviewStart = batchIndex;
    const reviewEnd = batchIndex + groupSize - 1;
    const reviewItemCount = Array.from({ length: reviewEnd - reviewStart + 1 }, (_, offset) =>
      getItemCount(reviewStart + offset),
    ).reduce((sum, size) => sum + size, 0);
    const reviewBatchLabel =
      reviewStart === reviewEnd ? `${reviewStart + 1}` : `${reviewStart + 1}–${reviewEnd + 1}`;

    steps.push({
      id: `${lessonId}-${section}-batch-review-${reviewIndex}`,
      title: `${title} Review (${reviewBatchLabel})`,
      kind: "batch-review",
      section,
      status: "locked",
      itemCount: reviewItemCount,
      batchReviewStart: reviewStart,
      batchReviewEnd: reviewEnd,
    });

    batchIndex += groupSize;
    reviewIndex += 1;
  }

  return steps;
};

const makeSteps = ({ lessonId, nouns, verbs, phraseCount }: { lessonId: string; nouns: NounItem[]; verbs: VerbFamily[]; phraseCount: number }): Lesson["steps"] => {
  const steps: LessonStep[] = [];
  const nounCount = nouns.length;
  const verbCount = verbs.length;
  const verbFormCount = verbs.reduce((sum, verb) => sum + countVerbFamilyForms(verb), 0);
  const verbBatches = getVerbBatches(verbs);

  steps.push(
    ...makeSectionBatchSteps({
      lessonId,
      title: "Noun",
      section: "nouns",
      batchSizes: getNounBatches(nouns).map((batch) => batch.length),
    }),
  );
  if (nounCount > 0) {
    steps.push({ id: `${lessonId}-noun-test`, title: "Noun Test", kind: "vocabulary-test", section: "nouns", status: "locked", itemCount: nounCount });
  }

  steps.push(
    ...makeBatchSteps({
      lessonId,
      title: "Phrase",
      section: "phrases",
      count: phraseCount,
      batchSize: PHRASE_BATCH_SIZE,
    }),
  );
  if (phraseCount > 0) {
    steps.push({ id: `${lessonId}-phrase-test`, title: "Phrase Test", kind: "vocabulary-test", section: "phrases", status: "locked", itemCount: phraseCount });
  }

  steps.push(
    ...makeSectionBatchSteps({
      lessonId,
      title: "Verb",
      section: "verbs",
      batchSizes: verbBatches.map((batch) => batch.length),
    }),
  );
  if (verbCount > 0) {
    steps.push({ id: `${lessonId}-verb-test`, title: "Verb Test", kind: "vocabulary-test", section: "verbs", status: "locked", itemCount: verbFormCount });
  }

  const totalCount = nounCount + verbCount + phraseCount;
  steps.push({ id: `${lessonId}-final`, title: "Lesson Test", kind: "final-test", status: "locked", itemCount: totalCount });

  return steps;
};

const getLessonFolderFromPath = (path: string) => path.match(/\/vocabulary\/([^/]+)\//)?.[1] ?? "00_Unknown";
const getLessonNumberFromFolder = (folder: string) => Number(folder.match(/^(\d+)/)?.[1] ?? 0);
const getLessonTitleFromFolder = (folder: string) => {
  const title = folder
    .replace(/^\d+_?/, "")
    .replaceAll("_", " ")
    .trim();
  return title || `Lesson ${String(getLessonNumberFromFolder(folder)).padStart(2, "0")}`;
};
const getCsvKindFromPath = (path: string): LessonCsvKind => {
  if (path.endsWith("nouns.csv")) return "nouns";
  if (path.endsWith("verbs.csv")) return "verbs";
  return "phrases";
};

type LessonCsvBundle = {
  folder: string;
  rows: Partial<Record<LessonCsvKind, CsvRow[]>>;
};

const byLesson = Object.entries(csvFiles).reduce<Record<string, LessonCsvBundle>>((record, [path, csv]) => {
  const folder = getLessonFolderFromPath(path);
  const kind = getCsvKindFromPath(path);
  record[folder] ??= { folder, rows: {} };
  record[folder].rows[kind] = parseCsv(csv);
  return record;
}, {});

export const lessons: Lesson[] = Object.values(byLesson)
  .map(({ folder, rows: lessonCsv }) => {
    const lessonNumber = getLessonNumberFromFolder(folder);
    const lessonId = `lesson-${lessonNumber}`;

    const nouns = (lessonCsv.nouns ?? [])
      .filter((row) => row.arabic || row.english)
      .map((row, index) => {
        const { stem, tags } = parseEnglishStemAndTags(row.english);
        return {
          id: `${lessonId}-noun-${index + 1}`,
          arabic: row.arabic,
          arabicImage: row.arabic_image || undefined,
          english: row.english,
          stem,
          tags,
          plural: row.plural || undefined,
          hard: parseBool(row.hard),
        };
      });

    const phrases = parsePhraseRows(lessonCsv.phrases ?? [], lessonId);

    const verbs = (lessonCsv.verbs ?? [])
      .filter((row) => row.past_arabic || row.present_arabic || row.command_arabic || row.masdar_arabic)
      .map((row, index): VerbFamily => {
        const hardForms = verbHardColumns.reduce<NonNullable<VerbFamily["hardForms"]>>((forms, column) => {
          if (parseBool(row[column.hard])) forms[column.key] = true;
          return forms;
        }, {});

        const englishByForm: Partial<Record<VerbFormKey, string>> = {};
        if (row.past_english) englishByForm.past = normalizeVerbFormEnglish(row.past_english);
        if (row.present_english) englishByForm.present = normalizeVerbFormEnglish(row.present_english);
        if (row.command_english) englishByForm.command = normalizeVerbFormEnglish(row.command_english);
        if (row.masdar_english) englishByForm.masdar = normalizeVerbFormEnglish(row.masdar_english);
        if (row.passive_english) englishByForm.passive = normalizeVerbFormEnglish(row.passive_english);
        if (row.active_participle_english) englishByForm.activeParticiple = normalizeVerbFormEnglish(row.active_participle_english);

        return {
          id: `${lessonId}-verb-${index + 1}`,
          meaning: normalizeVerbFormEnglish(
            row.past_english || row.present_english || row.command_english || row.masdar_english || "Verb",
          ),
          past: row.past_arabic,
          present: row.present_arabic,
          passive: row.passive_arabic || undefined,
          command: row.command_arabic,
          masdar: row.masdar_arabic,
          activeParticiple: row.active_participle_arabic || undefined,
          englishByForm: Object.keys(englishByForm).length > 0 ? englishByForm : undefined,
          images: {
            past: row.past_arabic_image || undefined,
            present: row.present_arabic_image || undefined,
            command: row.command_arabic_image || undefined,
            masdar: row.masdar_arabic_image || undefined,
            passive: row.passive_arabic_image || undefined,
            activeParticiple: row.active_participle_arabic_image || undefined,
          },
          hardForms: Object.keys(hardForms).length > 0 ? hardForms : undefined,
        };
      });

    return {
      id: lessonId,
      number: lessonNumber,
      folder,
      title: getLessonTitleFromFolder(folder),
      steps: makeSteps({ lessonId, nouns, verbs, phraseCount: phrases.length }),
      nouns,
      verbs,
      phrases,
    };
  })
  .sort((a, b) => a.number - b.number);
