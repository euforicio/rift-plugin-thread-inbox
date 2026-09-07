# Thread Inbox (w/ Children)

[![CI](https://github.com/wy3z/bb-plugin-thread-inbox/actions/workflows/ci.yml/badge.svg)](https://github.com/wy3z/bb-plugin-thread-inbox/actions/workflows/ci.yml)

A compact inbox-style sidebar for BB with nested child threads, persistent
ordering, parking controls, provider marks, and Git metadata. It is a standalone
evolution of [T3 Sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
by [Sawyer Hood](https://github.com/SawyerHood).

## Features

- Child threads nest beneath collapsible parent cards, with descendant status
  and activity reflected on the parent.
- Top-level pinned and inbox threads support persistent drag-and-drop ordering
  and `Alt+Up` / `Alt+Down` keyboard reordering.
- Two-line cards show thread status plus project, branch, working-tree state,
  pull-request state and number, and provider metadata.
- Git glyphs distinguish clean, untracked, uncommitted, and unmerged work;
  pull-request glyphs distinguish draft, open, merged, and closed states.
- Threads can be snoozed or settled into collapsed shelves, while configurable
  inactivity rules automatically collect older threads.
- Project filtering, BB's sidebar search, inline renaming, context actions, and
  keyboard-accessible metadata are built in.
- Multi-select supports bulk snooze, settle, and archive actions.
- Number shortcuts target top-level threads only, while deeper descendants
  remain available from thread-header controls.

## Install

```sh
bb plugin install git:https://github.com/wy3z/bb-plugin-thread-inbox.git@^0.2.1
```

Select **Thread Inbox (w/ Children)** under **Settings → Appearance → Sidebar**. Update a
stable installation with:

```sh
bb plugin update thread-inbox
```

## Behavior

- Top-level threads keep a stable user-defined order instead of jumping around
  as their status changes.
- Parents collapse by default; opening or searching for a child expands its
  parent automatically.
- Live descendant work prevents the parent from being parked.
- Snooze offers presets for 30 minutes, 2 hours, 1 day, or 1 week.
- Snoozed, settled, and inactive groups remain in compact collapsed shelves
  until opened.

## Settle keyboard shortcut

Press **Ctrl+Alt+S** (Mac: **Control+Option+S**, not Command) to
settle the currently active/open thread. This targets that exact thread, not a
hovered row, selected batch, or a child's parent, and works independently of
project/search filtering while this sidebar is mounted. The active card's Settle
button exposes the binding in its tooltip and `aria-keyshortcuts`.

Only an unarchived thread on the active lifecycle shelf can be settled (including
a quiet thread in the Inactive group). Running/working-draft threads, pending
interactions, workflows, background agents/commands, plan mode, and goals block
the action, including activity in descendants. Already snoozed/settled threads
are left alone. Unread finished output alone does not block settling.

The shortcut works while typing in BB's chat composer without submitting or
clearing the draft. This narrow exception recognizes BB's
`[data-promptbox-editor-content] .ProseMirror[contenteditable="true"]` surface;
if BB changes that markup, it safely falls back to ignoring the editor.
Other inputs, textareas, selects, contenteditable fields, file editors, terminals,
menus and modal dialogs remain protected, as do handled events, IME composition,
AltGraph, and held-key repeats. Duplicate requests are suppressed while a settle
is pending; failures show a toast and permit retry.

SDK 0.4.21 has no public shortcut contribution API, so this uses a cleaned-up,
bubbling document listener rather than BB-private APIs. The binding is absent
from BB core's current default registry (including web/desktop and Mac variants),
does not overlap this plugin's Alt+Up/Down or selection shortcuts, and avoids
common browser and text-editing chords. It is not configurable in BB's keyboard
settings. Custom BB bindings, browser extensions, OS shortcuts, or future defaults
may conflict; avoid assigning this combination elsewhere. Eligibility uses the
latest sidebar snapshot, not an atomic server-side activity check; subsequent
live work/attention brings parked threads back through the existing lifecycle.

MIT licensed; see [LICENSE](LICENSE).
