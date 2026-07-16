import { parseEnglishStemAndTags } from "./batching";
import type { ExposureCard } from "./types";

const ENGLISH_TAG_LABELS: Record<string, string> = {
  p: "Plural",
  m: "Masculine",
  f: "Feminine",
  dual: "Dual",
  general: "General",
  "with each other": "With each other",
};

export const formatEnglishTagLabel = (tag: string) => {
  const normalized = tag.trim().toLowerCase();
  if (ENGLISH_TAG_LABELS[normalized]) return ENGLISH_TAG_LABELS[normalized];
  if (!normalized) return tag;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const getEnglishCueParts = (card: Pick<ExposureCard, "english" | "englishStem" | "englishTags">) => {
  if (card.englishStem !== undefined && card.englishTags !== undefined) {
    return { stem: card.englishStem, tags: card.englishTags };
  }
  return parseEnglishStemAndTags(card.english);
};

export const formatEnglishVariantLabel = (
  card: Pick<ExposureCard, "englishVariant" | "englishVariantTotal">,
) => {
  if ((card.englishVariantTotal ?? 0) <= 1 || !card.englishVariant) return undefined;
  return String(card.englishVariant);
};

export const formatEnglishCueText = (card: ExposureCard) => {
  const { stem, tags } = getEnglishCueParts(card);
  const parts = [stem];
  if (tags.length > 0) parts.push(...tags.map(formatEnglishTagLabel));
  const variantLabel = formatEnglishVariantLabel(card);
  if (variantLabel) parts.push(variantLabel);
  return parts.join(" · ");
};

export const getEnglishCollisionKey = (
  card: Pick<ExposureCard, "section" | "english" | "englishStem" | "englishTags">,
) => {
  const { stem, tags } = getEnglishCueParts(card);
  const tagKey = [...tags].map((tag) => tag.toLowerCase()).sort().join("|");
  return `${card.section}:${stem.trim().toLowerCase()}:${tagKey}`;
};

const cardsInCollisionGroup = (card: ExposureCard, pool: ExposureCard[]) => {
  const key = getEnglishCollisionKey(card);
  return pool.filter((item) => item.section === card.section && getEnglishCollisionKey(item) === key);
};

export const resolveEnglishCueContext = (
  card: ExposureCard,
  contextCards?: ExposureCard[],
): Pick<ExposureCard, "englishVariant" | "englishVariantTotal"> => {
  const pool = contextCards?.length ? contextCards : [card];
  const group = cardsInCollisionGroup(card, pool);
  if (group.length <= 1) return {};
  const sorted = [...group].sort((left, right) => left.id.localeCompare(right.id));
  const englishVariant = sorted.findIndex((item) => item.id === card.id) + 1;
  return {
    englishVariant,
    englishVariantTotal: sorted.length,
  };
};

export const getEnglishCueDisplayCard = (card: ExposureCard, contextCards?: ExposureCard[]): ExposureCard => ({
  ...card,
  ...resolveEnglishCueContext(card, contextCards),
});

export const getEnglishAnswerInContext = (card: ExposureCard, contextCards?: ExposureCard[]) =>
  formatEnglishCueText(getEnglishCueDisplayCard(card, contextCards));

export const annotateEnglishCollisions = (cards: ExposureCard[]): ExposureCard[] => {
  const collisionSources = cards.filter((card) => card.section !== "verbs");
  const groups = new Map<string, ExposureCard[]>();

  for (const card of collisionSources) {
    const key = getEnglishCollisionKey(card);
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }

  const orderedGroups = new Map<string, ExposureCard[]>();
  for (const [key, group] of groups) {
    orderedGroups.set(
      key,
      [...group].sort((left, right) => left.id.localeCompare(right.id)),
    );
  }

  return cards.map((card) => {
    if (card.section === "verbs") return card;

    const { stem, tags } = parseEnglishStemAndTags(card.english);
    const group = orderedGroups.get(getEnglishCollisionKey(card)) ?? [card];
    const englishVariant = group.findIndex((item) => item.id === card.id) + 1;
    return {
      ...card,
      englishStem: stem,
      englishTags: tags,
      englishVariant: group.length > 1 ? englishVariant : undefined,
      englishVariantTotal: group.length > 1 ? group.length : undefined,
    };
  });
};
