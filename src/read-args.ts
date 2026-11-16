const DEFAULT_MAX_STEPS = 50;
const DEFAULT_OUT_DIR = "focus-out";
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export type Viewport = {
  width: number;
  height: number;
};

export type FocusWalk = {
  href: string;
  maxSteps: number;
  outDir: string;
  viewport: Viewport;
  indicatorCheck: boolean;
  shots: boolean;
};

export type Parsed =
  | { kind: "empty" }
  | { kind: "help" }
  | { kind: "bad"; reason: string }
  | { kind: "walk"; walk: FocusWalk };

export function parseArgv(argv: string[]): Parsed {
  if (argv.length === 0) return { kind: "empty" };

  const pulled = pullFlags(argv);
  if (pulled.kind === "bad") return pulled;

  if (pulled.help) {
    if (
      pulled.positionals.length ||
      pulled.maxSteps !== undefined ||
      pulled.outDir !== undefined ||
      pulled.viewport !== undefined ||
      pulled.skipRing ||
      pulled.skipShots
    ) {
      return { kind: "bad", reason: "help takes no arguments" };
    }
    return { kind: "help" };
  }

  if (pulled.positionals.length !== 1) {
    return { kind: "bad", reason: "pass one url" };
  }

  const href = pulled.positionals[0]!;
  const checked = checkHref(href);
  if (checked.kind === "bad") return checked;

  return {
    kind: "walk",
    walk: {
      href,
      maxSteps: pulled.maxSteps ?? DEFAULT_MAX_STEPS,
      outDir: pulled.outDir ?? DEFAULT_OUT_DIR,
      viewport: pulled.viewport ?? { ...DEFAULT_VIEWPORT },
      indicatorCheck: !pulled.skipRing,
      shots: !pulled.skipShots,
    },
  };
}

export function usageText(): string {
  return [
    "usage: keyboard-focus-audit <url> [--max-steps n] [--out dir] [--viewport WxH] [--no-ring-check] [--no-shots]",
    "       keyboard-focus-audit help",
  ].join("\n");
}

function checkHref(href: string): { kind: "ok" } | { kind: "bad"; reason: string } {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: "bad", reason: "the url is not valid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "bad", reason: "the url has to be http or https" };
  }
  return { kind: "ok" };
}

function pullFlags(argv: string[]):
  | { kind: "bad"; reason: string }
  | {
      kind: "ok";
      help: boolean;
      positionals: string[];
      maxSteps: number | undefined;
      outDir: string | undefined;
      viewport: Viewport | undefined;
      skipRing: boolean;
      skipShots: boolean;
    } {
  const positionals: string[] = [];
  let help = false;
  let maxSteps: number | undefined;
  let outDir: string | undefined;
  let viewport: Viewport | undefined;
  let skipRing = false;
  let skipShots = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "help" || arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--no-ring-check") {
      skipRing = true;
      continue;
    }
    if (arg === "--no-shots") {
      skipShots = true;
      continue;
    }

    const steps = readFlag(arg, "--max-steps", argv, i);
    if (steps) {
      const parsed = parseMaxSteps(steps.value);
      if (parsed.kind === "bad") return parsed;
      maxSteps = parsed.value;
      i += steps.skip;
      continue;
    }

    const out = readFlag(arg, "--out", argv, i);
    if (out) {
      if (!out.value) return { kind: "bad", reason: "--out needs a directory" };
      outDir = out.value;
      i += out.skip;
      continue;
    }

    const view = readFlag(arg, "--viewport", argv, i);
    if (view) {
      const parsed = parseViewport(view.value);
      if (parsed.kind === "bad") return parsed;
      viewport = parsed.value;
      i += view.skip;
      continue;
    }

    if (arg.startsWith("-")) {
      return { kind: "bad", reason: `unknown flag: ${arg}` };
    }
    positionals.push(arg);
  }

  return { kind: "ok", help, positionals, maxSteps, outDir, viewport, skipRing, skipShots };
}

function readFlag(
  arg: string,
  name: string,
  argv: string[],
  i: number,
): { value: string; skip: number } | undefined {
  if (arg === name) {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) return { value: "", skip: 0 };
    return { value: next, skip: 1 };
  }
  if (arg.startsWith(`${name}=`)) {
    return { value: arg.slice(name.length + 1), skip: 0 };
  }
  return undefined;
}

function parseMaxSteps(value: string): { kind: "ok"; value: number } | { kind: "bad"; reason: string } {
  if (!value) return { kind: "bad", reason: "--max-steps needs a number" };
  if (!/^[1-9][0-9]*$/.test(value)) {
    return { kind: "bad", reason: "--max-steps has to be a positive integer" };
  }
  return { kind: "ok", value: Number(value) };
}

function parseViewport(value: string): { kind: "ok"; value: Viewport } | { kind: "bad"; reason: string } {
  const match = /^([1-9][0-9]*)x([1-9][0-9]*)$/.exec(value);
  if (!match) return { kind: "bad", reason: "--viewport has to look like 1280x720" };
  return {
    kind: "ok",
    value: { width: Number(match[1]), height: Number(match[2]) },
  };
}
