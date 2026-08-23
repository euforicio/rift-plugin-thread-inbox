# T3 Sidebar — WYEZ fork

[![CI](https://github.com/wy3z/bb-plugin-t3sidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/wy3z/bb-plugin-t3sidebar/actions/workflows/ci.yml)

A compact inbox-style sidebar for BB, forked from
[Sawyer Hood's T3 Sidebar](https://github.com/SawyerHood/bb-plugin-t3sidebar).

## Changes in this fork

- Child threads nest beneath collapsible parent cards.
- Child status and activity bubble up to the parent.
- Number shortcuts target top-level threads only.
- Two-line cards show title/status above `project · branch` metadata.
- Greyscale provider icons match BB's model picker.
- Long metadata reveals on hover or keyboard focus.

## Install

```sh
bb plugin install git:https://github.com/wy3z/bb-plugin-t3sidebar.git@main
```

Select **T3 Sidebar (Nested)** under **Settings → Appearance → Sidebar**.

Update later with:

```sh
bb plugin update t3sidebar-nested
```

## Behavior

- Top-level threads stay in creation order instead of moving with status.
- Parents collapse by default and show their direct child count.
- Opening or searching for a child expands its parent.
- Live descendant work prevents the parent from being parked.
- Deeper descendants remain accessible through thread-header controls.
- Snoozed and settled groups stay in collapsed shelves.

MIT licensed; see [LICENSE](LICENSE).
