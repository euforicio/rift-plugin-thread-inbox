import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { RowContextMenu } from "./RowContextMenu";
import { STATUS_SLOT_CLASS, StatusOrTime } from "./StatusSlot";
import { threadDisplayTitle } from "./inbox";

/** A compact direct child nested beneath its top-level parent card. */
export function ChildThreadRow({
  thread,
  isActive,
  onNavigate,
  now,
  childCount = 0,
  onOpen,
}: {
  thread: PluginSidebarThread;
  isActive: boolean;
  onNavigate: () => void;
  now: number;
  /** Deeper descendants stay in the header UI and are summarized here. */
  childCount?: number;
  onOpen?: () => void;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const title = threadDisplayTitle(thread);

  return (
    <li className="list-none">
      <RowContextMenu thread={thread} onOpen={onOpen}>
        <div
          className={cn(
            "relative flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
        >
          <a
            href="#"
            aria-label={title}
            {...splitProps}
            onPointerDown={(event) => {
              splitProps.onPointerDown?.(event);
            }}
            onClick={(event) => {
              event.preventDefault();
              actions.open(thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onOpen?.();
              onNavigate();
            }}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          <span
            className={cn(
              "pointer-events-none relative min-w-0 flex-1 truncate",
              thread.isUnread
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {title}
          </span>
          {childCount > 0 ? (
            <span
              aria-label={`${childCount} nested child ${childCount === 1 ? "thread" : "threads"}`}
              className="pointer-events-none relative shrink-0 text-2xs tabular-nums text-muted-foreground/60"
            >
              ↳{childCount}
            </span>
          ) : null}
          <span className={cn(STATUS_SLOT_CLASS, "pointer-events-none relative")}>
            <StatusOrTime thread={thread} now={now} />
          </span>
        </div>
      </RowContextMenu>
    </li>
  );
}
