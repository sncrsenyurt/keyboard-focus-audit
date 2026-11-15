import { afterEach, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { countChangedPixels, diffStyles } from "../src/check-indicator.js";
import { findIssues } from "../src/find-issues.js";
import { walkFocus } from "../src/walk-focus.js";
import { serveFixture } from "./serve-fixture.js";

const viewport = { width: 800, height: 600 };

function solid(width: number, height: number, rgb: [number, number, number], marks: Array<[number, number]> = []): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  for (const [x, y] of marks) {
    const i = (y * width + x) * 4;
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
  }
  return PNG.sync.write(png);
}

describe("countChangedPixels", () => {
  it("counts only pixels that moved past the noise floor", () => {
    const base = solid(10, 10, [200, 200, 200]);
    const close = solid(10, 10, [210, 205, 195]);
    const marked = solid(10, 10, [200, 200, 200], [[0, 0], [5, 5], [9, 9]]);

    expect(countChangedPixels(base, base)).toEqual({ changed: 0, total: 100 });
    expect(countChangedPixels(base, close)).toEqual({ changed: 0, total: 100 });
    expect(countChangedPixels(base, marked)).toEqual({ changed: 3, total: 100 });
  });
});

describe("diffStyles", () => {
  it("lists the properties that differ", () => {
    const before = { outline: "none", "box-shadow": "none", color: "rgb(0, 0, 0)" };
    const after = { outline: "solid 2px rgb(0, 0, 255) 0px", "box-shadow": "none", color: "rgb(0, 0, 0)" };
    expect(diffStyles(before, after)).toEqual(["outline"]);
    expect(diffStyles(before, before)).toEqual([]);
  });
});

describe("focus ring check on a page", { timeout: 30_000 }, () => {
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

  it("tells real rings from missing or invisible ones", async () => {
    const url = await open("focus-rings.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    const rings = Object.fromEntries(
      result.forward.steps.map((s) => [s.selector, s.indicator?.visible]),
    );

    expect(rings).toEqual({
      "#plain-ring": true,
      "#no-ring": false,
      "#shadow-ring": true,
      "#visible-only": true,
      "#tint": true,
      "#ghost": false,
      "#name": false,
    });

    const ghost = result.forward.steps.find((s) => s.selector === "#ghost")!;
    expect(ghost.indicator?.styleChanges).toContain("box-shadow");
    expect(ghost.indicator?.changedPixels).toBe(0);

    expect(result.backward.steps.every((s) => s.indicator === null)).toBe(true);
  });

  it("puts each missing ring in the issue list", async () => {
    const url = await open("focus-rings.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    expect(findIssues(result).map((i) => `${i.kind}:${i.selector}`)).toEqual([
      "no-ring:#no-ring",
      "no-ring:#ghost",
      "no-ring:#name",
    ]);
  });

  it("leaves the focus order alone while checking", async () => {
    const url = await open("focus-rings.html");
    const checked = await walkFocus({ href: url, maxSteps: 20, viewport });
    const skipped = await walkFocus({ href: url, maxSteps: 20, viewport, indicatorCheck: false });

    expect(checked.forward.steps.map((s) => s.selector)).toEqual(
      skipped.forward.steps.map((s) => s.selector),
    );
    expect(skipped.forward.steps.every((s) => s.indicator === null)).toBe(true);
  });

  it("skips the check for stops it cannot see", async () => {
    const url = await open("offscreen.html");
    const result = await walkFocus({ href: url, maxSteps: 20, viewport });
    const off = result.forward.steps.find((s) => s.selector === "#off")!;
    expect(off.indicator).toBeNull();
  });
});
