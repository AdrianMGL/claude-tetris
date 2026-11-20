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

// Skins: paleta (índice = tipo de pieza), color de rejilla (null = variable CSS --grid)
// y función que dibuja un bloque en (px, py) con tamaño s.
const SKINS = {
  retro:  { label: 'Retro',     colors: COLORS, grid: null, render: renderRetro },
  neon:   { label: 'Neon',      colors: [null, '#00fff7', '#fff200', '#d400ff', '#39ff14', '#ff1f4b', '#1f6bff', '#ff9500', '#ff2bd6'], grid: '#14142b', render: renderNeon },
  pastel: { label: 'Pastel',    colors: [null, '#a0e7e5', '#fff5ba', '#d4b8e0', '#b5ead7', '#ffb7b2', '#b5d8f7', '#ffdac1', '#f8bbd9'], grid: null, render: renderPastel },
  pixel:  { label: 'Pixel art', colors: [null, '#00e5ff', '#ffea00', '#aa00ff', '#00e676', '#ff1744', '#2979ff', '#ff9100', '#ff4081'], grid: null, render: renderPixel },
};
let skin = SKINS.retro;

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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
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
  clearLines();
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
  context.globalAlpha = alpha ?? 1;
  skin.render(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function renderRetro(c, px, py, s, color) {
  c.fillStyle = color;
  c.fillRect(px + 1, py + 1, s - 2, s - 2);
  // highlight
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(px + 1, py + 1, s - 2, 4);
}

function renderNeon(c, px, py, s, color) {
  const x = px + 3, y = py + 3, w = s - 6;
  c.shadowColor = color;
  c.shadowBlur = s * 0.6;
  c.fillStyle = color;
  c.fillRect(x, y, w, w);
  // núcleo brillante sin sombra
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fillRect(x + 4, y + 4, w - 8, w - 8);
}

function roundedPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function renderPastel(c, px, py, s, color) {
  const x = px + 2, y = py + 2, w = s - 4;
  roundedPath(c, x, y, w, w, s * 0.25);
  c.fillStyle = color;
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 1.5;
  c.stroke();
}

function renderPixel(c, px, py, s, color) {
  const x = px + 1, y = py + 1, w = s - 2, q = w / 4;
  c.fillStyle = color;
  c.fillRect(x, y, w, w);
  // damero de píxeles más oscuros
  c.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      if ((i + j) % 2 === 1) c.fillRect(x + i * q, y + j * q, q, q);
  // bisel: luz arriba-izquierda, sombra abajo-derecha
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(x, y, w, 2);
  c.fillRect(x, y, 2, w);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(x, y + w - 2, w, 2);
  c.fillRect(x + w - 2, y, 2, w);
}

let gridColor = '#22222e';

function applyTheme(theme, persist) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Tema oscuro' : 'Tema claro');
  refreshGridColor();
  if (persist) {
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }
  // Repinta: en pausa o game over el bucle no corre
  if (current && next) { draw(); drawNext(); }
}

function refreshGridColor() {
  gridColor = skin.grid || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
}

function loadSkin() {
  try {
    const saved = localStorage.getItem('skin');
    if (saved && SKINS[saved]) return saved;
  } catch (e) {}
  return 'retro';
}

function applySkin(name, persist) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  refreshGridColor();
  if (persist) {
    try { localStorage.setItem('skin', name); } catch (e) {}
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
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
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
  if (e.code === 'KeyP') { togglePause(); return; }
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

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value, true);
  skinSelect.blur(); // evita que Space abra el selector en vez de la caída dura
});

restartBtn.addEventListener('click', init);

applySkin(loadSkin(), false); // antes de init(), que ya dibuja la preview
init();
applyTheme(document.documentElement.dataset.theme || 'dark', false);
