'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#f06292', // + (pentominó) - rosa
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentominó)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// Probabilidad de que la siguiente pieza sea el pentominó en cruz (tipo 8)
const PENTOMINO_CHANCE = 0.1;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const themeToggle = document.getElementById('theme-toggle');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSel = document.getElementById('start-level');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsPanels = document.querySelectorAll('[data-records]');

// ---- Récords locales (localStorage, clave 'records') ----
const RECORDS_KEY = 'records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

function emptyRecords() {
  return { entries: [], bestCombo: 0, maxLines: 0 };
}

function normalizeRecords(data) {
  const out = emptyRecords();
  if (!data || typeof data !== 'object') return out;
  if (Array.isArray(data.entries)) {
    out.entries = data.entries
      .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS)
      .map(e => ({ name: e.name.slice(0, NAME_MAX), score: e.score }));
  }
  if (Number.isFinite(data.bestCombo)) out.bestCombo = data.bestCombo;
  if (Number.isFinite(data.maxLines)) out.maxLines = data.maxLines;
  return out;
}

function loadRecords() {
  try {
    return normalizeRecords(JSON.parse(localStorage.getItem(RECORDS_KEY)));
  } catch (e) {
    return emptyRecords();
  }
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}

let records = loadRecords();

// Posición que ocuparía la puntuación en el top 5, o -1 si no entra
function qualifyIndex(score) {
  if (!(score > 0)) return -1;
  const i = records.entries.findIndex(e => score > e.score);
  const idx = i === -1 ? records.entries.length : i;
  return idx < MAX_RECORDS ? idx : -1;
}

function insertRecord(name, score) {
  const idx = qualifyIndex(score);
  if (idx < 0) return;
  records.entries.splice(idx, 0, { name, score });
  records.entries = records.entries.slice(0, MAX_RECORDS);
  saveRecords();
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1; // nivel con el que empieza la siguiente partida (lo elige el menú de pausa)
let started = false;         // false hasta que se pulsa "Jugar"
let combo = 0;               // piezas consecutivas que han limpiado al menos una línea
let bestComboThisGame = 0;
let pendingScore = null;     // puntuación de la partida pendiente de guardar con nombre

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.random() < PENTOMINO_CHANCE ? 8 : Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalFor(level);
    updateHUD();
  }
  return cleared;
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  combo = cleared > 0 ? combo + 1 : 0;
  if (combo > bestComboThisGame) bestComboThisGame = combo;
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

let gridColor = '#22222e';

function applyTheme(theme, persist) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Tema oscuro' : 'Tema claro');
  gridColor = getComputedStyle(root).getPropertyValue('--grid').trim() || gridColor;
  if (persist) {
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }
  // Repinta: en pausa o game over el bucle no corre
  if (current && next) { draw(); drawNext(); } else { drawIdle(); }
}

// Tablero vacío (pantalla de inicio, antes de empezar a jugar)
function drawIdle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// Entradas a mostrar: el top 5 con la partida actual insertada (resaltada) si aún no tiene nombre
function displayEntries() {
  const list = records.entries.map(e => ({ name: e.name, score: e.score, pending: false }));
  const idx = pendingScore === null ? -1 : qualifyIndex(pendingScore);
  if (idx >= 0) list.splice(idx, 0, { name: '—', score: pendingScore, pending: true });
  return list.slice(0, MAX_RECORDS);
}

function renderRecords() {
  const list = displayEntries();
  recordsPanels.forEach(panel => {
    const ol = panel.querySelector('.records-list');
    ol.replaceChildren(...list.map(entry => {
      const li = document.createElement('li');
      li.className = 'record-row' + (entry.pending ? ' is-current' : '');
      const name = document.createElement('span');
      name.className = 'record-name';
      name.textContent = entry.name;
      const score = document.createElement('span');
      score.className = 'record-score';
      score.textContent = entry.score.toLocaleString();
      li.append(name, score);
      return li;
    }));
    panel.querySelector('.records-empty').hidden = list.length > 0;
    panel.querySelector('.records-stats').textContent =
      `Mejor combo: ${records.bestCombo} · Máx. líneas: ${records.maxLines}`;
  });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records.bestCombo = Math.max(records.bestCombo, bestComboThisGame);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pendingScore = qualifyIndex(score) >= 0 ? score : null;
  nameForm.classList.toggle('hidden', pendingScore === null);
  gameoverExtra.classList.remove('hidden');
  renderRecords();
  overlay.classList.remove('hidden');
  if (pendingScore !== null) {
    nameInput.value = '';
    nameInput.focus();
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    resumeGame();
  } else {
    cancelAnimationFrame(animId);
    showPauseMain();
    pauseMenu.classList.remove('hidden');
  }
}

function resumeGame() {
  pauseMenu.classList.add('hidden');
  // Quita el foco de cualquier control del menú: si queda el selector enfocado,
  // las flechas cambiarían el nivel en vez de mover la pieza
  if (document.activeElement) document.activeElement.blur();
  lastTime = performance.now();
  loop(lastTime);
}

function showPauseMain() {
  pauseMain.classList.remove('hidden');
  pauseControls.classList.add('hidden');
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      // si el spawn terminó la partida, no seguir dibujando ni reprogramar
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  // Lee el selector aquí: el navegador puede restaurar su valor al recargar sin disparar 'change'
  startLevel = Number(startLevelSel.value);
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  bestComboThisGame = 0;
  pendingScore = null;
  started = true;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  startOverlay.classList.add('hidden');
  nameForm.classList.add('hidden');
  gameoverExtra.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  themeToggle.blur(); // evita que Space active el botón en vez de la caída dura
});

// Sigue el tema del sistema mientras no haya una elección manual
const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
lightQuery.addEventListener('change', e => {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (err) {}
  if (!saved) applyTheme(e.matches ? 'light' : 'dark', false);
});

document.addEventListener('keydown', e => {
  // Sin partida iniciada, o escribiendo el nombre, las teclas no son de juego
  if (!started || e.target === nameInput) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  restartBtn.blur();
  init();
});

// Menú de pausa: cada botón quita el foco tras el clic para que Space no lo reactive
resumeBtn.addEventListener('click', () => {
  resumeBtn.blur();
  togglePause();
});
pauseRestartBtn.addEventListener('click', () => {
  pauseRestartBtn.blur();
  init();
});
controlsBtn.addEventListener('click', () => {
  controlsBtn.blur();
  pauseMain.classList.add('hidden');
  pauseControls.classList.remove('hidden');
});
controlsBackBtn.addEventListener('click', () => {
  controlsBackBtn.blur();
  showPauseMain();
});
startLevelSel.addEventListener('change', () => {
  startLevel = Number(startLevelSel.value);
  startLevelSel.blur();
});

startBtn.addEventListener('click', () => {
  startBtn.blur();
  init();
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (pendingScore === null) return;
  insertRecord(nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo', pendingScore);
  pendingScore = null;
  nameForm.classList.add('hidden');
  renderRecords();
});

recordsPanels.forEach(panel => {
  panel.querySelector('.reset-records').addEventListener('click', () => {
    records = emptyRecords();
    saveRecords();
    pendingScore = null;
    nameForm.classList.add('hidden');
    renderRecords();
  });
});

// No se llama a init() aquí: la partida empieza al pulsar "Jugar"
board = createBoard();
renderRecords();
applyTheme(document.documentElement.dataset.theme || 'dark', false);
