# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build step, package manager, linter, or test suite. The project is vanilla HTML/CSS/JS with no dependencies.

- Run the game: open `index.html` directly in a browser, or serve the folder with a static server (e.g. `python3 -m http.server 8000`, then visit `http://localhost:8000`).
- Tests, lint, and build: none configured. Do not invent commands for them. If one is added later, document it here.

## Architecture

The whole game lives in three files that cooperate through the DOM:

- `index.html` defines the layout: a `<canvas id="board">` (300×600), a side panel with score/lines/level and a `<canvas id="next-canvas">` preview, the start overlay (`#start-overlay`, with `#start-btn` and a records panel), the game-over overlay (`#overlay`, which also holds the name form `#name-form`/`#name-input` inside `#gameover-extra` and a records panel), and the pause menu (`#pause-menu`, with a main panel `#pause-main` and a controls panel `#pause-controls`). It loads `game.js` at the end of `<body>`. The element IDs are the contract `game.js` depends on (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`, `pause-menu`, `pause-main`, `pause-controls`, `resume-btn`, `pause-restart-btn`, `controls-btn`, `controls-back-btn`, `start-level`, `start-overlay`, `start-btn`, `gameover-extra`, `name-form`, `name-input`, `skin-select`). `#skin-select` sits in the title bar next to `#theme-toggle`, so it is visible on the start overlay and the game-over overlay. Each records table is a `[data-records]` section, present in both the start and game-over overlays. Renaming any of them breaks the game silently at startup.
- `style.css` is presentation only. It does not affect game logic. Overlay buttons share the `.menu-btn` class; `.hidden` hides an overlay or an overlay panel.
- `game.js` holds all logic and state in top-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `startLevel`, `paused`, `gameOver`, `started`, `combo`, `bestComboThisGame`, `pendingScore`, `records`, `dropInterval`, `dropAccum`, `lastTime`, `animId`). There are no modules, classes, or build outputs.

### Board and pieces

- The board is a `ROWS × COLS` (20 × 10) array of numbers. `0` means empty; `1–8` is the color index into the active skin's palette (`SKINS[activeSkin].palette`; the Retro palette is `COLORS`), which also identifies the piece type (I, O, T, S, Z, J, L, and 8 = the `+` pentomino). The pentomino is only generated with probability `PENTOMINO_CHANCE` in `randomPiece()`; the other seven are picked uniformly from the remaining share.
- Each piece is a square matrix in `PIECES` (index = type). `current` is `{ type, shape, x, y }`. `x`/`y` is the top-left of the matrix in board coordinates, and cells with value `0` in the matrix are ignored.
- `collide(shape, x, y)` is the single source of truth for legality. Movement, rotation, drop, ghost projection, and spawn all go through it. Any new movement rule should use it too.

### Lifecycle

- At load, `game.js` does not call `init()`. It shows the start overlay (`#start-overlay`) over an empty board (`drawIdle()`), with `started = false`. The "Jugar" button (`startBtn`) calls `init()`, which sets `started = true`.
- `init()` resets all state (`level = startLevel`, `dropInterval` from the same formula as `clearLines()`), hides both `#overlay` and `#pause-menu`, then creates `next` and calls `spawn()`, which promotes `next` to `current` and generates a new `next`. `init()` is the start handler, and also the restart handler for both the game-over button and the pause menu's Reiniciar. It also hides `#start-overlay`, the name form and `#gameover-extra`. It cancels any running animation frame before starting a new one.
- Gravity runs in `loop(ts)` via `requestAnimationFrame`. It accumulates elapsed time in `dropAccum` and moves the piece down when it passes `dropInterval`.
- When a piece can't move down, `lockPiece()` runs in this order: `merge()` writes the piece into `board`, `clearLines()` removes full rows, updates score/level/speed and returns the number of rows cleared. `lockPiece()` then updates `combo`/`bestComboThisGame` from that count, and `spawn()` brings in the next piece.
- Hard drop (`hardDrop`) and soft drop (`softDrop`) also end in `lockPiece()` when they reach the bottom. Hard drop jumps to `ghostY()` first.
- `spawn()` ends the game (`endGame()`) if the new piece collides immediately on arrival.

### Input and pause

- All keyboard input is one `keydown` listener. It returns early while `started` is false (start screen) or while `e.target` is `nameInput`, so the start screen and the name field never act as game keys. `KeyP` and `Escape` toggle pause and are handled before the pause/game-over guard, so they work in both states. Other keys are ignored while `paused` or `gameOver`, which also keeps game keys inert while the menu is open. Keys whose target is `#skin-select` are ignored by the game (after the `started` and `nameInput` checks, and before `Escape` pauses), so the native select keeps its arrows, Space and Escape. The select blurs after a change or on Escape/Enter, the same way `#theme-toggle` blurs.
- `togglePause()` is the single entry point for pause and resume. Pausing cancels the animation frame and shows `#pause-menu` with its main panel (`showPauseMain()`). Resuming goes through `resumeGame()`, which hides the menu, blurs the focused control (so arrows do not change the level selector), sets a fresh `lastTime`, and calls `loop()`. Pause does not stop the game clock in `dropAccum`, so changes to pause behavior should keep `lastTime` and `dropAccum` consistent.
- Pause menu options: Reanudar (`togglePause()`), Reiniciar (`init()`), Ver controles (swaps to `#pause-controls`; Volver swaps back), and the Nivel inicial `<select>` (1–10), which sets `startLevel` and takes effect on the next `init()`, not on the current game. Every button blurs itself after click so Space does not re-activate it.
- The name form submits on button or Enter (its `submit` handler), and Enter inside the input does not reach the game keys.
- Rotation (`tryRotate`) tries the rotated shape at kick offsets `[0, -1, 1, -2, 2]` and keeps the first one that doesn't collide.

