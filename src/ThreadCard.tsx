import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEventHandler,
} from "react";
import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { RowContextMenu } from "./RowContextMenu";
import { ProviderGlyph } from "./ProviderGlyph";
import { STATUS_SLOT_CLASS, StatusOrTime } from "./StatusSlot";
import { threadDisplayTitle } from "./inbox";
import { resolveSnoozePresets } from "./lifecycle";

export function ThreadCard({
  thread,
  projectName,
  isActive,
  canPark,
  onNavigate,
  onSettle,
  onSnooze,
  now,
}: {
  thread: PluginSidebarThread;
  projectName: string | null;
  isActive: boolean;
  canPark: boolean;
  onNavigate: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  now: number;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  const openThread = (
    event: Pick<MouseEvent | KeyboardEvent, "preventDefault" | "metaKey" | "ctrlKey">,
  ) => {
    event.preventDefault();
    actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
    onNavigate();
  };

  return (
    <li className="list-none">
      <RowContextMenu thread={thread}>
        <div
          className={cn(
            "group/card relative rounded-md px-2.5 py-2 transition-colors",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
        >
          <a
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={threadDisplayTitle(thread)}
            {...splitProps}
            onClick={openThread}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          <div
            data-thread-card-primary=""
            className="pointer-events-none relative flex h-5 items-center gap-1.5"
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-foreground",
                thread.isUnread && "font-medium",
              )}
            >
              {threadDisplayTitle(thread)}
            </span>
            {canPark ? (
              <span className="pointer-events-auto hidden items-center gap-0.5 group-hover/card:flex">
                <ParkButton
                  label="Snooze until tomorrow"
                  icon="Clock"
                  onActivate={() =>
                    onSnooze(resolveSnoozePresets(new Date())[2]!.snoozedUntil)
                  }
                />
                <ParkButton label="Settle thread" icon="Check" onActivate={onSettle} />
              </span>
            ) : null}
            <span className={cn(STATUS_SLOT_CLASS, canPark && "group-hover/card:hidden")}>
              <StatusOrTime thread={thread} now={now} />
            </span>
          </div>
          <div
            data-thread-card-metadata=""
            className="pointer-events-none relative mt-0.5 flex h-4 items-center gap-1.5 text-2xs text-muted-foreground"
          >
            <MetadataIdentity
              projectName={projectName}
              branchName={thread.environment?.branchName ?? null}
              hostName={thread.host?.name ?? null}
              onOpen={openThread}
              onSplitPointerDown={splitProps.onPointerDown}
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
            {pullRequest ? (
              <a
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                title={pullRequest.title}
                className={cn(
                  "relative shrink-0 font-mono hover:underline",
                  pullRequest.state === "merged"
                    ? "text-[color:var(--pr-merged)]"
                    : pullRequest.attention === "checks_failed" ||
                        pullRequest.attention === "conflicts"
                      ? "text-destructive-text"
                      : pullRequest.attention === "ready_to_merge"
                        ? "text-success-foreground"
                        : "text-muted-foreground",
                )}
              >
                #{pullRequest.number}
              </a>
            ) : null}
            <ProviderGlyph providerId={thread.providerId} />
          </div>
        </div>
      </RowContextMenu>
    </li>
  );
}

function MetadataIdentity({
  projectName,
  branchName,
  hostName,
  onOpen,
  onSplitPointerDown,
}: {
  projectName: string | null;
  branchName: string | null;
  hostName: string | null;
  onOpen: (
    event: Pick<MouseEvent | KeyboardEvent, "preventDefault" | "metaKey" | "ctrlKey">,
  ) => void;
  onSplitPointerDown?: PointerEventHandler<HTMLElement>;
}) {
  const detail = branchName ?? hostName;
  const fullLabel = [projectName, detail].filter(Boolean).join(" · ");
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
      className="group/metadata pointer-events-auto relative min-w-0 flex-1 cursor-pointer overflow-hidden whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
      onClick={onOpen}
      onPointerDown={onSplitPointerDown}
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
          "block truncate transition-opacity duration-200 group-hover/metadata:opacity-0",
          isReturning && "opacity-0",
        )}
      >
        <MetadataLabel projectName={projectName} detail={detail} />
      </span>
      <span
        aria-hidden
        data-thread-card-identity-scroll=""
        className={cn(
          "pointer-events-none absolute inset-0 min-w-0 overflow-x-auto whitespace-nowrap opacity-0 transition-opacity duration-200 [scrollbar-width:none] group-hover/metadata:opacity-100 [&::-webkit-scrollbar]:hidden",
          isReturning && "opacity-100",
        )}
      >
        <MetadataLabel projectName={projectName} detail={detail} />
      </span>
    </span>
  );
}

function MetadataLabel({
  projectName,
  detail,
}: {
  projectName: string | null;
  detail: string | null;
}) {
  return (
    <>
      {projectName ? <span data-thread-card-project="">{projectName}</span> : null}
      {projectName && detail ? (
        <span aria-hidden className="text-muted-foreground/50">
          {" · "}
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
    </>
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
