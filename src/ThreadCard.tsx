import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEvent,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { usePortalScopeProps } from "./lib/portal-scope";
import { RowContextMenu } from "./RowContextMenu";
import { ProviderGlyph } from "./ProviderGlyph";
import { STATUS_SLOT_CLASS, StatusOrTime } from "./StatusSlot";
import { threadDisplayTitle } from "./inbox";
import { resolveSnoozePresets } from "./lifecycle";
import { InlineThreadTitle } from "./InlineThreadTitle";

export interface ThreadReorderControls {
  disabled: boolean;
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onKeyDown: KeyboardEventHandler<HTMLAnchorElement>;
  consumeSuppressedClick: () => boolean;
}

export type GitStatusState =
  | "clean"
  | "untracked"
  | "dirty_uncommitted"
  | "committed_unmerged"
  | "dirty_and_committed_unmerged";

type PullRequestState = "draft" | "open" | "merged" | "closed";

interface GitGlyphPresentation {
  icon: IconName;
  label: string;
  colorClass: string;
  sizeClass: string;
}

const NON_PR_GIT_COLORS: Record<GitStatusState, string> = {
  clean: "text-muted-foreground/70",
  untracked: "text-warning",
  dirty_uncommitted: "text-warning",
  committed_unmerged: "text-primary",
  dirty_and_committed_unmerged: "text-warning",
};

const PULL_REQUEST_GIT_GLYPHS: Record<
  PullRequestState,
  GitGlyphPresentation
> = {
  open: {
    icon: "GitPullRequestArrow",
    label: "Open Pull Request",
    colorClass: "text-success",
    sizeClass: "size-4 shrink-0",
  },
  closed: {
    icon: "GitPullRequestClosed",
    label: "Closed Pull Request",
    colorClass: "text-destructive",
    sizeClass: "size-4 shrink-0",
  },
  merged: {
    icon: "GitMerge",
    label: "Merged Pull Request",
    colorClass: "text-pr-merged",
    sizeClass: "size-4 shrink-0",
  },
  draft: {
    icon: "GitPullRequestDraft",
    label: "Draft Pull Request",
    colorClass: "text-muted-foreground",
    sizeClass: "size-4 shrink-0",
  },
};

function resolveGitGlyph(
  pullRequestState: PullRequestState | null | undefined,
  gitStatus: GitStatusState | null | undefined,
): GitGlyphPresentation | null {
  if (pullRequestState) return PULL_REQUEST_GIT_GLYPHS[pullRequestState];
  if (!gitStatus) return null;
  return {
    icon: "GitBranch",
    label: gitStatusLabel(gitStatus),
    colorClass: NON_PR_GIT_COLORS[gitStatus],
    sizeClass: "size-3 shrink-0",
  };
}