### Scoring and speed

- Line clears score `LINE_SCORES[n] × level`. Soft drop adds 1 per row. Hard drop adds 2 per row.
- `level = startLevel + floor(lines / 10)`, where `startLevel` (default 1) is chosen in the pause menu. `dropInterval = dropIntervalFor(level)` with `dropIntervalFor(l) = max(100, 1000 − (l − 1) × 90)` ms. `init()` applies the same formula with `level = startLevel`; `clearLines()` is the only place that changes these values during a game.
- Combo: `combo` counts consecutive piece locks that cleared at least one line, and resets to 0 on any lock without a clear. `bestComboThisGame` is its per-game maximum. Both reset in `init()`.

### Records (localStorage)

- Stored under the key `records` as JSON `{ entries: [{ name, score }], bestCombo, maxLines }`. `entries` holds the top 5 by score, sorted descending. `bestCombo` is the best streak across games, and `maxLines` is the highest `lines` total reached in one game (both saved at `endGame()`).
- `loadRecords()` runs `normalizeRecords()` and falls back to empty records on any error. `saveRecords()` swallows errors. The in-memory `records` still works when storage fails.
- `qualifyIndex(score)` returns the insertion slot in the top 5, or -1. Ties go below existing entries. A score of 0 never qualifies.
- The game-over name form appears only when the score qualifies. `pendingScore` holds that score. `displayEntries()` shows it as a highlighted placeholder row (`is-current`) until the name is submitted, and `insertRecord()` then stores it. The name is trimmed, capped at 12 characters, and defaults to "Anónimo".
- `renderRecords()` fills every `[data-records]` panel using DOM APIs (`textContent`, no `innerHTML`). The reset button in each panel clears `records` and saves.

### Rendering

- `draw()` redraws the whole board each frame: grid, locked blocks, ghost piece (drawn at alpha 0.2 at `ghostY()`), then the current piece. `drawNext()` is called from `spawn()` and from the repaints in `applyTheme()`/`applySkin()`, so the preview updates on spawn, on a theme or skin change, and never on the frame loop. Before the first game, `drawIdle()` paints the empty grid.
- `drawBlock(context, x, y, colorIndex, size, alpha)` sets `globalAlpha` and delegates to the active skin: `SKINS[activeSkin].draw(ctx, x, y, palette[colorIndex], size)`. Each skin draw function must leave the context state as it found it (use `save()`/`restore()` for `shadowBlur` or `globalAlpha` changes).
- Skins (`SKINS` in `game.js`): `retro` (flat blocks, `COLORS`), `neon` (translucent fill plus a glowing stroke via `shadowBlur`), `pastel` (rounded rects via `arcTo` with a soft top highlight), `pixel` (bevel plus a dark checker texture). Adding a skin means adding a `SKINS` entry, an `<option>` in `#skin-select`, a valid name in the head script, and, if it needs a different board, a `:root[data-skin="..."]` rule in `style.css`.
- `updateHUD()` must be called after any change to score, lines, or level. Keyboard handling calls it once at the end of the handler, but the gravity and lock paths rely on `clearLines()`/`softDrop()` to call it themselves.

### Theme

- Colors live in CSS variables: `:root` is dark (default) and `:root[data-theme="light"]` overrides them. A small inline script in `<head>` sets `data-theme` before paint (order: `localStorage['theme']`, then `prefers-color-scheme`, then dark).
- `#theme-toggle` sits next to the title and shows only SVG icons (moon/sun). `applyTheme()` in `game.js` sets the theme, reads `--grid` into `gridColor` via `readGridColor()` (the canvas grid is drawn in JS), saves the choice, and repaints with `draw()`/`drawNext()` so it also works while paused (or with `drawIdle()` before the first game).
- Skins: `#skin-select` (Retro, Neón, Pastel, Pixel art) sits after the theme toggle. The head script sets `data-skin` from `localStorage['skin']` (default `retro`, invalid values fall back to retro). `applySkin()` sets `data-skin`, reads `--grid` again, saves the choice under `skin`, and repaints like `applyTheme()` (including `drawIdle()` before the first game).
- The skin's board background and grid are CSS, not part of the `SKINS` table: `:root[data-skin="neon"]` sets `--surface` to black and a dark-blue `--grid`. That rule comes after both theme blocks, so neon is black in light mode too. Its select uses fixed colors so it stays readable there. Pastel and pixel keep the theme's surface and grid. Any skin's grid color is still read into `gridColor` in JS.

## Conventions and gotchas

- The UI text is in Spanish (`GAME OVER`, `PAUSA`, `CONTROLES`, `RÉCORDS`, `Jugar`, `Guardar`, `Puntuación`, `Reiniciar`, `Reanudar`, `Nivel inicial`, control labels). Keep new user-facing strings consistent with that. The README is in Spanish too.
- `game.js` runs with `'use strict'` and loads at the end of `<body>`, so DOM lookups at the top of the file are safe. The head script also validates the saved skin name against a hardcoded list, so update it when adding a skin. Moving the script tag into `<head>` without `defer` will break it.
- Canvas size is set in both HTML (`width`/`height` attributes) and in the constants (`COLS`, `ROWS`, `BLOCK`). Changing one requires changing the others (see the Personalización section of `README.md`).
- The `.gitignore` entry is `.DS_STORE`, but macOS creates `.DS_Store`. As written, the rule does not match those files.
