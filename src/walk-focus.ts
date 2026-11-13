import { chromium, type Page } from "playwright";
import type { Viewport } from "./read-args.js";

export type Box = {
  width: number;
  height: number;
  x: number;
  y: number;
};

export type FocusStep = {
  index: number;
  tag: string;
  role: string;
  name: string;
  selector: string;
  box: Box | null;
  visible: boolean;
  inViewport: boolean;
};

export type StopReason = "loop" | "body" | "max-steps";

export type DirectionWalk = {
  steps: FocusStep[];
  stopped: StopReason;
};

export type FocusWalkResult = {
  href: string;
  forward: DirectionWalk;
  backward: DirectionWalk;
};

type Captured = Omit<FocusStep, "index"> & { key: number };

const DRAIN_CAP = 1000;

export async function walkFocus(opts: {
  href: string;
  maxSteps: number;
  viewport: Viewport;
}): Promise<FocusWalkResult> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: opts.viewport });
    await page.goto(opts.href, { waitUntil: "load" });
    const forward = await startWalk(page, "Tab", opts.maxSteps);

    await page.goto(opts.href, { waitUntil: "load" });
    const backward = await startWalk(page, "Shift+Tab", opts.maxSteps);

    return { href: opts.href, forward, backward };
  } finally {
    await browser.close();
  }
}

async function startWalk(
  page: Page,
  key: "Tab" | "Shift+Tab",
  maxSteps: number,
): Promise<DirectionWalk> {
  const drain = await drainToBoundary(page, key);
  return walkDirection(page, key, maxSteps, drain !== "body");
}

async function drainToBoundary(
  page: Page,
  key: "Tab" | "Shift+Tab",
): Promise<"body" | "loop" | "cap"> {
  const start = await page.evaluate(captureFocus);
  if (!start) return "body";

  const seen = new Set<number>([start.key]);
  for (let i = 0; i < DRAIN_CAP; i++) {
    await page.keyboard.press(key);
    const now = await page.evaluate(captureFocus);
    if (!now) return "body";
    if (seen.has(now.key)) return "loop";
    seen.add(now.key);
  }
  return "cap";
}

async function walkDirection(
  page: Page,
  key: "Tab" | "Shift+Tab",
  maxSteps: number,
  alreadyOnStep = false,
): Promise<DirectionWalk> {
  const steps: FocusStep[] = [];
  let firstKey: number | null = null;

  for (let i = 0; i < maxSteps; i++) {
    if (!(alreadyOnStep && i === 0)) {
      await page.keyboard.press(key);
    }
    const captured = await page.evaluate(captureFocus);
    if (!captured) return { steps, stopped: "body" };
    if (firstKey === null) firstKey = captured.key;
    else if (captured.key === firstKey) return { steps, stopped: "loop" };
    steps.push({
      index: steps.length,
      tag: captured.tag,
      role: captured.role,
      name: captured.name,
      selector: captured.selector,
      box: captured.box,
      visible: captured.visible,
      inViewport: captured.inViewport,
    });
  }

  return { steps, stopped: "max-steps" };
}

function captureFocus(): Captured | null {
  function deepActive(): Element | null {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  function elementKey(el: Element): number {
    const w = window as unknown as {
      __kfaKeys?: { n: number; map: WeakMap<Element, number> };
    };
    if (!w.__kfaKeys) w.__kfaKeys = { n: 0, map: new WeakMap() };
    const found = w.__kfaKeys.map.get(el);
    if (found !== undefined) return found;
    const next = ++w.__kfaKeys.n;
    w.__kfaKeys.map.set(el, next);
    return next;
  }

  function squeeze(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  function labelFor(el: HTMLElement): string {
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return squeeze(lab.textContent ?? "");
    }
    const parent = el.closest("label");
    if (parent) return squeeze(parent.textContent ?? "");
    return "";
  }

  function accessibleName(el: Element): string {
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const text = labelled
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      const squeezed = squeeze(text);
      if (squeezed) return squeezed;
    }
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return squeeze(aria);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      const fromLabel = labelFor(el);
      if (fromLabel) return fromLabel;
    }
    if (el instanceof HTMLImageElement && el.alt) return squeeze(el.alt);
    const role = el.getAttribute("role");
    if (
      el instanceof HTMLElement &&
      (el.tagName === "BUTTON" ||
        el.tagName === "A" ||
        el.tagName === "SUMMARY" ||
        role === "button" ||
        role === "link")
    ) {
      const text = squeeze(el.innerText || el.textContent || "");
      if (text) return text;
    }
    if (el instanceof HTMLInputElement) {
      if ((el.type === "submit" || el.type === "button" || el.type === "reset") && el.value) {
        return squeeze(el.value);
      }
      if (el.placeholder) return squeeze(el.placeholder);
    }
    const title = el.getAttribute("title");
    if (title) return squeeze(title);
    return "";
  }

  function roleOf(el: Element): string {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "img") return "img";
    if (tag === "input") {
      const type = (el as HTMLInputElement).type;
      switch (type) {
        case "text":
        case "email":
        case "password":
        case "tel":
        case "url":
        case "date":
        case "time":
        case "month":
        case "week":
        case "datetime-local":
        case "color":
          return "textbox";
        case "search":
          return "searchbox";
        case "number":
          return "spinbutton";
        case "checkbox":
          return "checkbox";
        case "radio":
          return "radio";
        case "button":
        case "submit":
        case "reset":
        case "file":
        case "image":
          return "button";
        case "range":
          return "slider";
        default:
          return "textbox";
      }
    }
    return "";
  }

  function attrSelector(tag: string, attr: string, value: string): string {
    const safe = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `${tag}[${attr}="${safe}"]`;
  }

  function unique(sel: string): boolean {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function stableSelector(el: Element): string {
    const tag = el.tagName.toLowerCase();
    if (el.id && unique(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
    const name = el.getAttribute("name");
    if (name) {
      const sel = attrSelector(tag, "name", name);
      if (unique(sel)) return sel;
    }
    const aria = el.getAttribute("aria-label");
    if (aria) {
      const sel = attrSelector(tag, "aria-label", aria);
      if (unique(sel)) return sel;
    }
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.documentElement) {
      if (cur.id && unique(`#${CSS.escape(cur.id)}`)) {
        parts.unshift(`#${CSS.escape(cur.id)}`);
        break;
      }
      const parent: Element | null = cur.parentElement;
      let part = cur.tagName.toLowerCase();
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === cur!.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = parent;
    }
    return parts.join(" > ");
  }

  function boxOf(el: Element): Box | null {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function isVisible(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function isInViewport(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  const el = deepActive();
  if (!el || el === document.body || el === document.documentElement) return null;

  return {
    key: elementKey(el),
    tag: el.tagName.toLowerCase(),
    role: roleOf(el),
    name: accessibleName(el),
    selector: stableSelector(el),
    box: boxOf(el),
    visible: isVisible(el),
    inViewport: isInViewport(el),
  };
}
