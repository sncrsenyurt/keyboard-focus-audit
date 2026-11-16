import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { checkIndicator } from "../src/check-indicator.js";
import type { Box } from "../src/walk-focus.js";
import { saveStepShot } from "../src/shot-step.js";
import { serveFixture } from "./serve-fixture.js";

const viewport = { width: 800, height: 600 };

describe("saveStepShot", { timeout: 30_000 }, () => {
  let close: (() => Promise<void>) | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    if (close) await close();
    close = undefined;
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function open(file: string): Promise<string> {
    const served = await serveFixture(file);
    close = served.close;
    return served.url;
  }

  async function scratch(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "kfa-"));
    dirs.push(dir);
    return dir;
  }

  it("draws a bright box in the shot and takes it off again", async () => {
    const url = await open("basic.html");
    const dir = await scratch();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport });
      await page.goto(url, { waitUntil: "load" });
      await page.locator("#send").focus();
      const before = await page.evaluate(() => document.activeElement?.id);
      const box = await focusedBox(page);
      const file = path.join(dir, "send.png");

      await saveStepShot(page, box, file);

      expect(before).toBe("send");
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("send");
      expect(await page.evaluate(() => document.getElementById("kfa-shot-box"))).toBeNull();

      const png = PNG.sync.read(await readFile(file));
      expect(png.width).toBe(viewport.width);
      expect(png.height).toBe(viewport.height);
      expect(isMagenta(pixel(png, box.x + 2, box.y + 2))).toBe(true);
      const midX = box.x + Math.round(box.width / 2);
      const midY = box.y + Math.round(box.height / 2);
      expect(isMagenta(pixel(png, midX, midY))).toBe(false);
    } finally {
      await browser.close();
    }
  });

  it("does not leave the box around for the ring check", async () => {
    const url = await open("focus-rings.html");
    const dir = await scratch();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport });
      await page.goto(url, { waitUntil: "load" });
      await page.locator("#no-ring").focus();
      const box = await focusedBox(page);
      const before = await checkIndicator(page, box);
      await saveStepShot(page, box, path.join(dir, "bare.png"));
      const after = await checkIndicator(page, box);

      expect(before?.visible).toBe(false);
      expect(after?.visible).toBe(false);
      expect(await page.evaluate(() => document.getElementById("kfa-shot-box"))).toBeNull();
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("no-ring");
    } finally {
      await browser.close();
    }
  });
});

async function focusedBox(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });
}

function pixel(png: PNG, x: number, y: number): [number, number, number] {
  const i = (png.width * y + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

function isMagenta(rgb: [number, number, number]): boolean {
  return rgb[0] > 220 && rgb[1] < 40 && rgb[2] > 220;
}