export function ThreadCard({
  thread,
  statusThread = thread,
  projectName,
  isActive,
  canPark,
  onNavigate,
  onSettle,
  onSnooze,
  isWoken = false,
  onAcknowledgeWake,
  now,
  childCount = 0,
  childrenExpanded = false,
  onToggleChildren,
  reorder,
  gitStatus,
  isSelected = false,
  onSelectionClick,
  onSelectionKeyDown,
  children,
}: {
  thread: PluginSidebarThread;
  statusThread?: PluginSidebarThread;
  projectName: string | null;
  isActive: boolean;
  canPark: boolean;
  onNavigate: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  isWoken?: boolean;
  onAcknowledgeWake?: () => void;
  now: number;
  childCount?: number;
  childrenExpanded?: boolean;
  onToggleChildren?: () => void;
  reorder?: ThreadReorderControls;
  gitStatus?: GitStatusState | null;
  isSelected?: boolean;
  onSelectionClick?: (event: MouseEvent<HTMLElement>) => boolean;
  onSelectionKeyDown?: (event: KeyboardEvent<HTMLAnchorElement>) => boolean;
  children?: ReactNode;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  // Keep the hover controls visible while their portalled snooze menu is open.
  // Otherwise moving the pointer into the menu makes the trigger disappear.
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const pendingTitleNavigate = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pendingTitleNavigate.current !== null) clearTimeout(pendingTitleNavigate.current);
  }, []);
  useEffect(() => {
    if (!canPark) setSnoozeMenuOpen(false);
  }, [canPark]);
  const openThread = (
    event: Pick<MouseEvent | KeyboardEvent, "preventDefault" | "metaKey" | "ctrlKey">,
  ) => {
    event.preventDefault();
    actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
    if (isWoken) onAcknowledgeWake?.();
    onNavigate();
  };
  const handleSplitPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    splitProps.onPointerDown?.(event);
  };
  const handleCardPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    handleSplitPointerDown(event);
    reorder?.onPointerDown(event);
  };
  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (isRenaming) return;
    if (reorder?.consumeSuppressedClick()) return;
    if (onSelectionClick?.(event)) return;
    openThread(event);
  };
  const handleRenameDoubleClick = () => {
    if (pendingTitleNavigate.current !== null) {
      clearTimeout(pendingTitleNavigate.current);
      pendingTitleNavigate.current = null;
    }
    setIsRenaming(true);
  };
  const handleTitleClick = (event: MouseEvent<HTMLElement>) => {
    // A browser emits click(detail=1), click(detail=2), then dblclick. Open on
    // the first click only so a rename gesture never opens the thread twice.
    if (event.detail > 1) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (isRenaming) return;
    if (reorder?.consumeSuppressedClick()) return;
    if (onSelectionClick?.(event)) return;
    if (event.metaKey || event.ctrlKey || event.detail === 0) {
      openThread(event);
      return;
    }
    // Opening the thread is immediate. Only compact-layout drawer closure is
    // deferred, so a second click can still reach the title and start rename.
    actions.open(thread.id, { split: false });
    if (isWoken) onAcknowledgeWake?.();
    if (pendingTitleNavigate.current !== null) clearTimeout(pendingTitleNavigate.current);
    pendingTitleNavigate.current = setTimeout(() => {
      pendingTitleNavigate.current = null;
      onNavigate();
    }, 500);
  };

  return (
    <li
      className={cn(
        "list-none transition-opacity duration-150 ease-out motion-reduce:transition-none",
        reorder?.isDragging && "opacity-50",
      )}
    >
      <RowContextMenu
        thread={thread}
        onRename={() => setIsRenaming(true)}
        onOpen={isWoken ? onAcknowledgeWake : undefined}
      >
        <div
          data-thread-card-root=""
          data-thread-card-id={thread.id}
          className={cn(
            "group/card relative rounded-md px-2.5 py-2 transition-colors",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            isSelected && "ring-1 ring-inset ring-ring bg-sidebar-accent/70",
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
        >
          <a
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={`${threadDisplayTitle(thread)}${isSelected ? ", selected" : ""}`}
            {...splitProps}
            draggable={false}
            aria-keyshortcuts={
              reorder
                ? "Alt+ArrowUp Alt+ArrowDown Control+Space Meta+Space Shift+Space"
                : "Control+Space Meta+Space Shift+Space"
            }
            onPointerDown={(event) => {
              handleCardPointerDown(event);
            }}
            onKeyDown={(event) => {
              if (onSelectionKeyDown?.(event)) return;
              reorder?.onKeyDown(event);
            }}
            onClick={handleCardClick}
            className={cn(
              "absolute inset-0 rounded-md",
              reorder && !reorder.disabled
                ? "cursor-default active:cursor-grabbing"
                : "cursor-default",
            )}
          />
          <div
            data-thread-card-primary=""
            className="pointer-events-none relative flex h-5 items-center gap-1.5"
          >
            <InlineThreadTitle
              thread={thread}
              editing={isRenaming}
              onEditingChange={setIsRenaming}
              onPointerDown={handleCardPointerDown}
              onClick={handleTitleClick}
              onDoubleClick={handleRenameDoubleClick}
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-foreground",
                thread.isUnread && "font-medium",
              )}
            />
            {canPark ? (
              <span
                className={cn(
                  "pointer-events-auto items-center gap-0.5",
                  snoozeMenuOpen ? "flex" : "hidden group-hover/card:flex",
                )}
              >
                <SnoozeMenu
                  open={snoozeMenuOpen}
                  onOpenChange={setSnoozeMenuOpen}
                  onSnooze={onSnooze}
                />
                <ParkButton label="Settle thread" icon="Check" onActivate={onSettle} />
              </span>
            ) : null}
            {isWoken ? (
              <button type="button" aria-label="Dismiss Woken marker"
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAcknowledgeWake?.(); }}
                className="pointer-events-auto relative z-10 shrink-0 rounded px-1 text-2xs font-medium text-foreground hover:bg-sidebar-accent">
                Woken
              </button>
            ) : <span
              className={cn(
                STATUS_SLOT_CLASS,
                canPark && "group-hover/card:hidden",
                snoozeMenuOpen && "hidden",
              )}
            >
              <StatusOrTime thread={statusThread} now={now} />
            </span>}
          </div>
          <div
            data-thread-card-metadata=""
            className="pointer-events-none relative mt-0.5 flex h-4 items-center gap-1.5 text-2xs text-muted-foreground"
          >
            <MetadataIdentity
              projectName={projectName}
              branchName={thread.environment?.branchName ?? null}
              gitStatus={gitStatus}
              pullRequestState={pullRequest?.state ?? null}
              pullRequestNumber={pullRequest?.number ?? null}
              onOpen={openThread}
              onSplitPointerDown={handleSplitPointerDown}
              onReorderPointerDown={reorder?.onPointerDown}
              consumeSuppressedClick={reorder?.consumeSuppressedClick}
            />
            {thread.activity.workflows > 0 ? (
              <ActivityCount label="workflows" count={thread.activity.workflows} />
            ) : null}
            {thread.activity.backgroundAgents > 0 ? (
              <ActivityCount
                label="background agents"
                count={thread.activity.backgroundAgents}
              />
            ) : null}
            <span
              data-thread-card-fixed-trailing=""
              className="relative flex min-w-12 shrink-0 items-center justify-end gap-1"
            >
              {childCount > 0 && onToggleChildren ? (
                <button
                  type="button"
                  aria-label={`${childrenExpanded ? "Hide" : "Show"} ${childCount} child ${childCount === 1 ? "thread" : "threads"}`}
                  aria-expanded={childrenExpanded}
                  title={`${childCount} child ${childCount === 1 ? "thread" : "threads"}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleChildren();
                  }}
                  className="pointer-events-auto relative flex h-4 shrink-0 items-center gap-0.5 rounded px-0.5 tabular-nums text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  <Icon
                    name="ChevronDown"
                    className={cn(
                      "size-3 shrink-0 transition-transform",
                      !childrenExpanded && "-rotate-90",
                    )}
                  />
                  <span className="whitespace-nowrap">{childCount}</span>
                </button>
              ) : null}
              <ProviderGlyph providerId={thread.providerId} />
            </span>
          </div>
        </div>
      </RowContextMenu>
      {children}
    </li>
  );
}

function MetadataIdentity({
  projectName,
  branchName,
  gitStatus,
  pullRequestState,
  pullRequestNumber,
  onOpen,
  onSplitPointerDown,
  onReorderPointerDown,
  consumeSuppressedClick,
}: {
  projectName: string | null;
  branchName: string | null;
  gitStatus?: GitStatusState | null;
  pullRequestState?: PullRequestState | null;
  pullRequestNumber?: number | null;
  onOpen: (
    event: Pick<MouseEvent | KeyboardEvent, "preventDefault" | "metaKey" | "ctrlKey">,
  ) => void;
  onSplitPointerDown?: PointerEventHandler<HTMLElement>;
  onReorderPointerDown?: PointerEventHandler<HTMLElement>;
  consumeSuppressedClick?: () => boolean;
}) {
  const detail = branchName;
  const gitLabel = resolveGitGlyph(pullRequestState, gitStatus)?.label ?? null;
  const fullLabel = [
    projectName,
    detail,
    gitLabel,
    pullRequestNumber !== null && pullRequestNumber !== undefined
      ? `PR #${pullRequestNumber}`
      : null,
  ].filter(Boolean).join(" · ");
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [isReturning, setIsReturning] = useState(false);

  const stopMotion = () => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
  };

  const animateScroll = (
    scroller: HTMLElement,
    target: number,
    duration: number,
    onComplete?: () => void,
  ) => {
    stopMotion();
    const start = scroller.scrollLeft;
    const distance = target - start;
    if (Math.abs(distance) < 1) {
      onComplete?.();
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased =
        progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      scroller.scrollLeft = start + distance * eased;
      if (progress < 1) animationFrame.current = requestAnimationFrame(step);
      else {
        animationFrame.current = null;
        onComplete?.();
      }
    };
    animationFrame.current = requestAnimationFrame(step);
  };

  const scrollerFor = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("[data-thread-card-identity-scroll]");

  const prefersReducedMotion = () =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const startReveal = (container: HTMLElement) => {
    setIsReturning(false);
    const scroller = scrollerFor(container);
    if (!scroller) return;
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    if (overflow <= 0) return;
    if (prefersReducedMotion()) {
      scroller.scrollLeft = overflow;
      return;
    }
    hoverTimer.current = setTimeout(() => {
      const duration = Math.min(2_400, Math.max(1_200, overflow * 12));
      animateScroll(scroller, overflow, duration);
    }, 250);
  };

  const returnToStart = (container: HTMLElement) => {
    const scroller = scrollerFor(container);
    if (!scroller || scroller.scrollLeft <= 0) {
      stopMotion();
      setIsReturning(false);
      return;
    }
    if (prefersReducedMotion()) {
      stopMotion();
      scroller.scrollLeft = 0;
      setIsReturning(false);
      return;
    }
    setIsReturning(true);
    animateScroll(scroller, 0, 500, () => setIsReturning(false));
  };

  useEffect(() => stopMotion, []);

  return (
    <span
      data-thread-card-identity=""
      aria-label={fullLabel || undefined}
      title={fullLabel || undefined}
      role="link"
      tabIndex={0}
      className="group/metadata pointer-events-auto relative min-w-0 flex-1 cursor-default overflow-hidden whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
      onClick={(event) => {
        if (consumeSuppressedClick?.()) {
          event.preventDefault();
          return;
        }
        onOpen(event);
      }}
      onPointerDown={(event) => {
        onSplitPointerDown?.(event);
        onReorderPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(event);
      }}
      onMouseEnter={(event) => startReveal(event.currentTarget)}
      onFocus={(event) => startReveal(event.currentTarget)}
      onMouseLeave={(event) => returnToStart(event.currentTarget)}
      onBlur={(event) => returnToStart(event.currentTarget)}
    >
      <span
        data-thread-card-identity-text=""
        className={cn(
          "block truncate transition-opacity duration-200 group-hover/metadata:opacity-0 group-focus/metadata:opacity-0",
          isReturning && "opacity-0",
        )}
      >
        <MetadataLabel projectName={projectName} detail={detail} gitStatus={gitStatus} pullRequestState={pullRequestState} pullRequestNumber={pullRequestNumber} />
      </span>
      <span
        aria-hidden
        data-thread-card-identity-scroll=""
        className={cn(
          "pointer-events-none absolute inset-0 min-w-0 overflow-x-auto whitespace-nowrap opacity-0 transition-opacity duration-200 [scrollbar-width:none] group-hover/metadata:opacity-100 group-focus/metadata:opacity-100 [&::-webkit-scrollbar]:hidden",
          isReturning && "opacity-100",
        )}
      >
        <MetadataLabel projectName={projectName} detail={detail} gitStatus={gitStatus} pullRequestState={pullRequestState} pullRequestNumber={pullRequestNumber} />
      </span>
    </span>
  );
}

