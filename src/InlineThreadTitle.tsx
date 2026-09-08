import { useEffect, useRef, useState, type MouseEventHandler, type PointerEventHandler } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@riftlabs/plugin-sdk/app";
import { cn } from "./lib/utils";
import { threadDisplayTitle } from "./inbox";

export function InlineThreadTitle({
  thread,
  editing,
  onEditingChange,
  className,
  onClick,
  onPointerDown,
  onDoubleClick,
}: {
  thread: PluginSidebarThread;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  className?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onDoubleClick?: MouseEventHandler<HTMLElement>;
}) {
  const actions = useSidebarThreadActions();
  const title = threadDisplayTitle(thread);
  const [draft, setDraft] = useState(title);
  const finished = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(title);
    finished.current = false;
  }, [editing, title]);

  if (!editing) {
    return (
      <span
        className={cn("pointer-events-auto relative z-10 cursor-text", className)}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDoubleClick?.(event);
          onEditingChange(true);
        }}
      >
        {title}
      </span>
    );
  }
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onEditingChange(false);
    const next = draft.trim();
    if (save && next && next !== title) void actions.rename(thread.id, next);
  };
  return (
    <input autoFocus aria-label={`Rename ${title}`} value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); finish(false); }
      }}
      onBlur={() => finish(true)}
      className={cn("pointer-events-auto relative z-10 h-6 w-full min-w-0 rounded border border-border bg-background px-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring", className)}
    />
  );
}
