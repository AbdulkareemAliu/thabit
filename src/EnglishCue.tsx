import {
  formatEnglishTagLabel,
  formatEnglishVariantLabel,
  getEnglishCueDisplayCard,
  getEnglishCueParts,
} from "./english-cue";
import type { ExposureCard } from "./types";
import { VocabularyImage } from "./VocabularyImage";

type EnglishCueProps = {
  card: ExposureCard;
  contextCards?: ExposureCard[];
  className?: string;
  size?: "lg" | "sm";
  showImageHint?: boolean;
  lessonLabel?: string;
};

export function EnglishCue({ card, contextCards, className = ``, size = `lg`, showImageHint = false, lessonLabel }: EnglishCueProps) {
  const displayCard = getEnglishCueDisplayCard(card, contextCards);
  const { stem, tags } = getEnglishCueParts(displayCard);
  const hasVariant = (displayCard.englishVariantTotal ?? 0) > 1;
  const variantLabel = formatEnglishVariantLabel(displayCard);

  return (
    <div className={`english-cue english-cue-${size}${className ? ` ${className}` : ``}`}>
      <p className={`english-cue-stem`} lang={`en`} dir={`ltr`}>
        {stem}
        {variantLabel && (
          <span className={`english-cue-variant`} aria-label={`English variant ${variantLabel}`}>
            {variantLabel}
          </span>
        )}
        {lessonLabel && (
          <span className={`english-cue-lesson`} aria-label={lessonLabel}>
            {lessonLabel}
          </span>
        )}
      </p>
      {tags.length > 0 && (
        <div className={`english-cue-tags`}>
          {tags.map((tag) => (
            <span key={tag} className={`english-cue-tag`}>
              {formatEnglishTagLabel(tag)}
            </span>
          ))}
        </div>
      )}
      {showImageHint && hasVariant && displayCard.imageUrl && (
        <VocabularyImage src={displayCard.imageUrl} alt={stem} className={`english-cue-image-hint`} draggable={false} />
      )}
    </div>
  );
}
