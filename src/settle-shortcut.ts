export const SETTLE_SHORTCUT = "Control+Alt+S";
export const SETTLE_SHORTCUT_LABEL = "Ctrl+Alt+S";

const PROTECTED_TARGET = [
  "input", "textarea", "select", '[role="combobox"]', '[role="spinbutton"]',
  ".monaco-editor", ".cm-editor", ".xterm", '[role="dialog"]', '[role="menu"]',
].join(",");

export function matchesSettleShortcut(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
    !event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey ||
    event.getModifierState("AltGraph") || event.key.toLowerCase() !== "s"
  ) return false;
  if (document.querySelector('[aria-modal="true"], dialog[open]')) return false;
  const targets = [...event.composedPath(), document.activeElement];
  return !targets.some((target) => {
    if (!(target instanceof Element)) return false;
    if (target.closest(PROTECTED_TARGET)) return true;
    const editable = target.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"]');
    return editable !== null && !editable.matches('[data-promptbox-editor-content] .ProseMirror[contenteditable="true"]');
  });
}
