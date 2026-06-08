import { useEffect, useState } from "react";
import { resolveVocabularyImageSrc } from "./offline-storage";

type VocabularyImageProps = {
  src: string;
  alt: string;
  className?: string;
  draggable?: boolean;
};

export function VocabularyImage({ src, alt, className, draggable }: VocabularyImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    setResolvedSrc(src);

    void resolveVocabularyImageSrc(src).then((nextSrc) => {
      if (!cancelled) setResolvedSrc(nextSrc);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={resolvedSrc} alt={alt} className={className} draggable={draggable} />;
}
