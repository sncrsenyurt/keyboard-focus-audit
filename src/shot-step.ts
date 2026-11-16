import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { Box } from "./walk-focus.js";

export async function saveStepShot(page: Page, box: Box | null, file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  if (box) await page.evaluate(paintBox, box);
  try {
    await page.screenshot({ path: file, animations: "disabled" });
  } finally {
    if (box) await page.evaluate(clearBox);
  }
}

function paintBox(box: Box): void {
  document.getElementById("kfa-shot-box")?.remove();
  const div = document.createElement("div");
  div.id = "kfa-shot-box";
  div.setAttribute("aria-hidden", "true");
  const s = div.style;
  s.position = "fixed";
  s.left = `${box.x}px`;
  s.top = `${box.y}px`;
  s.width = `${box.width}px`;
  s.height = `${box.height}px`;
  s.margin = "0";
  s.padding = "0";
  s.border = "4px solid #ff00ff";
  s.boxSizing = "border-box";
  s.background = "transparent";
  s.pointerEvents = "none";
  s.zIndex = "2147483647";
  document.documentElement.appendChild(div);
}

function clearBox(): void {
  document.getElementById("kfa-shot-box")?.remove();
}
