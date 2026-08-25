export type ThreadOrderShelf = "pinned" | "inbox";

export type DropPlacement = "before" | "after";

export function moveThreadId(
  ids: readonly string[],
  movingId: string,
  targetId: string,
  placement: DropPlacement,
): string[] {
  if (movingId === targetId || !ids.includes(movingId) || !ids.includes(targetId)) {
    return [...ids];
  }
  const remaining = ids.filter((id) => id !== movingId);
  const targetIndex = remaining.indexOf(targetId);
  const insertionIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...remaining.slice(0, insertionIndex),
    movingId,
    ...remaining.slice(insertionIndex),
  ];
}

export function moveThreadIdByOffset(
  ids: readonly string[],
  movingId: string,
  offset: -1 | 1,
): string[] {
  const currentIndex = ids.indexOf(movingId);
  const targetIndex = currentIndex + offset;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ids.length) return [...ids];
  return moveThreadId(
    ids,
    movingId,
    ids[targetIndex]!,
    offset < 0 ? "before" : "after",
  );
}

export function orderThreads<T extends { readonly id: string }>(
  threads: readonly T[],
  orderedIds: readonly string[] | null,
): T[] {
  if (orderedIds === null) return [...threads];
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...threads].sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return -1;
    if (rightRank === undefined) return 1;
    return leftRank - rightRank;
  });
}

export function mergeVisibleOrder(
  globalIds: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const visibleSet = new Set(visibleIds);
  let visibleIndex = 0;
  return globalIds.map((id) =>
    visibleSet.has(id) ? (visibleIds[visibleIndex++] ?? id) : id,
  );
}
