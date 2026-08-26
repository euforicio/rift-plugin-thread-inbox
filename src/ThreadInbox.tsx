import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoAnimate } from "@formkit/auto-animate";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/Select";
import { ChildThreadRow } from "./ChildThreadRow";
import { ThreadCard, type GitStatusState, type ThreadReorderControls } from "./ThreadCard";
import { SlimRow } from "./SlimRow";
import { useLifecycle } from "./useLifecycle";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import { useThreadOrder } from "./useThreadOrder";
import {
  mergeVisibleOrder,
  moveThreadId,
  moveThreadIdByOffset,
  orderThreads,
  type ThreadOrderShelf,
} from "./thread-order";
import {
  childrenOf,
  descendantsOf,
  filterByProject,
  hideChildrenOfVisibleParents,
  partitionPinned,
  searchThreadGroupsByTitle,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  statusSourceForGroup,
  threadDisplayTitle,
  visibleInboxThreads,
} from "./inbox";
import { isInactiveThread } from "./inactive";
import type { threadInboxRpcContract } from "./server";
import { EMPTY_THREAD_SELECTION, updateThreadSelection } from "./selection";

const ALL_PROJECTS = "__all__";

function useListAutoAnimate<T extends HTMLElement>() {
  const controller = useRef<ReturnType<typeof autoAnimate> | null>(null);
  return useCallback((node: T | null) => {
    controller.current?.destroy?.();
    controller.current?.disable();
    controller.current = null;
    if (
      !node ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;
    controller.current = autoAnimate(node, { duration: 150, easing: "ease-out" });
  }, []);
}

/**
 * The sidebar's scrolling list: one flat, statically ordered stack of cards.
 *
 * The host owns the New-thread button and the search field above it, so this
 * ships neither. It filters by the `searchQuery` prop and keeps only the one
 * control the host has no equivalent for: the project scope picker.
 */
export function ThreadInbox({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const actions = useSidebarThreadActions();
  const rpc = useRpc<typeof threadInboxRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [inactiveAfterHours, setInactiveAfterHours] = useState<number | null>(null);
  const settingsRequestSeq = useRef(0);
  const loadSettings = useCallback(async () => {
    const seq = ++settingsRequestSeq.current;
    try {
      const value = await rpc.call("getSidebarSettings", {});
      if (seq !== settingsRequestSeq.current) return;
      setInactiveAfterHours(value.inactiveThreadsEnabled ? value.inactiveAfterHours : null);
    } catch {
      // During backend reloads (and in older harnesses), keep the shelf off.
    }
  }, [rpc]);
  useEffect(() => { void loadSettings(); }, [loadSettings, realtimeState]);
  useRealtime("sidebar-settings", () => { void loadSettings(); });
  const lifecycle = useLifecycle(threads);
  const [scope, setScope] = useState<string>(ALL_PROJECTS);
  // One clock for every card in a render, quantized to the minute so the
  // labels do not disagree and do not churn on unrelated re-renders.
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [selection, setSelection] = useState(EMPTY_THREAD_SELECTION);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [gitStates, setGitStates] = useState<ReadonlyMap<string, GitStatusState | null>>(() => new Map());
  const [expandedParents, setExpandedParents] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const { pinnedBase, inboxBase, inactive, snoozed, settled, scoped } = useMemo(() => {
    const visible = filterByProject(
      visibleInboxThreads(threads),
      scope === ALL_PROJECTS ? null : scope,
    );
    const roots = hideChildrenOfVisibleParents(visible);
    const matched = searchThreadGroupsByTitle(roots, visible, searchQuery);
    const active: typeof matched = [];
    const onSnoozeShelf: typeof matched = [];
    const onSettledShelf: typeof matched = [];
    const onInactiveShelf: typeof matched = [];
    for (const thread of matched) {
      const descendants = descendantsOf(visible, thread.id);
      const shelf = lifecycle.shelfFor(thread, descendants);
      if (shelf === "snoozed") onSnoozeShelf.push(thread);
      else if (shelf === "settled") onSettledShelf.push(thread);
      else if (
        !thread.isPinned &&
        !lifecycle.wokeFor(thread, descendants) &&
        lifecycle.canPark(thread, descendants) &&
        isInactiveThread(
          {
            createdAt: Math.max(thread.createdAt, ...descendants.map((child) => child.createdAt)),
            updatedAt: Math.max(thread.updatedAt, ...descendants.map((child) => child.updatedAt)),
            latestAttentionAt: Math.max(
              thread.latestAttentionAt,
              ...descendants.map((child) => child.latestAttentionAt),
            ),
          },
          now,
          inactiveAfterHours,
        )
      ) onInactiveShelf.push(thread);
      else active.push(thread);
    }
    const split = partitionPinned(active);
    return {
      scoped: visible,
      pinnedBase: sortByCreatedAtDescending(split.pinned),
      inboxBase: sortByCreatedAtDescending(split.inbox),
      inactive: sortByCreatedAtDescending(onInactiveShelf),
      // Soonest wake first: "what comes back next" is the shelf's question.
      snoozed: [...onSnoozeShelf].sort(
        (left, right) =>
          (lifecycle.wakeAtFor(left) ?? 0) - (lifecycle.wakeAtFor(right) ?? 0),
      ),
      settled: sortByCreatedAtDescending(onSettledShelf),
    };
  }, [inactiveAfterHours, lifecycle, now, scope, searchQuery, threads]);

  const { allPinnedBase, allInboxBase } = useMemo(() => {
    const visible = visibleInboxThreads(threads);
    const roots = hideChildrenOfVisibleParents(visible);
    // Keep parked roots in the master order. Visible drag operations merge
    // into this complete sequence, so snoozed/settled rows retain their slot
    // when they return.
    const split = partitionPinned(roots);
    return {
      allPinnedBase: sortByCreatedAtDescending(split.pinned),
      allInboxBase: sortByCreatedAtDescending(split.inbox),
    };
  }, [threads]);

  const pinnedOrder = useThreadOrder("pinned", allPinnedBase);
  const inboxOrder = useThreadOrder("inbox", allInboxBase);
  const [dragOrder, setDragOrder] = useState<{
    shelf: ThreadOrderShelf;
    movingId: string;
    ids: string[];
  } | null>(null);
  const dragOrderRef = useRef(dragOrder);
  dragOrderRef.current = dragOrder;
  const activeDragCancelRef = useRef<(() => void) | null>(null);
  const suppressedClickRef = useRef<string | null>(null);
  const suppressedClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => activeDragCancelRef.current?.(), []);

  const pinned = orderThreads(
    orderThreads(pinnedBase, pinnedOrder.ids),
    dragOrder?.shelf === "pinned" ? dragOrder.ids : null,
  );
  const inbox = orderThreads(
    orderThreads(inboxBase, inboxOrder.ids),
    dragOrder?.shelf === "inbox" ? dragOrder.ids : null,
  );
  const inactiveForcedOpen =
    (searchQuery.trim().length > 0 && inactive.length > 0) ||
    (activeThreadId !== null &&
      inactive.some(
        (thread) =>
          thread.id === activeThreadId ||
          descendantsOf(scoped, thread.id).some(
            (descendant) => descendant.id === activeThreadId,
          ),
      ));
  const inactiveExpanded = showInactive || inactiveForcedOpen;
  const relevantGitThreads = [
    ...pinned,
    ...inbox,
    ...(inactiveExpanded ? inactive : []),
  ];
  const environmentIds = [
    ...new Set(
      relevantGitThreads.flatMap((thread) =>
        thread.environment?.id ? [thread.environment.id] : [],
      ),
    ),
  ];
  const environmentIdsKey = environmentIds.join("\0");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const chunks = Array.from(
          { length: Math.ceil(environmentIds.length / 200) },
          (_, index) => environmentIds.slice(index * 200, (index + 1) * 200),
        );
        const results = [];
        for (const ids of chunks) {
          results.push(
            await rpc.call("listEnvironmentGitStates", { environmentIds: ids }),
          );
        }
        if (active) {
          setGitStates(
            new Map(
              results.flatMap((result) => result.states).map((entry) => [entry.environmentId, entry.state]),
            ),
          );
        }
      } catch {
        // A backend reload can briefly leave the new RPC unavailable.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [environmentIdsKey, rpc]);
  const selectableIds = [...pinned, ...inbox, ...inactive].map((thread) => thread.id);
  const selectableIdsKey = selectableIds.join("\0");
  useEffect(() => {
    const available = new Set(selectableIds);
    setSelection((current) => {
      const selectedIds = new Set([...current.selectedIds].filter((id) => available.has(id)));
      const anchorId = current.anchorId && available.has(current.anchorId) ? current.anchorId : null;
      return selectedIds.size === current.selectedIds.size && anchorId === current.anchorId
        ? current
        : { selectedIds, anchorId };
    });
  }, [selectableIdsKey]);
  const selectedThreads = [...pinned, ...inbox, ...inactive].filter((thread) => selection.selectedIds.has(thread.id));
  const parkableSelectedThreads = selectedThreads.filter((thread) =>
    lifecycle.canPark(thread, descendantsOf(scoped, thread.id)),
  );
  const selectThread = (threadId: string, event: React.MouseEvent<HTMLElement>) => {
    const toggleKey = event.altKey;
    if (!toggleKey && !event.shiftKey) {
      if (selection.selectedIds.size > 0) setSelection(EMPTY_THREAD_SELECTION);
      return false;
    }
    setSelection((current) => updateThreadSelection(current, selectableIds, threadId, { shiftKey: event.shiftKey, toggleKey }));
    return true;
  };
  const selectThreadFromKeyboard = (
    threadId: string,
    event: React.KeyboardEvent<HTMLAnchorElement>,
  ) => {
    if (
      event.key !== " " ||
      (!event.shiftKey && !event.metaKey && !event.ctrlKey)
    ) return false;
    event.preventDefault();
    event.stopPropagation();
    setSelection((current) =>
      updateThreadSelection(current, selectableIds, threadId, {
        shiftKey: event.shiftKey,
        toggleKey: event.metaKey || event.ctrlKey,
      }),
    );
    return true;
  };
  const runBulk = async (action: "settle" | "snooze" | "archive") => {
    const targets = action === "archive" ? selectedThreads : parkableSelectedThreads;
    if (bulkBusy || targets.length === 0) return;
    setBulkBusy(true);
    if (action === "archive") {
      try {
        // The host API is dispatch-only. Keep IDs selected until the host's
        // thread feed confirms their removal; a failed dispatch stays visible.
        targets.forEach((thread) => actions.archive(thread.id));
      } finally {
        setBulkBusy(false);
      }
      return;
    }
    try {
      const results = await Promise.allSettled(targets.map(async (thread) => {
        if (action === "settle") await lifecycle.settle(thread.id);
        else await lifecycle.snooze(thread.id, Date.now() + 30 * 60_000);
      }));
      const completedIds = new Set(
        targets.filter((_, index) => results[index]?.status === "fulfilled").map((thread) => thread.id),
      );
      setSelection((current) => {
        const selectedIds = new Set(
          [...current.selectedIds].filter((id) => !completedIds.has(id)),
        );
        return {
          selectedIds,
          anchorId:
            current.anchorId && selectedIds.has(current.anchorId)
              ? current.anchorId
              : null,
        };
      });
    } catch {
      // Keep the selection so the user can retry a failed bulk mutation.
    } finally { setBulkBusy(false); }
  };

  const scopeLabel =
    scope === ALL_PROJECTS
      ? "All projects"
      : (projectNameById.get(scope) ?? "All projects");

  const toggleChildren = (threadId: string) => {
    setExpandedParents((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const threadReorderControls = (
    thread: PluginSidebarThread,
    shelf: ThreadOrderShelf,
  ): ThreadReorderControls => {
    const target = shelf === "pinned" ? pinnedOrder : inboxOrder;
    const visibleIds = (shelf === "pinned" ? pinned : inbox).map(
      (candidate) => candidate.id,
    );
    return {
      disabled: target.isReordering,
      isDragging:
        dragOrder?.shelf === shelf && dragOrder.movingId === thread.id,
      consumeSuppressedClick: () => {
        if (suppressedClickRef.current !== thread.id) return false;
        suppressedClickRef.current = null;
        return true;
      },
      onPointerDown: (event) => {
        if (target.isReordering || event.button !== 0) return;
        activeDragCancelRef.current?.();
        const pressedElement = event.currentTarget;
        const previousElementCursor = pressedElement.style.cursor;
        pressedElement.style.cursor = "grabbing";
        const dragCursorStyle = document.createElement("style");
        dragCursorStyle.dataset.threadInboxDragCursor = "";
        dragCursorStyle.textContent = "* { cursor: grabbing !important; }";
        document.head.appendChild(dragCursorStyle);
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        let engaged = false;
        let finished = false;
        let previousUserSelect = "";
        let previousCursor = "";

        const cleanup = () => {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          window.removeEventListener("pointercancel", onPointerCancel);
          window.removeEventListener("keydown", onEscape);
          pressedElement.style.cursor = previousElementCursor;
          dragCursorStyle.remove();
          if (engaged) {
            document.body.style.userSelect = previousUserSelect;
            document.body.style.cursor = previousCursor;
          }
          if (activeDragCancelRef.current === cancel) {
            activeDragCancelRef.current = null;
          }
        };
        const cancel = () => {
          if (finished) return;
          finished = true;
          cleanup();
          if (engaged) {
            dragOrderRef.current = null;
            setDragOrder(null);
          }
        };
        const engage = () => {
          engaged = true;
          previousUserSelect = document.body.style.userSelect;
          previousCursor = document.body.style.cursor;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";
          const next = { shelf, movingId: thread.id, ids: visibleIds };
          dragOrderRef.current = next;
          setDragOrder(next);
        };
        const reorderAt = (clientX: number, clientY: number) => {
          const hit = document.elementFromPoint(clientX, clientY);
          if (!(hit instanceof Element)) return;
          const childGroup = hit.closest<HTMLElement>("[data-parent-thread-id]");
          const childParentId = childGroup?.dataset.parentThreadId;
          const rootCard = childParentId
            ? [...document.querySelectorAll<HTMLElement>("[data-thread-card-root]")].find(
                (candidate) => candidate.dataset.threadCardId === childParentId,
              ) ?? null
            : hit.closest<HTMLElement>("[data-thread-card-root]");
          const targetId = rootCard?.dataset.threadCardId;
          const current = dragOrderRef.current;
          if (
            !rootCard ||
            !targetId ||
            !visibleIds.includes(targetId) ||
            !current ||
            current.shelf !== shelf ||
            current.movingId === targetId
          ) return;
          const rect = rootCard.getBoundingClientRect();
          const ids = moveThreadId(
            current.ids,
            current.movingId,
            targetId,
            clientY < rect.top + rect.height / 2 ? "before" : "after",
          );
          const next = { ...current, ids };
          dragOrderRef.current = next;
          setDragOrder(next);
        };
        function onPointerMove(moveEvent: PointerEvent) {
          if (finished || moveEvent.pointerId !== pointerId) return;
          if (!engaged) {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (Math.abs(dy) < 6 || Math.abs(dy) <= Math.abs(dx)) return;
            engage();
          }
          moveEvent.preventDefault();
          reorderAt(moveEvent.clientX, moveEvent.clientY);
        }
        function onPointerUp(upEvent: PointerEvent) {
          if (finished || upEvent.pointerId !== pointerId) return;
          const current = dragOrderRef.current;
          finished = true;
          cleanup();
          if (!engaged || !current || current.shelf !== shelf) return;
          dragOrderRef.current = null;
          setDragOrder(null);
          suppressedClickRef.current = current.movingId;
          if (suppressedClickTimerRef.current !== null) {
            clearTimeout(suppressedClickTimerRef.current);
          }
          // The compatibility click follows pointerup immediately. Do not let
          // a click that never reached the moved card poison its next action.
          suppressedClickTimerRef.current = setTimeout(() => {
            if (suppressedClickRef.current === current.movingId) {
              suppressedClickRef.current = null;
            }
            suppressedClickTimerRef.current = null;
          }, 250);
          void target.reorder(mergeVisibleOrder(target.ids, current.ids));
        }
        function onPointerCancel(cancelEvent: PointerEvent) {
          if (cancelEvent.pointerId === pointerId) cancel();
        }
        function onEscape(keyEvent: KeyboardEvent) {
          if (keyEvent.key === "Escape") cancel();
        }
        window.addEventListener("pointermove", onPointerMove, { passive: false });
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
        window.addEventListener("keydown", onEscape);
        activeDragCancelRef.current = cancel;
      },
      onKeyDown: (event) => {
        if (
          !event.altKey ||
          target.isReordering ||
          (event.key !== "ArrowUp" && event.key !== "ArrowDown")
        ) return;
        event.preventDefault();
        event.stopPropagation();
        const ids = moveThreadIdByOffset(
          visibleIds,
          thread.id,
          event.key === "ArrowUp" ? -1 : 1,
        );
        void target.reorder(mergeVisibleOrder(target.ids, ids));
      },
    };
  };

  const renderThreadGroup = (
    thread: PluginSidebarThread,
    shelf: ThreadOrderShelf | null,
  ) => {
    const directChildren = childrenOf(scoped, thread.id);
    const descendants = descendantsOf(scoped, thread.id);
    const activeInsideGroup = descendants.some(
      (candidate) => candidate.id === activeThreadId,
    );
    const matchingChild =
      searchQuery.trim().length > 0 &&
      searchThreadsByTitle(directChildren, searchQuery).length > 0;
    const expanded =
      directChildren.length > 0 &&
      (expandedParents.has(thread.id) || activeInsideGroup || matchingChild);
    const wakeAt = lifecycle.wakeAtFor(thread);
    const snoozedAt = lifecycle.snoozedAtFor(thread);

    return (
      <ThreadCard
        key={thread.id}
        thread={thread}
        statusThread={statusSourceForGroup(thread, descendants)}
        projectName={projectNameById.get(thread.projectId) ?? null}
        isActive={thread.id === activeThreadId}
        canPark={lifecycle.canPark(thread, descendants)}
        isWoken={lifecycle.wokeFor(thread, descendants)}
        isSelected={selection.selectedIds.has(thread.id)}
        onSelectionClick={(event) => selectThread(thread.id, event)}
        onSelectionKeyDown={(event) => selectThreadFromKeyboard(thread.id, event)}
        gitStatus={thread.environment?.id ? gitStates.get(thread.environment.id) : null}
        onAcknowledgeWake={snoozedAt === null ? undefined : () => lifecycle.acknowledgeWake(thread.id, snoozedAt)}
        onNavigate={onNavigate}
        onSettle={() => lifecycle.settle(thread.id)}
        onSnooze={(until) => lifecycle.snooze(thread.id, until)}
        now={now}
        childCount={directChildren.length}
        childrenExpanded={expanded}
        onToggleChildren={
          directChildren.length > 0 ? () => toggleChildren(thread.id) : undefined
        }
        reorder={shelf ? threadReorderControls(thread, shelf) : undefined}
      >
        {expanded ? (
          <ul
            aria-label={`Child threads of ${threadDisplayTitle(thread)}`}
            data-parent-thread-id={thread.id}
            className="ml-3 flex flex-col gap-px border-l border-sidebar-border pl-1"
          >
            {directChildren.map((child) => (
              <ChildThreadRow
                key={child.id}
                thread={child}
                isActive={child.id === activeThreadId}
                onNavigate={onNavigate}
                onOpen={
                  lifecycle.wokeFor(thread, descendants) && snoozedAt !== null
                    ? () => lifecycle.acknowledgeWake(thread.id, snoozedAt)
                    : undefined
                }
                now={now}
                childCount={childrenOf(scoped, child.id).length}
              />
            ))}
          </ul>
        ) : null}
      </ThreadCard>
    );
  };

  return (
    <div data-t3-sidebar-root="" className="flex min-h-0 flex-1 flex-col">
      {/* The one control the host has no equivalent for. Everything else in
          the chrome above — New thread, search — is bb's and stays bb's. */}
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
        {selectedThreads.length > 0 ? <div role="toolbar" aria-label={`${selectedThreads.length} threads selected`} className="flex h-7 min-w-0 flex-1 items-center gap-1">
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">{selectedThreads.length} selected</span>
          <button disabled={bulkBusy || parkableSelectedThreads.length === 0} onClick={() => void runBulk("snooze")} className="rounded px-1.5 py-1 text-xs hover:bg-sidebar-accent disabled:opacity-50">Snooze 30m</button>
          <button disabled={bulkBusy || parkableSelectedThreads.length === 0} onClick={() => void runBulk("settle")} className="rounded px-1.5 py-1 text-xs hover:bg-sidebar-accent disabled:opacity-50">Settle</button>
          <button disabled={bulkBusy} onClick={() => void runBulk("archive")} className="rounded px-1.5 py-1 text-xs hover:bg-sidebar-accent disabled:opacity-50">Archive</button>
          <button aria-label="Clear selection" disabled={bulkBusy} onClick={() => setSelection(EMPTY_THREAD_SELECTION)} className="rounded px-1.5 py-1 text-xs hover:bg-sidebar-accent disabled:opacity-50">×</button>
        </div> :
        <Select value={scope} onValueChange={setScope}>
          {/* Ghost trigger: no border, no filled track — it reads as a label
              until you hover it. */}
          <SelectTrigger
            className="h-7 min-w-0 flex-1 border-0 px-1.5 py-1 text-xs font-medium text-muted-foreground shadow-none hover:bg-sidebar-accent focus:ring-0"
            aria-label={`Project scope: ${scopeLabel}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROJECTS} className="text-xs">
              All projects
            </SelectItem>
            {projects.map((project) => (
              <SelectItem
                key={project.id}
                value={project.id}
                className="text-xs"
              >
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {status === "loading" ? null : status === "error" ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            Could not load threads.
          </p>
        ) : pinned.length + inbox.length + inactive.length + snoozed.length + settled.length ===
          0 ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            {searchQuery.trim() ? "No threads found" : "No threads yet"}
          </p>
        ) : (
          <>
            {pinned.length > 0 ? (
              <Shelf label="Pinned">
                {pinned.map((thread) => renderThreadGroup(thread, "pinned"))}
              </Shelf>
            ) : null}
            {inbox.length > 0 ? (
              <Shelf label={pinned.length > 0 ? "Inbox" : null}>
                {inbox.map((thread) => renderThreadGroup(thread, "inbox"))}
              </Shelf>
            ) : null}
            <InactiveShelf
              label="Inactive"
              threads={inactive}
              expanded={inactiveExpanded}
              onToggle={() => setShowInactive((open) => !open)}
              renderThread={(thread) => renderThreadGroup(thread, null)}
            />
            <ParkedShelf
              label="Snoozed"
              threads={snoozed}
              expanded={showSnoozed}
              onToggle={() => setShowSnoozed((open) => !open)}
              shelf="snoozed"
              activeThreadId={activeThreadId}
              lifecycle={lifecycle}
              onNavigate={onNavigate}
            />
            <ParkedShelf
              label="Settled"
              threads={settled}
              expanded={showSettled}
              onToggle={() => setShowSettled((open) => !open)}
              shelf="settled"
              activeThreadId={activeThreadId}
              lifecycle={lifecycle}
              onNavigate={onNavigate}
            />
          </>
        )}
      </div>
    </div>
  );
}

function InactiveShelf({ label, threads, expanded, onToggle, renderThread }: {
  label: string;
  threads: readonly PluginSidebarThread[];
  expanded: boolean;
  onToggle: () => void;
  renderThread: (thread: PluginSidebarThread) => React.ReactNode;
}) {
  if (threads.length === 0) return null;
  return <section aria-label={label}>
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="mt-3 flex w-full items-center gap-2 px-2.5 pb-1 text-left">
      <span className="text-2xs font-medium text-muted-foreground/70">{expanded ? label : `${label} (${threads.length})`}</span>
      <span className="h-px flex-1 bg-sidebar-border" />
      <Icon name="ChevronDown" className={cn("size-3 text-muted-foreground/70 transition-transform", expanded && "rotate-180")} />
    </button>
    {expanded ? <ul className="flex flex-col gap-px">{threads.map(renderThread)}</ul> : null}
  </section>;
}

/**
 * A collapsed shelf of parked threads. The header stays while anything is
 * parked — the count is the whole footprint when collapsed — and the shelf
 * vanishes entirely at zero.
 */
function ParkedShelf({
  label,
  threads,
  expanded,
  onToggle,
  shelf,
  activeThreadId,
  lifecycle,
  onNavigate,
}: {
  label: string;
  threads: readonly PluginSidebarThread[];
  expanded: boolean;
  onToggle: () => void;
  shelf: "snoozed" | "settled";
  activeThreadId: string | null;
  lifecycle: ReturnType<typeof useLifecycle>;
  onNavigate: () => void;
}) {
  if (threads.length === 0) return null;
  const now = Date.now();
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        // Padded like a card, so the chevron ends on the same right edge as
        // every row's status and provider glyph.
        className="mt-3 flex w-full items-center gap-2 px-2.5 pb-1 text-left"
      >
        <span className="text-2xs font-medium text-muted-foreground/70">
          {expanded ? label : `${label} (${threads.length})`}
        </span>
        <span className="h-px flex-1 bg-sidebar-border" />
        <span className={TRAILING_GLYPH_BOX_CLASS}>
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-px">
          {threads.map((thread) => (
            <SlimRow
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              shelf={shelf}
              wakeAt={lifecycle.wakeAtFor(thread)}
              now={now}
              onNavigate={onNavigate}
              onRestore={() =>
                shelf === "snoozed"
                  ? lifecycle.unsnooze(thread.id)
                  : lifecycle.unsettle(thread.id)
              }
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Shelf({
  label,
  children,
}: {
  label: string | null;
  children: React.ReactNode;
}) {
  const attachListAutoAnimateRef = useListAutoAnimate<HTMLUListElement>();
  return (
    // A named section is exposed as a landmark region; an unnamed one is not,
    // which is exactly right for the single unlabelled inbox list.
    <section {...(label ? { "aria-label": label } : {})}>
      {label ? (
        <h2 className={cn("flex items-center gap-2 px-2.5 pb-1 pt-3")}>
          <span className="text-2xs font-medium text-muted-foreground/70">
            {label}
          </span>
          <span className="h-px flex-1 bg-sidebar-border" />
        </h2>
      ) : null}
      <ul ref={attachListAutoAnimateRef} className="flex flex-col gap-px">
        {children}
      </ul>
    </section>
  );
}
