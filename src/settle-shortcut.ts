export const SETTLE_SHORTCUT = "Control+Alt+S";
export const SETTLE_SHORTCUT_LABEL = "Ctrl+Alt+S";

const PROTECTED_TARGET = [
  "input", "textarea", "select", '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]', '[role="combobox"]', '[role="spinbutton"]',
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
  return !targets.some((target) =>
    target instanceof Element && target.closest(PROTECTED_TARGET) !== null,
  );
}
