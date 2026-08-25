export interface ThreadSelectionState { selectedIds: ReadonlySet<string>; anchorId: string | null; }
export const EMPTY_THREAD_SELECTION: ThreadSelectionState = { selectedIds: new Set(), anchorId: null };
export function updateThreadSelection(current: ThreadSelectionState, visibleIds: readonly string[], targetId: string, modifiers: { shiftKey: boolean; toggleKey: boolean }): ThreadSelectionState {
  const target = visibleIds.indexOf(targetId);
  if (target < 0) return current;
  if (modifiers.shiftKey) {
    const anchor = current.anchorId === null ? target : visibleIds.indexOf(current.anchorId);
    const selectedIds = modifiers.toggleKey ? new Set(current.selectedIds) : new Set<string>();
    for (const id of visibleIds.slice(Math.min(anchor < 0 ? target : anchor, target), Math.max(anchor < 0 ? target : anchor, target) + 1)) selectedIds.add(id);
    return { selectedIds, anchorId: current.anchorId ?? targetId };
  }
  const selectedIds = new Set(current.selectedIds);
  if (modifiers.toggleKey) selectedIds.has(targetId) ? selectedIds.delete(targetId) : selectedIds.add(targetId);
  else { selectedIds.clear(); selectedIds.add(targetId); }
  return { selectedIds, anchorId: targetId };
}
