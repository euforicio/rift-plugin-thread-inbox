import { describe, expect, it } from "vitest";
import {
  mergeVisibleOrder,
  moveThreadId,
  moveThreadIdByOffset,
  orderThreads,
} from "./thread-order";

describe("thread ordering", () => {
  it("moves a row before or after another row", () => {
    expect(moveThreadId(["a", "b", "c"], "c", "a", "before")).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(moveThreadId(["a", "b", "c"], "a", "b", "after")).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("supports one-step keyboard movement without crossing a shelf edge", () => {
    expect(moveThreadIdByOffset(["a", "b", "c"], "b", -1)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveThreadIdByOffset(["a", "b", "c"], "a", -1)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps newly created rows above the saved order", () => {
    const threads = [{ id: "new" }, { id: "a" }, { id: "b" }];
    expect(orderThreads(threads, ["b", "a"])).toEqual([
      { id: "new" },
      { id: "b" },
      { id: "a" },
    ]);
  });

  it("reorders only visible rows inside a project-filtered global order", () => {
    expect(mergeVisibleOrder(["a", "hidden", "b", "c"], ["c", "a", "b"]))
      .toEqual(["c", "hidden", "a", "b"]);
  });
});
