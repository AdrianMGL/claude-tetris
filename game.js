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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;     // nivel con el que empezó la partida actual
let nextStartLevel = 1; // nivel elegido en el menú para la próxima partida

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

const recordsSection =document.getElementById('records');
const recordsList = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const nameForm = document.getElementById('name-form');
const playerNameInput = document.getElementById('player-name');
const recordMsg = document.getElementById('record-msg');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let started = false;        // la partida empieza al pulsar "Jugar"
let combo = 0;              // locks consecutivos que limpian al menos una línea
let bestCombo = 0;          // mejor combo de la partida actual
let pendingRecord = false;  // la puntuación de game over puede entrar en el top y aún no está guardada

// ---- Records (localStorage) ----
const RECORDS_KEY = 'tetris-records';
const TOP_SIZE = 5;
const NAME_MAX = 12;

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.top)) {
      return {
        top: data.top
          .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
          .slice(0, TOP_SIZE),
        bestCombo: Number(data.bestCombo) || 0,
        maxLines: Number(data.maxLines) || 0,
      };
    }
  } catch (e) {}
  return emptyRecords();
}

let records = loadRecords();

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}

function qualifiesForTop(s) {
  if (s <= 0) return false;
  return records.top.length < TOP_SIZE || s > records.top[records.top.length - 1].score;
}

// Inserta la entrada, ordena, recorta a TOP_SIZE y devuelve su posición
function addRecord(name, s) {
  const entry = { name, score: s };
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top = records.top.slice(0, TOP_SIZE);
  saveRecords();
  return records.top.indexOf(entry);
}

function renderRecords(highlight) {
  recordsList.replaceChildren();
  if (records.top.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin records todavía';
    recordsList.appendChild(li);
  }
  records.top.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.classList.add('hit');
    const name = document.createElement('span');
    name.className = 'rec-name';
    name.textContent = e.name;
    const pts = document.createElement('span');
    pts.className = 'rec-score';
    pts.textContent = e.score.toLocaleString();
    li.append(name, pts);
    recordsList.appendChild(li);
  });
  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
}

function showRecords(show) {
  recordsSection.classList.toggle('hidden', !show);
}

function showNameForm(show) {
  nameForm.classList.toggle('hidden', !show);
  if (show) {
    recordMsg.textContent = '¡Entras en el top 5! Escribe tu nombre';
    playerNameInput.value = '';
    playerNameInput.focus();
  }
}

function showStartScreen() {
  started = false;
  overlayTitle.textContent = 'TETRIS ARCADE';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  showNameForm(false);
  showRecords(true);
  renderRecords(-1);
  overlay.classList.remove('hidden');
}

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
    dropInterval = speedFor(level);
    updateHUD();
  }
  return cleared;
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
  combo = cleared ? combo + 1 : 0;
  bestCombo = Math.max(bestCombo, combo);
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
  if (current && next) { draw(); drawNext(); }
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records.bestCombo = Math.max(records.bestCombo, bestCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  pendingRecord = qualifiesForTop(score);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Combo: ${bestCombo} · Líneas: ${lines}`;
  restartBtn.textContent = 'Reiniciar';
  showRecords(true);
  renderRecords(-1);
  showNameForm(pendingRecord);
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMenu();
  }
}

function showPauseMenu() {
  showPauseView(pauseMain);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function showPauseView(view) {
  pauseMain.classList.toggle('hidden', view !== pauseMain);
  pauseControls.classList.toggle('hidden', view !== pauseControls);
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

// Reinicia el estado de juego sin arrancar el bucle
function resetState() {
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = nextStartLevel;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  bestCombo = 0;
  pendingRecord = false;
  dropInterval = speedFor(level);
  dropAccum = 0;
  next = randomPiece();
  spawn();
  updateHUD();
}

// Arranca una partida nueva (botón "Jugar" o "Reiniciar")
function init() {
  hidePauseMenu();
  cancelAnimationFrame(animId);
  resetState();
  started = true;
  restartBtn.textContent = 'Reiniciar';
  overlay.classList.add('hidden');
  lastTime = performance.now();
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
  // no robar teclas mientras se escribe el nombre (incluida la P)
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver || !started) return;
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

restartBtn.addEventListener('click', init);
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
controlsBtn.addEventListener('click', () => {
  showPauseView(pauseControls);
  controlsBackBtn.focus();
});
controlsBackBtn.addEventListener('click', () => {
  showPauseView(pauseMain);
  controlsBtn.focus();
});
startLevelSel.addEventListener('change', e => {
  nextStartLevel = Number(e.target.value);
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const name = playerNameInput.value.trim().slice(0, NAME_MAX) || 'Jugador';
  const idx = addRecord(name, score);
  pendingRecord = false;
  showNameForm(false);
  renderRecords(idx);
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records? Esta acción no se puede deshacer.')) return;
  records = emptyRecords();
  saveRecords();
  if (gameOver) {
    pendingRecord = qualifiesForTop(score);
    showNameForm(pendingRecord);
  }
  renderRecords(-1);
});

resetState();
showStartScreen();
applyTheme(document.documentElement.dataset.theme || 'dark', false);
