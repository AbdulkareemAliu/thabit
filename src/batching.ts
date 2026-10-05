import { MAX_BATCH_SIZE, MIN_BATCH_SIZE, VERB_BATCH_SIZE } from "./config";
import type { NounItem, VerbFamily } from "./types";

export const normalizeEnglishTag = (tag: string): string => {
  const normalized = tag.trim().toLowerCase();
  if (normalized === "female" || normalized === "f") return "f";
  if (normalized === "male" || normalized === "m") return "m";
  return normalized;
};

export const parseEnglishStemAndTags = (english: string): { stem: string; tags: string[] } => {
  const trimmed = english.trim();
  const firstParen = trimmed.indexOf("(");
  const stem = (firstParen === -1 ? trimmed : trimmed.slice(0, firstParen)).trim();
  const tags: string[] = [];

  const tagPattern = /\(([^)]*)\)/g;
  let match: RegExpExecArray | null = tagPattern.exec(trimmed);
  while (match) {
    const normalized = normalizeEnglishTag(match[1]);
    if (normalized) tags.push(normalized);
    match = tagPattern.exec(trimmed);
  }

  return { stem, tags };
};

const chunkLargeStemGroup = <T,>(group: T[]): T[][] => {
  if (group.length < 7) return [group];

  const chunks: T[][] = [];
  let remaining = group;

  while (remaining.length > 6) {
    chunks.push(remaining.slice(0, 4));
    remaining = remaining.slice(4);
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
};

export const sortStemGroupByTags = <T,>(group: T[], getEnglish: (item: T) => string): T[] =>
  [...group].sort((left, right) => {
    const leftTags = parseEnglishStemAndTags(getEnglish(left)).tags.length;
    const rightTags = parseEnglishStemAndTags(getEnglish(right)).tags.length;
    return leftTags - rightTags;
  });

const groupConsecutiveByStem = <T,>(items: T[], getEnglish: (item: T) => string): T[][] => {
  const groups: T[][] = [];

  for (const item of items) {
    const { stem } = parseEnglishStemAndTags(getEnglish(item));
    const previous = groups.at(-1);
    const previousStem = previous ? parseEnglishStemAndTags(getEnglish(previous[0])).stem : null;

    if (previous && previousStem === stem) {
      previous.push(item);
      continue;
    }

    groups.push([item]);
  }

  return groups;
};

/** Split `count` items into batches of MIN_BATCH_SIZE…MAX_BATCH_SIZE without leftover dumps. */
export const evenBatchSizes = (count: number, _minSize = MIN_BATCH_SIZE, maxSize = MAX_BATCH_SIZE): number[] => {
  if (count <= 0) return [];
  if (count <= maxSize) return [count];

  const batchCount = Math.ceil(count / maxSize);
  const base = Math.floor(count / batchCount);
  const extra = count % batchCount;
  return Array.from({ length: batchCount }, (_, index) => base + (index < extra ? 1 : 0));
};

const sliceBySizes = <T,>(items: T[], sizes: number[]): T[][] => {
  const batches: T[][] = [];
  let offset = 0;
  for (const size of sizes) {
    batches.push(items.slice(offset, offset + size));
    offset += size;
  }
  return batches;
};

const packUnitsIntoBatches = <T,>(units: T[][], maxSize: number): T[][] =>
  sliceBySizes(units, evenBatchSizes(units.length, MIN_BATCH_SIZE, maxSize)).map((batch) => batch.flat());

export const isNounPluralItem = (noun: NounItem) => parseEnglishStemAndTags(noun.english).tags.includes("p");

export const isNounStemGroupWithPlural = (group: NounItem[]) =>
  group.some(isNounPluralItem) && group.some((item) => !isNounPluralItem(item));

const expandNounStemGroupToUnits = (group: NounItem[]): NounItem[][] => {
  if (isNounStemGroupWithPlural(group)) return [group];
  return group.map((item) => [item]);
};

const packNounUnitsIntoBatches = (units: NounItem[][]): NounItem[][][] =>
  sliceBySizes(units, evenBatchSizes(units.length));

export const buildNounBatchStructure = (nouns: NounItem[]) => {
  const stemGroups = groupConsecutiveByStem(nouns, (item) => item.english).map((group) =>
    sortStemGroupByTags(group, (item) => item.english),
  );
  const units = stemGroups.flatMap((group) =>
    chunkLargeStemGroup(group).flatMap((chunk) => expandNounStemGroupToUnits(chunk)),
  );
  const unitBatches = packNounUnitsIntoBatches(units);
  return { units, unitBatches };
};

export const getNounBatches = (nouns: NounItem[]): NounItem[][] =>
  buildNounBatchStructure(nouns).unitBatches.map((batch) => batch.flat());

export const countNounFamilyUnits = (nouns: NounItem[]) => buildNounBatchStructure(nouns).units.length;

export const getNounBatchUnitCounts = (nouns: NounItem[]): number[] =>
  buildNounBatchStructure(nouns).unitBatches.map((batch) => batch.length);

export const getVerbBatches = (verbs: VerbFamily[]): VerbFamily[][] =>
  packUnitsIntoBatches(
    verbs.map((verb) => [verb]),
    VERB_BATCH_SIZE,
  );
