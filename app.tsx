// bb-plugin-t3sidebar — a stable inbox-style replacement for BB's sidebar
// thread list, with child threads nested under the parent that spawned them.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadInbox } from "./src/ThreadInbox";
import { ParentChip } from "./src/ParentChip";
import { SubagentsChip } from "./src/SubagentsChip";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "inbox",
    title: "T3 Sidebar",
    description:
      "Stable inbox cards, newest first, with collapsible child threads.",
    component: ThreadInbox,
  });

  app.slots.experimental_threadHeaderAction({
    id: "parent",
    title: "Parent thread",
    component: ParentChip,
  });

  app.slots.experimental_threadHeaderAction({
    id: "children",
    title: "Child threads",
    component: SubagentsChip,
  });
});
