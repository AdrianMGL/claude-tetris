# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build step, package manager, linter, or test suite. The project is vanilla HTML/CSS/JS with no dependencies.

- Run the game: open `index.html` directly in a browser, or serve the folder with a static server (e.g. `python3 -m http.server 8000`, then visit `http://localhost:8000`).
- Tests, lint, and build: none configured. Do not invent commands for them. If one is added later, document it here.

## Architecture

The whole game lives in three files that cooperate through the DOM:

- `index.html` defines the layout: a `<canvas id="board">` (300×600), a side panel with score/lines/level and a `<canvas id="next-canvas">` preview, and the pause/game-over overlay. It loads `game.js` at the end of `<body>`. The element IDs are the contract `game.js` depends on (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`). Renaming any of them breaks the game silently at startup.
- `style.css` is presentation only. It does not affect game logic.
- `game.js` holds all logic and state in top-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `lastTime`, `animId`). There are no modules, classes, or build outputs.

### Board and pieces

- The board is a `ROWS × COLS` (20 × 10) array of numbers. `0` means empty; `1–7` is the color index into `COLORS`, which also identifies the piece type (I, O, T, S, Z, J, L).
- Each piece is a square matrix in `PIECES` (index = type). `current` is `{ type, shape, x, y }`. `x`/`y` is the top-left of the matrix in board coordinates, and cells with value `0` in the matrix are ignored.
- `collide(shape, x, y)` is the single source of truth for legality. Movement, rotation, drop, ghost projection, and spawn all go through it. Any new movement rule should use it too.

### Lifecycle

- `init()` resets all state, then creates `next` and calls `spawn()`, which promotes `next` to `current` and generates a new `next`. `init()` is also the restart handler. It cancels any running animation frame before starting a new one.
- Gravity runs in `loop(ts)` via `requestAnimationFrame`. It accumulates elapsed time in `dropAccum` and moves the piece down when it passes `dropInterval`.
- When a piece can't move down, `lockPiece()` runs in this order: `merge()` writes the piece into `board`, `clearLines()` removes full rows and updates score/level/speed, then `spawn()` brings in the next piece.
- Hard drop (`hardDrop`) and soft drop (`softDrop`) also end in `lockPiece()` when they reach the bottom. Hard drop jumps to `ghostY()` first.
- `spawn()` ends the game (`endGame()`) if the new piece collides immediately on arrival.

### Input and pause

- All keyboard input is one `keydown` listener. `KeyP` toggles pause and is handled before the pause/game-over guard, so it works in both states. Other keys are ignored while `paused` or `gameOver`.
- Pause works by cancelling the animation frame. Resume calls `loop()` directly with a fresh `lastTime`. Pause does not stop the game clock in `dropAccum`, so changes to pause behavior should keep `lastTime` and `dropAccum` consistent.
- Rotation (`tryRotate`) tries the rotated shape at kick offsets `[0, -1, 1, -2, 2]` and keeps the first one that doesn't collide.

### Scoring and speed

- Line clears score `LINE_SCORES[n] × level`. Soft drop adds 1 per row. Hard drop adds 2 per row.
- `level = floor(lines / 10) + 1`. `dropInterval = max(100, 1000 − (level − 1) × 90)` ms. `clearLines()` is the only place that changes these values after `init()`.

### Rendering

- `draw()` redraws the whole board each frame: grid, locked blocks, ghost piece (drawn at alpha 0.2 at `ghostY()`), then the current piece. `drawNext()` is called only from `spawn()`, so the preview updates on spawn, not every frame.
- `updateHUD()` must be called after any change to score, lines, or level. Keyboard handling calls it once at the end of the handler, but the gravity and lock paths rely on `clearLines()`/`softDrop()` to call it themselves.

### Theme

- Colors live in CSS variables: `:root` is dark (default) and `:root[data-theme="light"]` overrides them. A small inline script in `<head>` sets `data-theme` before paint (order: `localStorage['theme']`, then `prefers-color-scheme`, then dark).
- `#theme-toggle` sits next to the title and shows only SVG icons (moon/sun). `applyTheme()` in `game.js` sets the theme, reads `--grid` into `gridColor` (the canvas grid is drawn in JS), saves the choice, and repaints with `draw()`/`drawNext()` so it also works while paused.

## Conventions and gotchas

- The UI text is in Spanish (`GAME OVER`, `PAUSA`, `Puntuación`, `Reiniciar`, control labels). Keep new user-facing strings consistent with that. The README is in Spanish too.
- `game.js` runs with `'use strict'` and loads at the end of `<body>`, so DOM lookups at the top of the file are safe. Moving the script tag into `<head>` without `defer` will break it.
- Canvas size is set in both HTML (`width`/`height` attributes) and in the constants (`COLS`, `ROWS`, `BLOCK`). Changing one requires changing the others (see the Personalización section of `README.md`).
- The `.gitignore` entry is `.DS_STORE`, but macOS creates `.DS_Store`. As written, the rule does not match those files.
