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
const skinSelect = document.getElementById('skin-select');
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

// Cada función de dibujo recibe la celda (x, y) en unidades de bloque.
// drawBlock() ya ha fijado globalAlpha antes de llamarlas.
function drawFlatBlock(c, x, y, color, size) {
  c.fillStyle = color;
  c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function drawNeonBlock(c, x, y, color, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  // relleno muy tenue
  c.save();
  c.globalAlpha *= 0.18;
  c.fillStyle = color;
  c.fillRect(px, py, s, s);
  c.restore();
  // borde luminoso con resplandor
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.shadowColor = color;
  c.shadowBlur = size * 0.45;
  c.strokeRect(px + 2, py + 2, s - 4, s - 4);
  c.restore();
}

function roundedRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawPastelBlock(c, x, y, color, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  roundedRectPath(c, px, py, s, s, 6);
  c.fillStyle = color;
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.08)';
  c.lineWidth = 1;
  c.stroke();
  // brillo suave en la parte superior
  roundedRectPath(c, px + 3, py + 3, s - 6, (s - 6) * 0.35, 3);
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fill();
}

function drawPixelBlock(c, x, y, color, size) {
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  c.fillStyle = color;
  c.fillRect(px, py, s, s);
  // textura en damero con tono oscuro (zona interior, sin tocar el bisel)
  const q = Math.max(3, Math.round(size / 6));
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let j = 3; j < s - 3; j += q)
    for (let i = 3; i < s - 3; i += q)
      if (((i - 3) / q + (j - 3) / q) % 2 === 0)
        c.fillRect(px + i, py + j, Math.min(q, s - 3 - i), Math.min(q, s - 3 - j));
  // bisel: claro arriba-izquierda, oscuro abajo-derecha
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(px, py, s, 3);
  c.fillRect(px, py, 3, s);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(px, py + s - 3, s, 3);
  c.fillRect(px + s - 3, py, 3, s);
}

// Skins: paleta de colores por tipo de pieza (índice 1-8) y función de dibujo.
// El fondo del tablero y la rejilla están en style.css (variables --surface y --grid).
const SKINS = {
  retro: {
    palette: COLORS,
    draw: drawFlatBlock,
  },
  neon: {
    palette: [null, '#00f0ff', '#ffe600', '#d400ff', '#39ff14', '#ff2e4d', '#2e6bff', '#ff8a00', '#ff3ec8'],
    draw: drawNeonBlock,
  },
  pastel: {
    palette: [null, '#a8e6f0', '#fff1a8', '#d6bff2', '#bdf0c8', '#f7b8b8', '#b9d9f7', '#ffd6a8', '#f7bfdc'],
    draw: drawPastelBlock,
  },
  pixel: {
    palette: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#90caf9', '#ffb74d', '#f06292'],
    draw: drawPixelBlock,
  },
};

let activeSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin];
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x, y, skin.palette[colorIndex], size);
  context.globalAlpha = 1;
}

let gridColor = '#22222e';

function readGridColor() {
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
}

function applyTheme(theme, persist) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Tema oscuro' : 'Tema claro');
  readGridColor();
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

function applySkin(name, persist) {
  if (!SKINS[name]) name = 'retro';
  activeSkin = name;
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  readGridColor(); // el fondo y la rejilla cambian con la skin (CSS)
  if (persist) {
    try { localStorage.setItem('skin', name); } catch (e) {}
  }
  // Repinta igual que applyTheme(): también en pausa, game over o pantalla de inicio
  if (current && next) { draw(); drawNext(); } else { drawIdle(); }
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

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // devuelve las flechas y Space al juego
});
// Escape cierra la lista sin cambiar nada (no dispara 'change'): devuelve el foco al juego
skinSelect.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'Enter') skinSelect.blur();
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
  if (e.code === 'KeyP') { togglePause(); return; }
  // Con el selector de skin enfocado, sus teclas (flechas, Space, Escape) son del control
  if (e.target === skinSelect) return;
  if (e.code === 'Escape') { togglePause(); return; }
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
applySkin(document.documentElement.dataset.skin || 'retro', false);