function MetadataLabel({
  projectName,
  detail,
  gitStatus,
  pullRequestState,
  pullRequestNumber,
}: {
  projectName: string | null;
  detail: string | null;
  gitStatus?: GitStatusState | null;
  pullRequestState?: PullRequestState | null;
  pullRequestNumber?: number | null;
}) {
  const gitGlyph = resolveGitGlyph(pullRequestState, gitStatus);
  return (
    <>
      {projectName ? <span data-thread-card-project="">{projectName}</span> : null}
      {projectName && detail ? (
        <span aria-hidden className="text-muted-foreground/50">
          {" · "}
        </span>
      ) : null}
      {gitGlyph ? (
        <span title={gitGlyph.label} className="mr-1 inline-flex align-middle">
          <Icon
            name={gitGlyph.icon}
            aria-label={gitGlyph.label}
            className={cn(gitGlyph.sizeClass, gitGlyph.colorClass)}
          />
        </span>
      ) : null}
      {detail ? (
        <span
          data-thread-card-branch=""
          className="font-mono text-muted-foreground/70"
        >
          {detail}
        </span>
      ) : null}
      {pullRequestNumber !== null && pullRequestNumber !== undefined ? (
        <>
          {projectName || detail ? (
            <span aria-hidden className="text-muted-foreground/50">
              {" · "}
            </span>
          ) : null}
          <span
            data-thread-card-pull-request=""
            className="font-mono text-muted-foreground"
          >
            #{pullRequestNumber}
          </span>
        </>
      ) : null}
    </>
  );
}

