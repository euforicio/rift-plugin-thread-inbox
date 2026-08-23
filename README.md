# T3 Sidebar — WYEZ fork

A compact inbox-style sidebar for BB. Forked from
[Sawyer Hood's T3 Sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar).

## Changes in this fork

- Two-line cards: title and status, then `project · branch`.
- Correct greyscale provider icons with fallbacks for unknown providers.
- Subdued monospace branch names.
- Long metadata scrolls on hover and animates back on mouse leave.

## Install

```sh
bb plugin install git:https://github.com/wy3z/bb-plugin-t3sidebar.git@main
```

Select **T3 Sidebar** under **Settings → Appearance → Sidebar**.

Update later with:

```sh
bb plugin outdated
bb plugin update t3sidebar
```

## Behavior

- Threads stay in creation order instead of moving when their status changes.
- Pinned threads appear first.
- Snoozed threads return on time or when activity resumes.
- Settled threads move to a collapsed shelf.
- Active work and threads waiting for input cannot be parked.
- Child threads stay out of the flat list and are reached through header
  controls.

MIT licensed; see [LICENSE](LICENSE).
