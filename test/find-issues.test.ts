import { afterEach, describe, expect, it } from "vitest";
import { findIssues, type FocusIssue } from "../src/find-issues.js";
import { walkFocus, type FocusStep, type FocusWalkResult } from "../src/walk-focus.js";
import { serveFixture } from "./serve-fixture.js";

const viewport = { width: 800, height: 600 };

function step(partial: Partial<FocusStep> & Pick<FocusStep, "index" | "selector">): FocusStep {
  return {
    tag: "a",
    role: "link",
    name: "",
    box: { x: 8, y: 8, width: 40, height: 16 },
    visible: true,
    inViewport: true,
    domIndex: 0,
    indicator: null,
    ...partial,
  };
}

function walk(
  forward: FocusWalkResult["forward"],
  backward: FocusWalkResult["backward"] = { stopped: "body", steps: [] },
): FocusWalkResult {
  return { href: "http://127.0.0.1/", forward, backward };
}

function kinds(issues: FocusIssue[]): string[] {
  return issues.map((issue) => `${issue.kind}:${issue.direction}:${issue.index}:${issue.selector}`);
}

describe("findIssues", () => {
  it("finds nothing on a clean walk", () => {
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [step({ index: 0, selector: "#home" }), step({ index: 1, selector: "#send", box: { x: 8, y: 40, width: 48, height: 16 } })],
      }),
    );
    expect(issues).toEqual([]);
  });

  it("flags a walk that loops or repeats a stop", () => {
    const looped = findIssues(
      walk({
        stopped: "loop",
        steps: [step({ index: 0, selector: "#one" }), step({ index: 1, selector: "#two" })],
      }),
    );
    expect(kinds(looped)).toEqual(["trap:forward:0:#one"]);

    const stuck = findIssues(
      walk({
        stopped: "max-steps",
        steps: [
          step({ index: 0, selector: "#home" }),
          step({ index: 1, selector: "#hold" }),
          step({ index: 2, selector: "#hold" }),
        ],
      }),
    );
    expect(kinds(stuck)).toEqual(["trap:forward:0:#home"]);
  });

  it("flags a stop that is hidden or has no box", () => {
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [
          step({ index: 0, selector: "#ok" }),
          step({ index: 1, selector: "#ghost", visible: false }),
          step({ index: 2, selector: "#zero", box: null, visible: true, inViewport: false }),
        ],
      }),
    );
    expect(kinds(issues)).toEqual(["hidden:forward:1:#ghost", "hidden:forward:2:#zero"]);
  });

  it("flags a visible stop that sits outside the viewport", () => {
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [
          step({ index: 0, selector: "#visible" }),
          step({
            index: 1,
            selector: "#off",
            box: { x: -10000, y: 0, width: 40, height: 16 },
            inViewport: false,
          }),
        ],
      }),
    );
    expect(kinds(issues)).toEqual(["offscreen:forward:1:#off"]);
  });

  it("does not also call a hidden stop offscreen", () => {
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [step({ index: 0, selector: "#ghost", visible: false, inViewport: false, box: null })],
      }),
    );
    expect(kinds(issues)).toEqual(["hidden:forward:0:#ghost"]);
  });
});


  it("flags a forward tab that moves up or left", () => {
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [
          step({ index: 0, selector: "#first", box: { x: 8, y: 80, width: 60, height: 16 }, domIndex: 5 }),
          step({ index: 1, selector: "#second", box: { x: 8, y: 40, width: 60, height: 16 }, domIndex: 3 }),
          step({ index: 2, selector: "#third", box: { x: 8, y: 8, width: 60, height: 16 }, domIndex: 2 }),
          step({ index: 3, selector: "#fourth", box: { x: 8, y: 120, width: 60, height: 16 }, domIndex: 6 }),
        ],
      }),
    );
    expect(kinds(issues)).toEqual(["back-jump:forward:1:#second", "back-jump:forward:2:#third"]);
  });

  it("uses document order when the boxes do not decide", () => {
    const box = { x: 8, y: 8, width: 40, height: 16 };
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [
          step({ index: 0, selector: "#late", box, domIndex: 8 }),
          step({ index: 1, selector: "#early", box, domIndex: 3 }),
        ],
      }),
    );
    expect(kinds(issues)).toEqual(["back-jump:forward:1:#early"]);
  });

  it("does not flag a back-jump on the backward walk", () => {
    const issues = findIssues(
      walk(
        { stopped: "body", steps: [] },
        {
          stopped: "body",
          steps: [
            step({ index: 0, selector: "#low", box: { x: 8, y: 80, width: 60, height: 16 }, domIndex: 4 }),
            step({ index: 1, selector: "#high", box: { x: 8, y: 8, width: 60, height: 16 }, domIndex: 2 }),
          ],
        },
      ),
    );
    expect(issues).toEqual([]);
  });

  it("does not also call an offscreen stop a back-jump", () => {
    const issues = findIssues(
      walk({
        stopped: "body",
        steps: [
          step({ index: 0, selector: "#visible", box: { x: 8, y: 8, width: 40, height: 16 }, domIndex: 2 }),
          step({
            index: 1,
            selector: "#off",
            box: { x: -10000, y: 0, width: 40, height: 16 },
            inViewport: false,
            domIndex: 3,
          }),
        ],
      }),
    );
    expect(kinds(issues)).toEqual(["offscreen:forward:1:#off"]);
  });

describe("findIssues on fixtures", { timeout: 30_000 }, () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function open(file: string): Promise<string> {
    const served = await serveFixture(file);
    close = served.close;
    return served.url;
  }

  it("calls the trap fixture a trap in both directions", async () => {
    const url = await open("trap.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(kinds(findIssues(result))).toEqual(["trap:forward:0:#one", "trap:backward:0:#two"]);
  });

  it("marks the offscreen stop on the offscreen fixture", async () => {
    const url = await open("offscreen.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(kinds(findIssues(result))).toEqual([
      "offscreen:forward:1:#off",
      "offscreen:backward:1:#off",
    ]);
  });

  it("finds nothing on the basic fixture", async () => {
    const url = await open("basic.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(findIssues(result)).toEqual([]);
  });

  it("flags the backwards jumps on the tab-order fixture", async () => {
    const url = await open("tab-order.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(kinds(findIssues(result))).toEqual([
      "back-jump:forward:1:#second",
      "back-jump:forward:2:#third",
    ]);
  });
});
