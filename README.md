# Thread Inbox

[![CI](https://github.com/wy3z/bb-plugin-t3sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/wy3z/bb-plugin-t3sidebar/actions/workflows/ci.yml)

A compact inbox-style sidebar for BB with nested child threads, persistent
ordering, parking controls, provider marks, and Git metadata. Thread Inbox is
a standalone evolution of [T3 Sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar)
by [Sawyer Hood](https://github.com/SawyerHood).

## Features

- Child threads nest beneath collapsible parent cards.
- Child status and activity bubble up to the parent.
- Number shortcuts target top-level threads only.
- Two-line cards show title/status above `project · branch` metadata.
- Greyscale provider icons match BB's model picker.
- Long metadata reveals on hover or keyboard focus.

## Install

No semver release tag has been published yet. When `0.2.1` is released, install
compatible stable releases rather than tracking `main`:

```sh
bb plugin install git:https://github.com/wy3z/bb-plugin-t3sidebar.git@^0.2.1
```

Select **Thread Inbox** under **Settings → Appearance → Sidebar**. Update a
stable installation with:

```sh
bb plugin update thread-inbox
```

## Behavior

- Top-level threads stay in creation order instead of moving with status.
- Parents collapse by default and show their direct child count.
- Opening or searching for a child expands its parent.
- Live descendant work prevents the parent from being parked.
- Deeper descendants remain accessible through thread-header controls.
- Top-level pinned and inbox threads support persistent drag-and-drop ordering and `Alt+Up` / `Alt+Down` keyboard reordering.
- Snooze offers compact presets for 30 minutes, 2 hours, 1 day, or 1 week.
- Snoozed and settled groups stay in collapsed shelves.

MIT licensed; see [LICENSE](LICENSE).