function gitStatusLabel(state: GitStatusState): string {
  switch (state) {
    case "clean": return "Git clean";
    case "untracked": return "Git has untracked files";
    case "dirty_uncommitted": return "Git has uncommitted changes";
    case "committed_unmerged": return "Git has unmerged commits";
    case "dirty_and_committed_unmerged": return "Git has changes and unmerged commits";
  }
}

function SnoozeMenu({
  open,
  onOpenChange,
  onSnooze,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (snoozedUntil: number) => void;
}) {
  // Resolve relative options when the menu opens, rather than when the row
  // mounts, so “In 1 hour” always means one hour from the user's click.
  const presets = useMemo(
    () => (open ? resolveSnoozePresets(new Date()) : []),
    [open],
  );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Snooze thread"
          title="Snooze thread"
          onClick={(event) => event.stopPropagation()}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
        >
          <Icon name="Clock" className="size-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          {...usePortalScopeProps()}
          side="bottom"
          align="end"
          sideOffset={4}
          aria-label="Snooze thread"
          className="z-50 w-24 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          onClick={(event) => event.stopPropagation()}
        >
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenChange(false);
                onSnooze(preset.snoozedUntil);
              }}
              className="flex w-full cursor-pointer items-center rounded-md px-1.5 py-1 text-left text-xs text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className="min-w-0 flex-1">{preset.label}</span>
            </button>
          ))}
          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: Extract<IconName, "Clock" | "Check">;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}
