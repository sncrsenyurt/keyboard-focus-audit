# keyboard-focus-audit

I want one command that opens a url, walks it with Tab and Shift+Tab, and writes down the focus order.

```
keyboard-focus-audit https://example.com
```

`--max-steps` caps how far the walk goes. `--out` is the folder for the report. `--viewport` is the width and height, written as `1280x720`. `--no-ring-check` skips the focus ring check, which is the slow part. The command prints a compact table of the forward and backward focus order. It also flags focus traps, hidden or offscreen stops, tab moves that jump backwards in the page, and stops with no visible focus ring, and exits 2 when it finds any of those. For the ring check I blur each forward stop, compare its outline, shadow, border and colors, and diff a small screenshot around it with and without focus. A style change that leaves the pixels alone does not count. The html report with a screenshot of each step is also still ahead.

```
npm install
npx playwright install chromium
npm test
npm run build
node dist/keyboard-focus-audit.js https://example.com
```
