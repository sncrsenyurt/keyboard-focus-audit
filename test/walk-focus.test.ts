import { afterEach, describe, expect, it } from "vitest";
import { walkFocus, type FocusStep } from "../src/walk-focus.js";
import { serveFixture } from "./serve-fixture.js";

const viewport = { width: 800, height: 600 };

function ids(steps: FocusStep[]): string[] {
  return steps.map((s) => s.selector);
}

function names(steps: FocusStep[]): string[] {
  return steps.map((s) => s.name);
}

describe("walkFocus", { timeout: 30_000 }, () => {
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

  it("records the forward tab order and the reverse order", async () => {
    const url = await open("basic.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });

    expect(ids(result.forward.steps)).toEqual(["#home", "#email", "#send"]);
    expect(names(result.forward.steps)).toEqual(["Home", "Email", "Send"]);
    expect(result.forward.steps.map((s) => s.tag)).toEqual(["a", "input", "button"]);
    expect(result.forward.steps.map((s) => s.role)).toEqual(["link", "textbox", "button"]);
    expect(result.forward.stopped).toBe("body");

    expect(ids(result.backward.steps)).toEqual(["#send", "#email", "#home"]);
    expect(result.backward.stopped).toBe("body");

    for (const step of [...result.forward.steps, ...result.backward.steps]) {
      expect(step.visible).toBe(true);
      expect(step.inViewport).toBe(true);
      expect(step.box).not.toBeNull();
      expect(step.box!.width).toBeGreaterThan(0);
      expect(step.box!.height).toBeGreaterThan(0);
    }
  });

  it("follows tabindex, not the source order", async () => {
    const url = await open("tab-order.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(ids(result.forward.steps)).toEqual(["#first", "#second", "#third", "#fourth"]);
    expect(ids(result.backward.steps)).toEqual(["#fourth", "#third", "#second", "#first"]);
  });

  it("stops at max-steps on both walks", async () => {
    const url = await open("basic.html");
    const result = await walkFocus({ href: url, maxSteps: 2, viewport });
    expect(ids(result.forward.steps)).toEqual(["#home", "#email"]);
    expect(result.forward.stopped).toBe("max-steps");
    expect(ids(result.backward.steps)).toEqual(["#send", "#email"]);
    expect(result.backward.stopped).toBe("max-steps");
  });

  it("marks an offscreen stop as out of the viewport", async () => {
    const url = await open("offscreen.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(ids(result.forward.steps)).toEqual(["#visible", "#off", "#after"]);
    const off = result.forward.steps[1]!;
    expect(off.name).toBe("Offscreen");
    expect(off.inViewport).toBe(false);
    expect(result.forward.steps[0]!.inViewport).toBe(true);
    expect(result.forward.steps[2]!.inViewport).toBe(true);
  });

  it("returns no steps on a page with nothing to focus", async () => {
    const url = await open("empty.html");
    const result = await walkFocus({ href: url, maxSteps: 10, viewport });
    expect(result.forward.steps).toEqual([]);
    expect(result.forward.stopped).toBe("body");
    expect(result.backward.steps).toEqual([]);
    expect(result.backward.stopped).toBe("body");
  });

  it("skips tabindex -1 and display none", async () => {
    const url = await open("skip.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(ids(result.forward.steps)).toEqual(["#start", "#end"]);
    expect(names(result.forward.steps)).toEqual(["Start", "End"]);
  });

  it("still starts at the first tab stop when a field has autofocus", async () => {
    const url = await open("autofocus.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(ids(result.forward.steps)).toEqual(["#home", "#email", "#send"]);
    expect(ids(result.backward.steps)).toEqual(["#send", "#email", "#home"]);
  });

  it("numbers steps from zero", async () => {
    const url = await open("basic.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(result.forward.steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(result.backward.steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("stops when focus loops back to the first stop", async () => {
    const url = await open("trap.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(ids(result.forward.steps)).toEqual(["#one", "#two"]);
    expect(result.forward.stopped).toBe("loop");
    expect(ids(result.backward.steps)).toEqual(["#two", "#one"]);
    expect(result.backward.stopped).toBe("loop");
  });
});
