import { describe, expect, it } from "vitest";
import { formatFocusTable } from "../src/print-focus-table.js";
import type { FocusStep, FocusWalkResult } from "../src/walk-focus.js";

function step(partial: Partial<FocusStep> & Pick<FocusStep, "index" | "tag" | "selector">): FocusStep {
  return {
    role: "",
    name: "",
    box: { x: 8, y: 8, width: 40, height: 16 },
    visible: true,
    inViewport: true,
    domIndex: 0,
    indicator: null,
    ...partial,
  };
}

describe("formatFocusTable", () => {
  it("prints both directions as a compact table", () => {
    const result: FocusWalkResult = {
      href: "http://127.0.0.1/",
      forward: {
        stopped: "body",
        steps: [
          step({
            index: 0,
            tag: "a",
            role: "link",
            name: "Home",
            selector: "#home",
            indicator: { styleChanges: ["outline"], changedPixels: 120, totalPixels: 900, visible: true },
          }),
          step({
            index: 1,
            tag: "input",
            role: "textbox",
            name: "Email",
            selector: "#email",
            box: { x: 8, y: 32, width: 160, height: 20 },
            indicator: { styleChanges: [], changedPixels: 0, totalPixels: 2000, visible: false },
          }),
        ],
      },
      backward: {
        stopped: "body",
        steps: [
          step({
            index: 0,
            tag: "input",
            role: "textbox",
            name: "Email",
            selector: "#email",
            box: { x: 8, y: 32, width: 160, height: 20 },
          }),
          step({ index: 1, tag: "a", role: "link", name: "Home", selector: "#home" }),
        ],
      },
    };

    const text = formatFocusTable(result);
    expect(text).toContain("forward  2  body");
    expect(text).toContain("backward  2  body");
    expect(text).toMatch(/^#\s+tag\s+role\s+name\s+selector\s+box\s+vis\s+view\s+ring$/m);
    expect(text).toContain("#home");
    expect(text).toContain("#email");
    expect(text).toMatch(/#home\s+8,8 40x16\s+yes\s+yes\s+yes$/m);
    expect(text).toMatch(/#email\s+8,32 160x20\s+yes\s+yes\s+no$/m);
    expect(text).toContain("8,8 40x16");
    expect(text).toContain("8,32 160x20");
    expect(text).toContain("link");
    expect(text).toContain("textbox");
  });

  it("prints (none) when a walk found no stops", () => {
    const result: FocusWalkResult = {
      href: "http://127.0.0.1/",
      forward: { stopped: "body", steps: [] },
      backward: { stopped: "body", steps: [] },
    };
    const text = formatFocusTable(result);
    expect(text).toContain("forward  0  body");
    expect(text).toContain("backward  0  body");
    expect(text).toContain("(none)");
  });

  it("marks missing role or name with a dash and flags vis and view", () => {
    const result: FocusWalkResult = {
      href: "http://127.0.0.1/",
      forward: {
        stopped: "max-steps",
        steps: [
          step({
            index: 0,
            tag: "div",
            selector: "div.item",
            role: "",
            name: "",
            visible: false,
            inViewport: false,
            box: null,
          }),
        ],
      },
      backward: { stopped: "loop", steps: [] },
    };
    const text = formatFocusTable(result);
    expect(text).toContain("forward  1  max-steps");
    expect(text).toContain("backward  0  loop");
    expect(text).toMatch(/div\s+-\s+-\s+div\.item\s+-\s+no\s+no/);
    expect(text).not.toContain("issues");
  });

  it("prints a compact issues table after the walks", () => {
    const result: FocusWalkResult = {
      href: "http://127.0.0.1/",
      forward: {
        stopped: "loop",
        steps: [
          step({ index: 0, tag: "button", role: "button", name: "One", selector: "#one" }),
          step({ index: 1, tag: "button", role: "button", name: "Two", selector: "#two" }),
        ],
      },
      backward: { stopped: "loop", steps: [] },
    };
    const text = formatFocusTable(result, [
      { kind: "trap", direction: "forward", index: 0, selector: "#one" },
      { kind: "offscreen", direction: "forward", index: 1, selector: "#off" },
      { kind: "back-jump", direction: "forward", index: 1, selector: "#second" },
    ]);
    expect(text).toContain("forward  2  loop");
    expect(text).toContain("issues  3");
    expect(text).toMatch(/^kind\s+dir\s+#\s+selector$/m);
    expect(text).toMatch(/trap\s+forward\s+0\s+#one/);
    expect(text).toMatch(/offscreen\s+forward\s+1\s+#off/);
    expect(text).toMatch(/back-jump\s+forward\s+1\s+#second/);
  });
});
