import type { ElementHandle, Page } from "playwright";
import { PNG } from "pngjs";
import type { Box } from "./walk-focus.js";

export type IndicatorCheck = {
  styleChanges: string[];
  changedPixels: number;
  totalPixels: number;
  visible: boolean;
};

type RingStyle = Record<string, string>;

const PAD = 6;
const CHANNEL_DELTA = 24;
const MIN_CHANGED_PIXELS = 6;
const MIN_CHANGED_SHARE = 0.004;

export async function checkIndicator(
  page: Page,
  box: Box,
): Promise<IndicatorCheck | null> {
  const handle = await page.evaluateHandle(() => {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  });
  const el = handle.asElement() as ElementHandle<HTMLElement> | null;
  if (!el) {
    await handle.dispose();
    return null;
  }

  try {
    const clip = padClip(box, page.viewportSize());
    if (!clip) return null;

    const focusedStyle = await el.evaluate(readRingStyle);
    const focusedShot = await page.screenshot({ clip, animations: "disabled" });

    await el.evaluate((node) => node.blur());
    const blurredStyle = await el.evaluate(readRingStyle);
    const blurredShot = await page.screenshot({ clip, animations: "disabled" });

    await el.evaluate((node) => node.focus({ preventScroll: true }));

    const styleChanges = diffStyles(blurredStyle, focusedStyle);
    const { changed, total } = countChangedPixels(blurredShot, focusedShot);
    const pixelsMoved = changed >= Math.max(MIN_CHANGED_PIXELS, total * MIN_CHANGED_SHARE);

    return {
      styleChanges,
      changedPixels: changed,
      totalPixels: total,
      visible: pixelsMoved,
    };
  } finally {
    await el.dispose();
  }
}

function padClip(
  box: Box,
  viewport: { width: number; height: number } | null,
): Box | null {
  const maxW = viewport?.width ?? Infinity;
  const maxH = viewport?.height ?? Infinity;
  const x = Math.max(0, box.x - PAD);
  const y = Math.max(0, box.y - PAD);
  const right = Math.min(maxW, box.x + box.width + PAD);
  const bottom = Math.min(maxH, box.y + box.height + PAD);
  if (right - x < 1 || bottom - y < 1) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function readRingStyle(node: HTMLElement): Record<string, string> {
  const s = getComputedStyle(node);
  const hasOutline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
  const hasBorder = s.borderStyle !== "none" && parseFloat(s.borderTopWidth) > 0;
  return {
    outline: hasOutline ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}` : "none",
    "box-shadow": s.boxShadow,
    border: hasBorder ? `${s.borderStyle} ${s.borderWidth} ${s.borderColor}` : "none",
    background: `${s.backgroundColor} ${s.backgroundImage}`,
    color: s.color,
    "text-decoration": s.textDecorationLine,
  };
}

export function diffStyles(before: RingStyle, after: RingStyle): string[] {
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}

export function countChangedPixels(
  a: Buffer,
  b: Buffer,
): { changed: number; total: number } {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (left.width * y + x) * 4;
      const j = (right.width * y + x) * 4;
      const delta = Math.max(
        Math.abs(left.data[i]! - right.data[j]!),
        Math.abs(left.data[i + 1]! - right.data[j + 1]!),
        Math.abs(left.data[i + 2]! - right.data[j + 2]!),
      );
      if (delta > CHANNEL_DELTA) changed++;
    }
  }
  return { changed, total: width * height };
}
