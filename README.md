# Thread Inbox

[![CI](https://github.com/wy3z/bb-plugin-t3sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/wy3z/bb-plugin-t3sidebar/actions/workflows/ci.yml)

A compact inbox-style sidebar for BB with nested child threads, persistent
ordering, parking controls, provider marks, and Git metadata. Thread Inbox is
a standalone evolution of [T3 Sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
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
bb plugin install git:https://github.com/wy3z/bb-plugin-t3sidebar.git@^0.2.1
```

Select **Thread Inbox** under **Settings → Appearance → Sidebar**. Update a
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

MIT licensed; see [LICENSE](LICENSE).
