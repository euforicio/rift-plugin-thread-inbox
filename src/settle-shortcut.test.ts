// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { matchesSettleShortcut } from "./settle-shortcut";

const binding = { key: "s", ctrlKey: true, altKey: true, shiftKey: false, bubbles: true, cancelable: true };
afterEach(() => { document.body.replaceChildren(); });

function matches(target: Element, overrides: KeyboardEventInit = {}) {
  let result = false;
  const handler = (event: KeyboardEvent) => { result = matchesSettleShortcut(event); };
  document.addEventListener("keydown", handler);
  target.dispatchEvent(new KeyboardEvent("keydown", { ...binding, ...overrides }));
  document.removeEventListener("keydown", handler);
  return result;
}

describe("settle shortcut guards", () => {
  it("accepts only the exact chord, including uppercase key values", () => {
    expect(matches(document.body)).toBe(true);
    expect(matches(document.body, { key: "S" })).toBe(true);
    for (const override of [
      { ctrlKey: false }, { altKey: false }, { shiftKey: true }, { metaKey: true },
      { key: "x" }, { repeat: true }, { isComposing: true }, { keyCode: 229 },
    ]) expect(matches(document.body, override)).toBe(false);
  });

  it("ignores prevented events and AltGraph", () => {
    const event = new KeyboardEvent("keydown", binding);
    event.preventDefault();
    expect(matchesSettleShortcut(event)).toBe(false);
    const altGraph = new KeyboardEvent("keydown", { ...binding, modifierAltGraph: true });
    expect(matchesSettleShortcut(altGraph)).toBe(false);
  });

  it.each([
    '<input>', '<textarea></textarea>', '<select></select>',
    '<div contenteditable="true"><span></span></div>',
    '<div contenteditable=""><span></span></div>',
    '<div contenteditable="plaintext-only"><span></span></div>',
    '<div role="textbox"><span></span></div>',
    '<div class="monaco-editor"><span></span></div>',
    '<div class="cm-editor"><span></span></div>',
    '<div class="xterm"><span></span></div>',
    '<div role="menu"><span></span></div>',
  ])("ignores protected target %s", (html) => {
    document.body.innerHTML = html;
    expect(matches(document.querySelector("span") ?? document.body.firstElementChild!)).toBe(false);
  });

  it("allows BB's composer and its nested text without changing the draft", () => {
    document.body.innerHTML = '<div data-promptbox-editor-content><div class="ProseMirror" contenteditable="true" role="textbox" tabindex="0"><p>Keep this draft</p></div></div>';
    const editor = document.querySelector<HTMLElement>(".ProseMirror")!;
    editor.focus();
    expect(matches(editor)).toBe(true);
    expect(matches(editor.querySelector("p")!)).toBe(true);
    expect(editor.textContent).toBe("Keep this draft");
    expect(matches(editor, { isComposing: true })).toBe(false);
    expect(matches(editor, { modifierAltGraph: true })).toBe(false);
    document.body.firstElementChild!.setAttribute("role", "dialog");
    expect(matches(editor)).toBe(false);
  });

  it("does not exempt arbitrary editors or inputs inside the composer wrapper", () => {
    document.body.innerHTML = '<div data-promptbox-editor-content><div contenteditable="true"></div><input></div>';
    expect(matches(document.querySelector("[contenteditable]")!)).toBe(false);
    expect(matches(document.querySelector("input")!)).toBe(false);
  });

  it("guards focus even when the event target is document/body", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    expect(matches(document.body)).toBe(false);
  });

  it("guards shadow DOM editors via the composed path", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    root.append(input);
    expect(matches(input, { composed: true })).toBe(false);
  });

  it("does not act behind a modal", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(matches(document.body)).toBe(false);
  });
});
