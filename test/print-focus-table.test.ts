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
          step({ index: 0, tag: "a", role: "link", name: "Home", selector: "#home" }),
          step({
            index: 1,
            tag: "input",
            role: "textbox",
            name: "Email",
            selector: "#email",
            box: { x: 8, y: 32, width: 160, height: 20 },
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
    expect(text).toMatch(/^#\s+tag\s+role\s+name\s+selector\s+box\s+vis\s+view$/m);
    expect(text).toContain("#home");
    expect(text).toContain("#email");
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
  });
});
