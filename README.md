# keyboard-focus-audit

I want one command that opens a url, walks it with Tab and Shift+Tab, and writes down the focus order.

```
keyboard-focus-audit https://example.com
```

`--max-steps` caps how far the walk goes. `--out` is the folder I write to, `focus-out` by default. `--viewport` is the width and height, written as `1280x720`. `--no-ring-check` skips the focus ring check, which is the slow part. `--no-shots` skips the screenshots. `--report` is the html file, next to the record if I leave it out, and `--no-report` skips that file. The command prints a compact table of the forward and backward focus order, then a one-line count of each problem and the paths it wrote. It flags focus traps, hidden or offscreen stops, tab moves that jump backwards in the page, and stops with no visible focus ring. I exit 0 when nothing is wrong, 2 when any of those turn up, and 1 on a bad invocation or a runtime failure.

For every step I save a screenshot under `steps/`, `forward-001.png` and so on, with a bright box around the focused element. The box comes off before the next tab so it does not change focus or the ring check. `focus-record.json` has the tool version, the url, the viewport, the time, both walks, the issues, and the counts. `focus-report.html` is the same walk as one page: the url, the time, the counts, then each step with its shot and whatever is wrong with it. The css and the shots are in the file, so it opens on its own. With `--no-shots` the page is still the full list, just without the pictures. For the ring check I blur each forward stop, compare its outline, shadow, border and colors, and diff a small screenshot around it with and without focus. A style change that leaves the pixels alone does not count.

```
npm install
npx playwright install chromium
npm test
npm run build
node dist/keyboard-focus-audit.js https://example.com
```
