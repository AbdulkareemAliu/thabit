/** Sections with this many batches or fewer skip batch-review steps entirely. */
export const MAX_BATCHES_WITHOUT_REVIEW = 4;

/** Group sizes for batch-review steps (sum equals batch count when count > MAX_BATCHES_WITHOUT_REVIEW). */
export const getBatchReviewGroupSizes = (batchCount: number): number[] => {
  if (batchCount <= MAX_BATCHES_WITHOUT_REVIEW) return [];

  const groups: number[] = [];
  let remaining = batchCount;

  while (remaining > 0) {
    if (remaining === 4) {
      groups.push(4);
      break;
    }
    if (remaining % 3 === 1) {
      groups.push(3);
      remaining -= 3;
    } else if (remaining >= 3) {
      groups.push(3);
      remaining -= 3;
    } else {
      groups.push(remaining);
      remaining = 0;
    }
  }

  return groups;
};
