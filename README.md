# keyboard-focus-audit

I want one command that opens a url, walks it with Tab and Shift+Tab, and writes down the focus order.

```
keyboard-focus-audit https://example.com
```

`--max-steps` caps how far the walk goes. `--out` is the folder for the report. `--viewport` is the width and height, written as `1280x720`. The walk should catch a trap (focus that cannot leave with the keyboard) and a focused element with no visible indicator. The report should be a self-contained html file with a screenshot of each focus step. None of the walk or the report is written yet.

```
npm install
npm test
npm run build
node dist/keyboard-focus-audit.js help
```
