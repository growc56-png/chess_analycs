const daysMap = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const monthsMap = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

let PLAN = [], currentDay = 1, totalDays = 0;
let puzzleBoard = null, puzzleGame = null, currentPuzzle = null, puzzleSolved = false;
let endgameBoard = null, endgameGame = null, endgameVirtualGame = null, currentEndgame = null;
let endgamePremoveQueue = [], endgameBotRequestActive = false, endgamePositionVersion = 0;
let endgamePlayerColor = 'w';
let openingBoard = null, currentOpening = null, currentMoveIndex = 0;
let openingGame = new Chess();
let isOpponentMoving = false;
let blindfoldBoard = null, blindfoldGame = new Chess();
let analysisBoard = null;
let puzzlesData = [], endgamesData = [], openingsData = [];
let currentSide = 'white';
let analysisMoves = [];
let currentAnalysisIndex = -1;
let latestGamesCache = null;

let analysisGame = new Chess();
let isAnalyzing = false;
let currentWhitePlayer = "White";
let currentBlackPlayer = "Black";
let isBoardFlipped = false;
let fullEvals = [];
let myUsername = "";
let analysisPlaybackTimer = null;
let analysisArrowLines = [];
let analysisArrowResizeObserver = null;

let pendingPromotion = null;

const PIECE_THEME = '/img/pieces/{piece}.png';
const moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3');
const errorSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/illegal.mp3');

function getTodayInfo() {
  const now = new Date();
  const dayName = daysMap[now.getDay()];
  document.getElementById('today-date').innerHTML = `Сегодня: <span>${dayName}</span>, ${now.getDate()} ${monthsMap[now.getMonth()]} ${now.getFullYear()} г.`;
  return dayName;
}

function showError(msg) {
  const banner = document.getElementById('error-banner');
  banner.style.display = 'block';
  banner.innerHTML = msg;
}

window.addEventListener('load', () => {
  if (typeof jQuery === 'undefined') return showError('Ошибка: jQuery не загрузился.');
  if (typeof Chessboard === 'undefined') return showError('Ошибка: Chessboard.js не загрузился.');
  if (typeof Chess === 'undefined') return showError('Ошибка: Chess.js не загрузился.');
  
  document.addEventListener('contextmenu', function(e) {
    if (e.target.tagName === 'IMG' || e.target.closest('.board-bg') || e.target.closest('[id$="Board"]')) {
      e.preventDefault();
    }
  });

  initApp();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    
    if (btn.dataset.tab === 'puzzles' && puzzleBoard) setTimeout(() => puzzleBoard.resize(), 50);
    if (btn.dataset.tab === 'endgames' && endgameBoard) setTimeout(() => endgameBoard.resize(), 50);
    if (btn.dataset.tab === 'openings' && openingBoard) setTimeout(() => openingBoard.resize(), 50);
    if (btn.dataset.tab === 'analysis' && analysisBoard) setTimeout(() => {
      analysisBoard.resize();
      if (currentAnalysisIndex >= 0 && analysisMoves[currentAnalysisIndex]) {
        drawBoardBadge(analysisMoves[currentAnalysisIndex]);
      }
    }, 50);
    if (btn.dataset.tab === 'blindfold' && blindfoldBoard) setTimeout(() => blindfoldBoard.resize(), 50);
    if (btn.dataset.tab === 'diary') drawDiary();
    if (btn.dataset.tab === 'streak') loadStreak();
  };
});

// Возвращает фактическую ориентацию Chessboard.js. Флаг isBoardFlipped
// оставлен как fallback для версий библиотеки без getter-а orientation().
function isAnalysisBoardFlipped() {
  try {
    if (analysisBoard && typeof analysisBoard.orientation === 'function') {
      const orientation = analysisBoard.orientation();
      if (orientation === 'black') return true;
      if (orientation === 'white') return false;
    }
  } catch (error) {
    console.debug('Не удалось прочитать ориентацию доски:', error);
  }
  return Boolean(isBoardFlipped);
}

// ========== ФУНКЦИОНАЛ РИСОВАНИЯ ПКМ ==========
function getRenderedBoardSquare(boardEl, square) {
  if (!boardEl || !/^[a-h][1-8]$/.test(square || '')) return null;
  return boardEl.querySelector(`[data-square="${square}"]`) || boardEl.querySelector(`.square-${square}`);
}

function getRenderedSquareAtPoint(boardEl, clientX, clientY) {
  if (!boardEl) return null;
  const rect = boardEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
  const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;

  // Не читаем data-square из Chessboard.js: в некоторых сборках при
  // orientation('black') эти атрибуты остаются в логическом порядке, хотя
  // визуальная сетка уже перевёрнута. Переводим координату мыши в шахматное
  // поле строго по фактической ориентации доски.
  const blackAtBottom = boardEl.id === 'analysisBoard' && isAnalysisBoardFlipped();
  const file = blackAtBottom ? 7 - col : col;
  const rank = blackAtBottom ? row + 1 : 8 - row;
  return 'abcdefgh'[file] + String(rank);
}

function getSquareCenterInOverlay(boardEl, svgEl, square) {
  if (!boardEl || !svgEl || !/^[a-h][1-8]$/.test(square || '')) return null;
  const boardRect = boardEl.getBoundingClientRect();
  const overlayRect = svgEl.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height || !overlayRect.width || !overlayRect.height) return null;

  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = Number(square[1]);
  const blackAtBottom = boardEl.id === 'analysisBoard' && isAnalysisBoardFlipped();
  const col = blackAtBottom ? 7 - file : file;
  const row = blackAtBottom ? rank - 1 : 8 - rank;
  const screenX = boardRect.left + ((col + 0.5) / 8) * boardRect.width;
  const screenY = boardRect.top + ((row + 0.5) / 8) * boardRect.height;
  return {
    x: ((screenX - overlayRect.left) / overlayRect.width) * 1000,
    y: ((screenY - overlayRect.top) / overlayRect.height) * 1000
  };
}

function makeArrowPolygon(ns, start, end, shaftWidth, headWidth, headLength, color, opacity = 0.88) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 2) return null;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const head = Math.min(headLength, length * 0.48);
  const base = { x: end.x - ux * head, y: end.y - uy * head };
  const shaftHalf = shaftWidth / 2;
  const headHalf = headWidth / 2;
  const pts = [
    [start.x + px * shaftHalf, start.y + py * shaftHalf],
    [base.x + px * shaftHalf, base.y + py * shaftHalf],
    [base.x + px * headHalf, base.y + py * headHalf],
    [end.x, end.y],
    [base.x - px * headHalf, base.y - py * headHalf],
    [base.x - px * shaftHalf, base.y - py * shaftHalf],
    [start.x - px * shaftHalf, start.y - py * shaftHalf]
  ];
  const polygon = document.createElementNS(ns, 'polygon');
  polygon.setAttribute('points', pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
  polygon.setAttribute('fill', color);
  polygon.setAttribute('fill-opacity', String(opacity));
  polygon.setAttribute('stroke', 'rgba(15,20,24,.7)');
  polygon.setAttribute('stroke-width', '2.5');
  polygon.setAttribute('stroke-linejoin', 'round');
  polygon.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,.45))';
  return polygon;
}

function initRightClickDrawing(boardId) {
  const boardEl = document.getElementById(boardId);
  const svgEl = document.getElementById(`userDraw_${boardId}`);
  if (!boardEl || !svgEl || svgEl.dataset.drawingReady === '1') return;

  svgEl.dataset.drawingReady = '1';
  svgEl.setAttribute('viewBox', '0 0 1000 1000');
  svgEl.setAttribute('preserveAspectRatio', 'none');
  svgEl.replaceChildren();
  svgEl.__userArrows = [];

  let isDrawing = false;
  let startPoint = null;
  let previewPoint = null;
  let startCell = null;
  let previewCell = null;
  const ns = 'http://www.w3.org/2000/svg';

  // Рисуем в экранных координатах, а не переводим мышь в a1-h8 и обратно.
  // Поэтому для black orientation стрелка всегда идёт ровно от места нажатия
  // к месту отпускания мыши — никакого дополнительного разворота координат.
  const getVisualPoint = (clientX, clientY) => {
    const boardRect = boardEl.getBoundingClientRect();
    const overlayRect = svgEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height || !overlayRect.width || !overlayRect.height) return null;
    const col = Math.floor(((clientX - boardRect.left) / boardRect.width) * 8);
    const row = Math.floor(((clientY - boardRect.top) / boardRect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;

    const screenX = boardRect.left + ((col + 0.5) / 8) * boardRect.width;
    const screenY = boardRect.top + ((row + 0.5) / 8) * boardRect.height;
    return {
      point: {
        x: ((screenX - overlayRect.left) / overlayRect.width) * 1000,
        y: ((screenY - overlayRect.top) / overlayRect.height) * 1000
      },
      cell: `${col}:${row}`
    };
  };

  const render = (preview = null) => {
    svgEl.replaceChildren();
    const arrows = svgEl.__userArrows || [];
    const draw = (from, to, sameCell, opacity, fromCell, toCell) => {
      if (!from || !to) return;
      if (sameCell) {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', String(from.x));
        circle.setAttribute('cy', String(from.y));
        circle.setAttribute('r', '24');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#f39b37');
        circle.setAttribute('stroke-width', '5');
        circle.setAttribute('stroke-opacity', String(opacity));
        svgEl.appendChild(circle);
        return;
      }

      const fromParts = String(fromCell || '').split(':').map(Number);
      const toParts = String(toCell || '').split(':').map(Number);
      const colDelta = Math.abs(toParts[0] - fromParts[0]);
      const rowDelta = Math.abs(toParts[1] - fromParts[1]);
      const isKnightMove = (colDelta === 1 && rowDelta === 2) || (colDelta === 2 && rowDelta === 1);

      if (isKnightMove) {
        const elbow = colDelta > rowDelta
          ? { x: to.x, y: from.y }
          : { x: from.x, y: to.y };
      // Ход конём рисуется буквой «Г»: два перпендикулярных отрезка.
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M ${from.x} ${from.y} L ${elbow.x} ${elbow.y}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#f39b37');
        path.setAttribute('stroke-width', '10');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-opacity', String(opacity));
        path.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,.45))';
        svgEl.appendChild(path);
        const head = makeArrowPolygon(ns, elbow, to, 10, 34, 40, '#f39b37', opacity);
        if (head) svgEl.appendChild(head);
      } else {
        const poly = makeArrowPolygon(ns, from, to, 11, 38, 44, '#f39b37', opacity);
        if (poly) svgEl.appendChild(poly);
      }
    };

    arrows.forEach(arrow => draw(arrow.from, arrow.to, arrow.fromCell === arrow.toCell, .9, arrow.fromCell, arrow.toCell));
    if (preview) draw(preview.from, preview.to, preview.fromCell === preview.toCell, .66, preview.fromCell, preview.toCell);
  };

  boardEl.addEventListener('click', event => {
    if (event.button !== 0 || !(svgEl.__userArrows || []).length) return;
    svgEl.__userArrows = [];
    render();
  }, true);

  boardEl.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
  }, true);

  boardEl.addEventListener('mousedown', event => {
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const hit = getVisualPoint(event.clientX, event.clientY);
    if (!hit) return;
    isDrawing = true;
    startPoint = hit.point;
    previewPoint = hit.point;
    startCell = hit.cell;
    previewCell = hit.cell;
    render({ from: startPoint, to: previewPoint, fromCell: startCell, toCell: previewCell });
  }, true);

  document.addEventListener('mousemove', event => {
    if (!isDrawing) return;
    const hit = getVisualPoint(event.clientX, event.clientY);
    if (!hit || hit.cell === previewCell) return;
    previewPoint = hit.point;
    previewCell = hit.cell;
    render({ from: startPoint, to: previewPoint, fromCell: startCell, toCell: previewCell });
  }, true);

  document.addEventListener('mouseup', event => {
    if (event.button !== 2 || !isDrawing) return;
    event.preventDefault();
    const hit = getVisualPoint(event.clientX, event.clientY);
    const finalPoint = hit ? hit.point : (previewPoint || startPoint);
    const finalCell = hit ? hit.cell : (previewCell || startCell);
    const arrows = svgEl.__userArrows || [];
    const existingIndex = arrows.findIndex(item => item.fromCell === startCell && item.toCell === finalCell);
    if (existingIndex >= 0) arrows.splice(existingIndex, 1);
    else arrows.push({ from: startPoint, to: finalPoint, fromCell: startCell, toCell: finalCell });
    svgEl.__userArrows = arrows;
    isDrawing = false;
    startPoint = null;
    previewPoint = null;
    startCell = null;
    previewCell = null;
    render();
  }, true);
}

function clearUserDrawings(boardId) {
  const svg = document.getElementById(`userDraw_${boardId}`);
  if (svg) { svg.innerHTML = ''; svg.__userArrows = []; }
}
// ==============================================

async function initApp() {
  try {
    const todayName = getTodayInfo();
    
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fetch('/api/diary', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({day_date: dateStr}) });

    const [planRes, puzzlesRes, endgamesRes, openingsRes, recRes] = await Promise.all([
      fetch('/api/plan'), fetch('/api/puzzles'), fetch('/api/endgames'), fetch('/api/openings'), fetch('/api/recommendations')
    ]);

    const checkResponse = async (res, name) => {
      if (!res.ok) throw new Error(`Сервер вернул ошибку ${res.status} для ${name}`);
      const text = await res.text();
      if (text.startsWith('<!DOCTYPE')) throw new Error('Запустите бэкенд через uvicorn и откройте http://127.0.0.1:8000');
      return JSON.parse(text);
    };

    PLAN = (await checkResponse(planRes, 'plan')).plan;
    totalDays = PLAN.length;
    puzzlesData = (await checkResponse(puzzlesRes, 'puzzles')).puzzles;
    endgamesData = (await checkResponse(endgamesRes, 'endgames')).endgames;
    openingsData = (await checkResponse(openingsRes, 'openings')).openings;
    const recData = await checkResponse(recRes, 'recommendations');

    updateRecommendationsUI(recData.recommendations);
    renderPlan(todayName);
    renderPuzzlesList();
    renderEndgamesList();
    renderSideButtons();
    initAnalysis();
    initBlindfold();

    initRightClickDrawing('analysisBoard');
    initRightClickDrawing('puzzleBoard');
    initRightClickDrawing('endgameBoard');
    initRightClickDrawing('blindfoldBoard');
    initRightClickDrawing('openingBoard');

  } catch (e) {
    showError('<b>Ошибка загрузки данных:</b><br>' + e.message);
  }
}

function updateRecommendationsUI(recommendations) {
  const banner = document.getElementById('recommendations-banner');
  const list = document.getElementById('recommendations-list');
  if (recommendations && recommendations.length > 0) {
    banner.style.display = 'block';
    list.innerHTML = recommendations.map(r => `<li>${r}</li>`).join('');
  } else {
    banner.style.display = 'none';
  }
}

// --- ВИНСТРИК ---
async function loadStreak() {
  try {
    const res = await fetch('/api/streak');
    const data = await res.json();
    updateStreakUI(data);
  } catch (e) {
    console.error('Ошибка загрузки винстрика', e);
  }
}

function updateStreakUI(data) {
  const total = data.wins + data.losses + data.draws;
  const winrate = total > 0 ? ((data.wins / total) * 100).toFixed(1) : 0;

  document.getElementById('streak-total').textContent = total;
  document.getElementById('streak-wins').textContent = data.wins;
  document.getElementById('streak-losses').textContent = data.losses;
  document.getElementById('streak-draws').textContent = data.draws;
  document.getElementById('streak-current').textContent = data.current_streak;
  document.getElementById('streak-max').textContent = data.max_streak;
  document.getElementById('streak-winrate').textContent = winrate + '%';
}

window.addStreakResult = async function(result) {
  try {
    await fetch('/api/streak', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ result })
    });
    loadStreak();
  } catch (e) {
    console.error(e);
  }
};

document.getElementById('analyzeTodayBtn').onclick = async () => {
  const username = document.getElementById('streakUsername').value.trim();
  if (!username) return alert('Введи ник на Chess.com');
  
  const btn = document.getElementById('analyzeTodayBtn');
  btn.disabled = true;
  btn.textContent = 'Загрузка...';

  try {
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    if (!archivesRes.ok) throw new Error('Игрок не найден.');
    const archivesData = await archivesRes.json();
    const archives = archivesData.archives || [];
    if (archives.length === 0) throw new Error('Нет архивов игр.');

    const latestArchiveUrl = archives[archives.length - 1];
    const monthRes = await fetch(latestArchiveUrl);
    const monthData = await monthRes.json();
    let games = monthData.games || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayGames = games.filter(g => {
      const gameDate = new Date(g.end_time * 1000);
      gameDate.setHours(0, 0, 0, 0);
      return gameDate.getTime() === today.getTime();
    });

    if (todayGames.length === 0) {
      updateStreakUI({ wins:0, losses:0, draws:0, current_streak:0, max_streak:0 });
      alert('За сегодня игр не найдено.');
      return;
    }

    let wins = 0, losses = 0, draws = 0;
    let currentStreak = 0, maxStreak = 0;
    const userLower = username.toLowerCase();

    todayGames.sort((a, b) => a.end_time - b.end_time);

    todayGames.forEach(game => {
      const isWhite = game.white.username.toLowerCase() === userLower;
      const result = isWhite ? game.white.result : game.black.result;

      if (result === 'win') {
        wins++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (['checkmated', 'resigned', 'timeout', 'abandoned'].includes(result)) {
        losses++;
        currentStreak = 0;
      } else {
        draws++;
        currentStreak = 0;
      }
    });

    updateStreakUI({ wins, losses, draws, current_streak: currentStreak, max_streak: maxStreak });
    
  } catch (e) {
    alert('Ошибка: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Авто-анализ за сегодня';
  }
};

async function drawDiary() {
  const canvas = document.getElementById('diaryCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#312e2b'; ctx.fillRect(0, 0, w, h);
  
  try {
    const res = await fetch('/api/diary');
    const data = await res.json();
    const activity = data.activity || [];
    
    if (activity.length === 0) {
      ctx.fillStyle = '#b3b3b3'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Пока нет данных. Заходи на сайт каждый день!', w/2, h/2);
      return;
    }
    
    ctx.strokeStyle = '#3d3a37'; ctx.lineWidth = 1;
    for(let i=0; i<=6; i++) {
        const y = (h/6)*i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    
    ctx.fillStyle = '#81b64c';
    const stepX = w / Math.max(30, activity.length);
    
    activity.forEach((dateStr, i) => {
        const x = i * stepX + 10;
        ctx.beginPath();
        ctx.arc(x, h/2, 6, 0, Math.PI*2);
        ctx.fill();
    });
    
    ctx.fillStyle = '#b3b3b3'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Дни активности (слева направо)', 10, 20);
    
  } catch(e) { console.error(e); }
}

function renderEndgamesList() {
  const list = document.getElementById('endgameList');
  list.innerHTML = endgamesData.map(e => `<div class="list-item" data-id="${e.id}">${e.title}</div>`).join('');
  list.querySelectorAll('.list-item').forEach(el => { el.onclick = () => selectEndgame(endgamesData.find(e => e.id == el.dataset.id)); });
  if (endgamesData.length) selectEndgame(endgamesData[0]);
}

function forceEndgamePlayerTurn(chessGame) {
  const fields = chessGame.fen().split(' ');
  if (fields[1] !== endgamePlayerColor) {
    fields[1] = endgamePlayerColor;
    // Соперник пропускается в виртуальной позиции, поэтому право на взятие en passant сгорает.
    fields[3] = '-';
  }
  return new Chess(fields.join(' '));
}

// Собирает виртуальную позицию: реальная партия + все запланированные ходы игрока.
function rebuildEndgameVirtualBoard() {
  endgameVirtualGame = new Chess(endgameGame.fen());

  if (endgameVirtualGame.turn() !== endgamePlayerColor) {
    endgameVirtualGame = forceEndgamePlayerTurn(endgameVirtualGame);
  }

  const validQueue = [];
  for (let i = 0; i < endgamePremoveQueue.length; i++) {
    if (endgameVirtualGame.turn() !== endgamePlayerColor) {
      endgameVirtualGame = forceEndgamePlayerTurn(endgameVirtualGame);
    }

    const planned = endgamePremoveQueue[i];
    let move = null;
    try {
      move = endgameVirtualGame.move({
        from: planned.from,
        to: planned.to,
        promotion: planned.promotion || 'q'
      });
    } catch (error) {
      move = null;
    }

    if (!move) break;
    validQueue.push(planned);
    endgameVirtualGame = forceEndgamePlayerTurn(endgameVirtualGame);
  }

  const removedCount = endgamePremoveQueue.length - validQueue.length;
  endgamePremoveQueue = validQueue;
  return removedCount;
}

function updateEndgamePremoveHighlights() {
  document.querySelectorAll('#endgameBoard .premove-from, #endgameBoard .premove-to')
    .forEach(el => el.classList.remove('premove-from', 'premove-to'));

  endgamePremoveQueue.forEach(move => {
    const fromSquare = document.querySelector('#endgameBoard .square-' + move.from);
    const toSquare = document.querySelector('#endgameBoard .square-' + move.to);
    if (fromSquare) fromSquare.classList.add('premove-from');
    if (toSquare) toSquare.classList.add('premove-to');
  });
}

function renderEndgameBoard() {
  if (!endgameBoard || !endgameGame) return;
  const removedCount = rebuildEndgameVirtualBoard();
  endgameBoard.position(endgameVirtualGame.fen(), false);
  updateEndgamePremoveHighlights();

  if (removedCount > 0) {
    setEndgameFeedback('Премув отменён: после хода соперника он стал невозможен.', 'err');
  }
}

function setEndgameFeedback(message, type) {
  const feedback = document.getElementById('endgameFeedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = 'feedback ' + (type || 'info');
}

function selectEndgame(eg) {
  if (!eg) return;
  currentEndgame = eg;
  endgamePremoveQueue = [];
  endgameBotRequestActive = false;
  endgamePositionVersion++;

  document.querySelectorAll('#endgameList .list-item').forEach(i => i.classList.remove('active'));
  const el = document.querySelector('#endgameList .list-item[data-id="' + eg.id + '"]');
  if (el) el.classList.add('active');
  clearUserDrawings('endgameBoard');
  clearHighlights();

  let fenToUse = eg.fen;
  let hintToUse = eg.hint;

  if (eg.id === 1) {
    const variations = [
      { fen: "8/8/8/8/8/4K3/4P3/4k3 w - - 0 1", hint: "Ход белых. Защити пешку королем и проведи её в ферзи." },
      { fen: "8/8/8/8/4K3/8/4P3/4k3 w - - 0 1", hint: "Ход белых. Король должен прикрывать пешку. Проведи пешку в ферзи." },
      { fen: "8/8/8/8/8/8/4P3/4K2k w - - 0 1", hint: "Ход белых. Проведи пешку в ферзи, прикрывая её королем." },
      { fen: "8/8/8/8/8/8/3P4/3K2k1 w - - 0 1", hint: "Ход белых. Пешка на d2. Проведи её в ферзи." }
    ];
    const variation = variations[Math.floor(Math.random() * variations.length)];
    fenToUse = variation.fen;
    hintToUse = variation.hint;
  }

  endgameGame = new Chess(fenToUse);
  endgamePlayerColor = endgameGame.turn();
  endgameVirtualGame = new Chess(endgameGame.fen());

  if (!endgameBoard) {
    endgameBoard = Chessboard('endgameBoard', {
      position: fenToUse,
      draggable: true,
      onDragStart: onEndgameDragStart,
      onDrop: handleEndgameDrop,
      onSnapEnd: () => {
        clearHighlights();
        renderEndgameBoard();
      },
      pieceTheme: PIECE_THEME
    });
    initRightClickDrawing('endgameBoard');
  }

  if (endgameBoard.orientation) {
    endgameBoard.orientation(endgamePlayerColor === 'w' ? 'white' : 'black');
  }
  if (window.initBoardClickToMove) {
    window.initBoardClickToMove(
      'endgameBoard',
      () => (
        endgameGame.turn() !== endgamePlayerColor ||
        endgameBotRequestActive ||
        endgamePremoveQueue.length > 0
      ) ? endgameVirtualGame : endgameGame,
      handleEndgameDrop,
      { canSelect: piece => Boolean(piece && piece.color === endgamePlayerColor) }
    );
  }
  renderEndgameBoard();
  endgameBoard.resize();

  const colorLabel = endgamePlayerColor === 'w' ? 'Ты играешь белыми. ' : 'Ты играешь чёрными. ';
  setEndgameFeedback(colorLabel + hintToUse, 'info');
}

function onEndgameDragStart(source, piece) {
  if (!currentEndgame || !piece || piece.charAt(0) !== endgamePlayerColor) {
    return false;
  }

  const planningMode =
    endgameGame.turn() !== endgamePlayerColor ||
    endgameBotRequestActive ||
    endgamePremoveQueue.length > 0;

  const activeGame = planningMode ? endgameVirtualGame : endgameGame;
  if (!activeGame || activeGame.moves({ square: source }).length === 0) {
    return false;
  }

  clearUserDrawings('endgameBoard');
  highlightMoves(activeGame, source);
  return true;
}

function handleEndgameDrop(source, target) {
  clearHighlights();
  if (!currentEndgame || !endgameGame || source === target || endgameGame.game_over()) {
    return 'snapback';
  }

  const planningMode =
    endgameGame.turn() !== endgamePlayerColor ||
    endgameBotRequestActive ||
    endgamePremoveQueue.length > 0;

  // Если сейчас ход соперника (или уже есть очередь), добавляем ход в виртуальную позицию.
  if (planningMode) {
    if (!endgameVirtualGame) rebuildEndgameVirtualBoard();
    if (endgameVirtualGame.turn() !== endgamePlayerColor) {
      endgameVirtualGame = forceEndgamePlayerTurn(endgameVirtualGame);
    }

    let plannedMove = null;
    try {
      plannedMove = endgameVirtualGame.move({
        from: source,
        to: target,
        promotion: 'q'
      });
    } catch (error) {
      plannedMove = null;
    }

    if (!plannedMove) return 'snapback';

    endgamePremoveQueue.push({
      from: source,
      to: target,
      promotion: 'q'
    });

    renderEndgameBoard();
    setEndgameFeedback(
      'Премув ' + source + ' → ' + target + ' поставлен. Он выполнится после ответа соперника, если останется легальным.',
      'info'
    );
    return;
  }

  // Обычный ход игрока в реальной партии.
  let move = null;
  try {
    move = endgameGame.move({ from: source, to: target, promotion: 'q' });
  } catch (error) {
    move = null;
  }
  if (!move) return 'snapback';

  renderEndgameBoard();
  playMoveSound();

  if (checkEndgameGameOver()) return;

  setEndgameFeedback('Соперник думает… Можешь заранее запланировать следующий ход.', 'info');
  setTimeout(makeEndgameBotMove, 180);
}

async function makeEndgameBotMove() {
  if (
    !currentEndgame ||
    !endgameGame ||
    endgameGame.game_over() ||
    endgameGame.turn() === endgamePlayerColor ||
    endgameBotRequestActive
  ) {
    return;
  }

  endgameBotRequestActive = true;
  const requestVersion = endgamePositionVersion;
  const requestFen = endgameGame.fen();

  try {
    const response = await fetch('/api/bot_move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: requestFen, level: 6 })
    });
    if (!response.ok) throw new Error('Ошибка ответа бота: ' + response.status);
    const data = await response.json();

    if (requestVersion !== endgamePositionVersion || !currentEndgame) return;

    let applied = null;
    if (data.move) {
      try {
        applied = endgameGame.move({
          from: data.move.slice(0, 2),
          to: data.move.slice(2, 4),
          promotion: data.move[4] || 'q'
        });
      } catch (error) {
        applied = null;
      }
    }
    if (!applied) throw new Error('Бот не вернул допустимый ход');

    playMoveSound();
  } catch (error) {
    if (requestVersion === endgamePositionVersion && currentEndgame && !endgameGame.game_over()) {
      const legalMoves = endgameGame.moves({ verbose: true });
      if (legalMoves.length) {
        const fallback = legalMoves[0];
        endgameGame.move({
          from: fallback.from,
          to: fallback.to,
          promotion: fallback.promotion || 'q'
        });
        playMoveSound();
      }
    }
  } finally {
    if (requestVersion !== endgamePositionVersion) return;

    endgameBotRequestActive = false;
    renderEndgameBoard();

    if (checkEndgameGameOver()) return;

    if (endgamePremoveQueue.length > 0) {
      executeEndgamePremove();
    } else {
      setEndgameFeedback('Твой ход. Во время ответа соперника можно заранее поставить премув.', 'info');
    }
  }
}

function executeEndgamePremove() {
  if (
    endgamePremoveQueue.length === 0 ||
    !currentEndgame ||
    !endgameGame ||
    endgameGame.game_over() ||
    endgameGame.turn() !== endgamePlayerColor
  ) {
    renderEndgameBoard();
    return;
  }

  const plannedMove = endgamePremoveQueue.shift();
  let move = null;
  try {
    move = endgameGame.move({
      from: plannedMove.from,
      to: plannedMove.to,
      promotion: plannedMove.promotion || 'q'
    });
  } catch (error) {
    move = null;
  }

  if (!move) {
    endgamePremoveQueue = [];
    renderEndgameBoard();
    setEndgameFeedback('Премув отменён: после ответа соперника ход больше невозможен.', 'err');
    return;
  }

  renderEndgameBoard();
  playMoveSound();

  if (checkEndgameGameOver()) return;

  setEndgameFeedback('Премув выполнен. Соперник отвечает…', 'info');
  setTimeout(makeEndgameBotMove, 140);
}

function checkEndgameGameOver() {
  if (!endgameGame) return false;

  if (endgameGame.in_checkmate()) {
    const playerWon = endgameGame.turn() !== endgamePlayerColor;
    endgamePremoveQueue = [];
    setEndgameFeedback(
      playerWon ? '✅ Мат! Отлично, ты победил!' : '❌ Мат. Соперник победил.',
      playerWon ? 'ok' : 'err'
    );
    renderEndgameBoard();
    return true;
  }

  if (
    endgameGame.in_draw() ||
    endgameGame.in_stalemate() ||
    endgameGame.in_threefold_repetition() ||
    endgameGame.insufficient_material()
  ) {
    endgamePremoveQueue = [];
    setEndgameFeedback('Ничья. Попробуй ещё раз.', 'info');
    renderEndgameBoard();
    return true;
  }

  return false;
}

document.getElementById('endgameResetBtn').onclick = () => {
  if (currentEndgame) selectEndgame(currentEndgame);
};

function initBlindfold() {
  blindfoldBoard = Chessboard('blindfoldBoard', {
    position: 'start', draggable: false, pieceTheme: PIECE_THEME
  });
  
  document.getElementById('blindfoldBoard').classList.add('blindfold-hidden');

  const updateBlindfoldBoard = () => {
    if (!document.getElementById('blindfoldBoard').classList.contains('blindfold-hidden')) {
      blindfoldBoard.position(blindfoldGame.fen());
    }
  };

  document.getElementById('blindfoldToggleBtn').onclick = () => {
    const boardEl = document.getElementById('blindfoldBoard');
    const isHidden = boardEl.classList.toggle('blindfold-hidden');
    
    if (!isHidden) {
      blindfoldBoard.position(blindfoldGame.fen());
    }
    
    document.getElementById('blindfoldToggleBtn').textContent = isHidden ? '👁️ Показать доску' : '🙈 Скрыть доску';
  };

  document.getElementById('blindfoldInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      const moveStr = this.value.trim();
      if (!moveStr) return;
      this.value = '';
      clearUserDrawings('blindfoldBoard');
      
      let move = null;
      try { move = blindfoldGame.move(moveStr); } catch(e) {}
      
      if (!move) {
        document.getElementById('blindfoldFeedback').textContent = '❌ Неверный ход. Вводи как на Chess.com (Nf3, e4, O-O)';
        return;
      }
      
      document.getElementById('blindfoldFeedback').textContent = '';
      updateBlindfoldHistory();
      updateBlindfoldBoard();
      
      if (blindfoldGame.game_over()) return checkBlindfoldEnd();
      
      setTimeout(async () => {
        try {
          const res = await fetch('/api/bot_move', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ fen: blindfoldGame.fen(), level: 1 })
          });
          const data = await res.json();
          if (data.move) {
            blindfoldGame.move({ from: data.move.slice(0,2), to: data.move.slice(2,4), promotion: 'q' });
            updateBlindfoldHistory();
            updateBlindfoldBoard();
            checkBlindfoldEnd();
          }
        } catch(e) {}
      }, 500);
    }
  });

  document.getElementById('blindfoldResetBtn').onclick = () => {
    blindfoldGame = new Chess();
    clearUserDrawings('blindfoldBoard');
    updateBlindfoldBoard();
    document.getElementById('blindfoldHistory').innerHTML = '';
    document.getElementById('blindfoldFeedback').textContent = '';
  };
}
function updateBlindfoldHistory() {
  const history = blindfoldGame.history();
  let html = '';
  for(let i=0; i<history.length; i+=2) {
    html += `${Math.floor(i/2)+1}. ${history[i]} `;
    if (history[i+1]) html += `${history[i+1]} `;
  }
  document.getElementById('blindfoldHistory').innerHTML = html || 'Ходов пока нет...';
}
function checkBlindfoldEnd() {
  if (blindfoldGame.in_checkmate()) {
    document.getElementById('blindfoldFeedback').textContent = blindfoldGame.turn() === 'w' ? '❌ Тебя заматовали.' : '✅ Мат! Ты победил!';
  } else if (blindfoldGame.in_draw() || blindfoldGame.in_stalemate()) {
    document.getElementById('blindfoldFeedback').textContent = 'Ничья.';
  }
}

// ---------- Источник партии: Chess.com / Lichess / PGN ----------
function initAnalysisSourceChooser() {
  const select = document.getElementById('analysisSourceSelect');
  const summary = document.getElementById('analysisSourceSummaryValue');
  const details = document.getElementById('analysisSourceDetails');
  if (!select || select.dataset.bound === '1') return;
  select.dataset.bound = '1';

  const labels = { chesscom: 'Chess.com', lichess: 'Lichess', pgn: 'PGN' };
  const panels = {
    chesscom: document.getElementById('analysisSourceChesscom'),
    lichess: document.getElementById('analysisSourceLichess'),
    pgn: document.getElementById('analysisSourcePgn')
  };
  const update = () => {
    const value = select.value in panels ? select.value : 'chesscom';
    Object.entries(panels).forEach(([key, panel]) => {
      if (panel) panel.hidden = key !== value;
    });
    if (summary) summary.textContent = labels[value];
    if (details) details.dataset.source = value;
  };
  select.addEventListener('change', update);
  update();

  const pgnFile = document.getElementById('analysisPgnFile');
  if (pgnFile) pgnFile.addEventListener('change', () => {
    const file = pgnFile.files && pgnFile.files[0];
    const name = document.getElementById('analysisPgnFileName');
    if (!file) {
      if (name) name.textContent = 'Файл не выбран';
      return;
    }
    if (name) name.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const textarea = document.getElementById('analysisPgnText');
      if (textarea) textarea.value = String(reader.result || '');
    };
    reader.onerror = () => alert('Не удалось прочитать выбранный PGN-файл.');
    reader.readAsText(file, 'UTF-8');
  });

  const analyzePgn = document.getElementById('analyzePgnBtn');
  if (analyzePgn) analyzePgn.addEventListener('click', () => {
    const textarea = document.getElementById('analysisPgnText');
    const text = textarea ? textarea.value.trim() : '';
    if (!text) return alert('Выбери PGN-файл или вставь текст партии.');
    const games = splitPgnGames(text);
    if (!games.length) return alert('В тексте не найдена партия в формате PGN.');
    renderImportedPgnGames(games, 'analysisPgnGamesList', 'pgn', '');
  });

  const loadLichess = document.getElementById('loadLichessGamesBtn');
  if (loadLichess) loadLichess.addEventListener('click', () => loadLichessGames(false));
  const latestLichess = document.getElementById('analyzeLichessLatestBtn');
  if (latestLichess) latestLichess.addEventListener('click', () => loadLichessGames(true));
}

function getPgnHeader(pgn, key, fallback = '') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(pgn || '').match(new RegExp('^\\[' + escaped + '\\s+"((?:\\\\.|[^"])*)"\\]', 'mi'));
  return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : fallback;
}

function splitPgnGames(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  if (!text) return [];
  const chunks = text.split(/(?=^\[Event\s+")/m).map(part => part.trim()).filter(Boolean);
  return chunks.length ? chunks : [text];
}

function pgnToGameData(pgn, index, source, username = '') {
  const whiteName = getPgnHeader(pgn, 'White', 'Белые');
  const blackName = getPgnHeader(pgn, 'Black', 'Чёрные');
  const result = getPgnHeader(pgn, 'Result', '*');
  const date = getPgnHeader(pgn, 'Date', '');
  const site = getPgnHeader(pgn, 'Site', '');
  const event = getPgnHeader(pgn, 'Event', source === 'lichess' ? 'Lichess' : 'PGN');
  const timeControl = getPgnHeader(pgn, 'TimeControl', '');
  const whiteElo = getPgnHeader(pgn, 'WhiteElo', '');
  const blackElo = getPgnHeader(pgn, 'BlackElo', '');
  const resultFor = value => result === value ? 'win' : result === '1/2-1/2' ? 'draw' : result === '*' ? 'unknown' : 'resigned';
  const id = (site || `${source}:${username}:${date}:${index}`).replace(/\s+/g, '-');
  return {
    pgn,
    url: id,
    end_time: date && !date.includes('?') ? Math.floor(new Date(`${date.replaceAll('.', '-') }T12:00:00`).getTime() / 1000) || 0 : 0,
    white: { username: whiteName, result: resultFor('1-0'), rating: whiteElo },
    black: { username: blackName, result: resultFor('0-1'), rating: blackElo },
    time_class: timeControl || event,
    source
  };
}

function renderImportedPgnGames(games, containerId, source, username) {
  const list = document.getElementById(containerId);
  if (!list) return;
  list.replaceChildren();
  list.style.display = 'block';
  if (!games.length) {
    list.textContent = 'Не удалось найти партии в ответе. Проверь ник и доступность публичных игр.';
    return;
  }
  const cards = games.slice(0, 20).map((pgn, index) => pgnToGameData(pgn, index, source, username));
  cards.forEach((gameData, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'chesscom-game-card analysis-imported-game';
    const info = document.createElement('span');
    info.className = 'analysis-imported-game-info';
    const opponent = gameData.white.username.toLowerCase() === username.toLowerCase()
      ? gameData.black.username : gameData.white.username;
    const title = document.createElement('strong');
    title.textContent = `vs ${opponent || 'Соперник'}`;
    const meta = document.createElement('small');
    const result = getPgnHeader(gameData.pgn, 'Result', '*');
    const date = getPgnHeader(gameData.pgn, 'Date', 'Дата неизвестна');
    meta.textContent = `${date} · ${result} · ${getPgnHeader(gameData.pgn, 'Event', source === 'lichess' ? 'Lichess' : 'PGN')}`;
    info.append(title, meta);
    const badge = document.createElement('span');
    badge.className = 'analysis-imported-game-number';
    badge.textContent = `${index + 1}`;
    card.append(info, badge);
    card.addEventListener('click', () => {
      list.querySelectorAll('.chesscom-game-card').forEach(item => item.classList.remove('selected'));
      card.classList.add('selected');
      if (source === 'pgn') {
        startAnalysisFromPgn(gameData.pgn);
      } else {
        myUsername = username || '';
        startAnalysis(gameData);
      }
    });
    list.appendChild(card);
  });
  if (cards.length === 1) {
    list.querySelector('.chesscom-game-card')?.click();
  }
}

async function loadLichessGames(analyzeLatest) {
  const input = document.getElementById('lichessUsername');
  const username = input ? input.value.trim() : '';
  if (!username) return alert('Введи ник на Lichess.');
  const list = document.getElementById('lichessGamesList');
  const loadButton = document.getElementById(analyzeLatest ? 'analyzeLichessLatestBtn' : 'loadLichessGamesBtn');
  const oldText = loadButton ? loadButton.textContent : '';
  if (loadButton) { loadButton.disabled = true; loadButton.textContent = 'Загрузка…'; }
  if (list) {
    list.style.display = 'block';
    list.textContent = 'Загружаю публичные партии Lichess…';
  }
  try {
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=20&clocks=true`;
    const response = await fetch(url, { headers: { 'Accept': 'application/x-chess-pgn' } });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Пользователь Lichess не найден.');
      if (response.status === 429) throw new Error('Lichess ограничил частоту запросов. Попробуй через минуту.');
      throw new Error(`Lichess вернул ошибку ${response.status}.`);
    }
    const pgnText = await response.text();
    const games = splitPgnGames(pgnText);
    if (!games.length) throw new Error('У пользователя нет доступных партий.');
    myUsername = username;
    renderImportedPgnGames(games, 'lichessGamesList', 'lichess', username);
    if (analyzeLatest && games.length > 1) {
      const firstCard = list.querySelector('.chesscom-game-card');
      if (firstCard) firstCard.click();
    }
  } catch (error) {
    if (list) list.textContent = `Ошибка: ${error.message}`;
  } finally {
    if (loadButton) { loadButton.disabled = false; loadButton.textContent = oldText; }
  }
}

function startAnalysisFromPgn(rawPgn) {
  const pgn = splitPgnGames(rawPgn)[0];
  if (!pgn) return alert('PGN пустой или не распознан.');
  myUsername = '';
  currentWhitePlayer = getPgnHeader(pgn, 'White', 'Белые');
  currentBlackPlayer = getPgnHeader(pgn, 'Black', 'Чёрные');
  isBoardFlipped = false;
  if (analysisBoard) analysisBoard.orientation('white');
  updatePlayerNamesAndMaterial(new Chess().fen());
  const hashInput = `${pgn.length}:${pgn.slice(0, 160)}:${pgn.slice(-160)}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
  analyzePGN(pgn, `manual-pgn-${Math.abs(hash)}`);
  document.getElementById('analysisBoard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

initAnalysisSourceChooser();

document.getElementById('loadGamesBtn').onclick = async () => {
  const username = document.getElementById('chesscomUsername').value.trim();
  if (!username) return alert('Введи ник на Chess.com');
  myUsername = username;
  const btn = document.getElementById('loadGamesBtn'); btn.disabled = true; btn.textContent = 'Загрузка...';
  const listContainer = document.getElementById('chesscomGamesList');
  listContainer.style.display = 'block';
  listContainer.innerHTML = '<p style="color: #b3b3b3; padding: 15px; font-weight: 600;">Загрузка игр...</p>';

  try {
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    if (!archivesRes.ok) throw new Error('Игрок не найден.');
    const archivesData = await archivesRes.json();
    const archives = archivesData.archives || [];
    if (archives.length === 0) { listContainer.innerHTML = '<p style="color: #b3b3b3; padding: 15px; font-weight: 600;">Игры не найдены.</p>'; return; }

    const recentArchives = archives.slice(-2);
    let allGames = [];
    for (const url of recentArchives) {
      const monthRes = await fetch(url);
      if (monthRes.ok) {
        const monthData = await monthRes.json();
        allGames = allGames.concat(monthData.games || []);
      }
    }
    allGames.sort((a, b) => b.end_time - a.end_time);
    allGames = allGames.slice(0, 20);
    latestGamesCache = allGames;
    if (allGames.length === 0) { listContainer.innerHTML = '<p style="color: #b3b3b3; padding: 15px; font-weight: 600;">Игры не найдены.</p>'; return; }

    listContainer.innerHTML = '';
    allGames.forEach((game) => {
      const white = game.white, black = game.black;
      let myResult = '', opponent = '';
      const userLower = username.toLowerCase();
      if (white.username.toLowerCase() === userLower) { myResult = white.result; opponent = black.username; }
      else { myResult = black.result; opponent = white.username; }

      let gameResult = '';
      if (myResult === 'win') gameResult = 'Победа';
      else if (['checkmated', 'resigned', 'timeout', 'abandoned'].includes(myResult)) gameResult = 'Поражение';
      else gameResult = 'Ничья';

      let resultClass = 'draw';
      if (gameResult === 'Победа') resultClass = 'win';
      else if (gameResult === 'Поражение') resultClass = 'loss';

      const date = new Date(game.end_time * 1000).toLocaleDateString();
      const accuracyStr = game.accuracies ? (white.username.toLowerCase() === userLower ? game.accuracies.white : game.accuracies.black) : '—';

      const card = document.createElement('div');
      card.className = 'chesscom-game-card';
      card.innerHTML = `<div class="game-info"><div class="game-opponent">vs ${opponent} (${game.time_class})</div><div class="game-meta"><span>${date}</span><span>Точность: <span class="game-accuracy">${accuracyStr ? accuracyStr + '%' : '—'}</span></span></div></div><div class="game-result ${resultClass}">${gameResult}</div>`;

      card.onclick = () => {
        document.querySelectorAll('.chesscom-game-card').forEach(c => c.style.borderLeftColor = 'transparent');
        card.style.borderLeftColor = '#81b64c';
        startAnalysis(game);
      };
      listContainer.appendChild(card);
    });

  } catch (e) {
    listContainer.innerHTML = `<p style="color: #ef4444; padding: 15px; font-weight: 600;">Ошибка: ${e.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '📂 Посмотреть игры';
  }
};

document.getElementById('analyzeLatestBtn').onclick = async () => {
  const username = document.getElementById('chesscomUsername').value.trim();
  if (!username) return alert('Сначала введи ник на Chess.com');
  
  if (latestGamesCache && latestGamesCache.length > 0 && myUsername === username) {
    startAnalysis(latestGamesCache[0]);
    return;
  }
  
  const btn = document.getElementById('analyzeLatestBtn'); btn.disabled = true; btn.textContent = 'Поиск...';
  try {
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    const archivesData = await archivesRes.json();
    const archives = archivesData.archives || [];
    if (archives.length === 0) throw new Error('Игры не найдены');
    const monthRes = await fetch(archives[archives.length - 1]);
    const monthData = await monthRes.json();
    const games = monthData.games || [];
    if (games.length === 0) throw new Error('В последнем месяце нет игр');
    
    games.sort((a, b) => b.end_time - a.end_time);
    myUsername = username;
    startAnalysis(games[0]);
  } catch (e) {
    alert('Ошибка: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Анализ';
  }
};

function startAnalysis(gameData) {
  const white = gameData.white, black = gameData.black;
  const isUserWhite = white.username.toLowerCase() === myUsername.toLowerCase();
  
  analysisBoard.orientation(isUserWhite ? 'white' : 'black');
  isBoardFlipped = !isUserWhite;

  currentWhitePlayer = white.username;
  currentBlackPlayer = black.username;
  updatePlayerNamesAndMaterial(new Chess().fen());
  clearUserDrawings('analysisBoard');

  analyzePGN(gameData.pgn, gameData.url);
  document.getElementById('analysisBoard').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderPlan(todayName) {
  const firstOpen = PLAN.find(d => !d.completed);
  const currentWeek = firstOpen ? firstOpen.week : 1;
  let todayTraining = PLAN.find(d => d.week === currentWeek && d.weekday === todayName);
  if (!todayTraining || todayTraining.completed) todayTraining = firstOpen || PLAN[0];
  currentDay = todayTraining.day;
  renderPhases(); renderWeeks(); showDay(currentDay); updateProgress();
}
function updateProgress() {
  const done = PLAN.filter(d => d.completed).length;
  const pct = totalDays ? (done / totalDays * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = `Выполнено: ${done} из ${totalDays} дней (${pct.toFixed(1)}%)`;
}
function renderPhases() {
  const map = {};
  PLAN.forEach(d => {
    if (!map[d.phase]) map[d.phase] = { name: d.phase, target: d.target_elo, days: [], minWeek: d.week, maxWeek: d.week };
    map[d.phase].days.push(d.day);
    map[d.phase].minWeek = Math.min(map[d.phase].minWeek, d.week);
    map[d.phase].maxWeek = Math.max(map[d.phase].maxWeek, d.week);
  });
  document.getElementById('phases').innerHTML = Object.values(map).map(p => {
    const done = p.days.filter(n => PLAN[n-1].completed).length;
    return `<div class="phase"><div class="phase-title">${p.name}</div><div class="phase-meta">Недели ${p.minWeek}–${p.maxWeek} · Эло ${p.target} · ${done}/${p.days.length}</div></div>`;
  }).join('');
}
function renderWeeks() {
  const weeks = [...new Set(PLAN.map(d => d.week))];
  document.getElementById('weeks').innerHTML = weeks.map(w => `<button class="week-btn" data-week="${w}">Нед. ${w}</button>`).join('');
  document.querySelectorAll('.week-btn').forEach(btn => {
    btn.onclick = () => {
      const firstDay = PLAN.find(d => d.week === +btn.dataset.week);
      if (firstDay) showDay(firstDay.day);
    };
  });
}
function showDay(dayNum) {
  if (dayNum < 1 || dayNum > totalDays) return;
  currentDay = dayNum;
  const d = PLAN[dayNum - 1];
  document.querySelectorAll('.week-btn').forEach(b => b.classList.toggle('active', +b.dataset.week === d.week));
  const tasksHTML = d.tasks.map((t, tIdx) => {
    const taskId = `task-${d.day}-${tIdx}`;
    let buttonHTML = ''; let boxHTML = '';
    if (t.checklist && t.checklist.length > 0) {
      buttonHTML = `<button class="checklist-btn" onclick="toggleChecklistView('${taskId}-box', this)">📋 Чек-лист</button>`;
      const itemsHTML = t.checklist.map((item, iIdx) => {
        const checkId = `${taskId}-item-${iIdx}`;
        const isChecked = localStorage.getItem(checkId) === 'true' ? 'checked' : '';
        return `<div class="checklist-item"><input type="checkbox" id="${checkId}" ${isChecked} onchange="toggleChecklistItem('${checkId}')"><label for="${checkId}">${item}</label></div>`;
      }).join('');
      boxHTML = `<div class="checklist-container" id="${taskId}-box">${itemsHTML}</div>`;
    }
    return `<div class="task ${t.type}"><div class="task-title">${t.title}</div><div class="task-detail">${t.detail}</div><div class="task-meta"><span>⏱ ${t.duration}${t.link ? ` · <a href="${t.link}" target="_blank">Открыть →</a>` : ''}</span>${buttonHTML}</div>${boxHTML}</div>`;
  }).join('');
  document.getElementById('dayView').innerHTML = `
    <div class="day-card ${d.completed ? 'done' : ''}">
      <div class="day-header"><div><div class="day-title">День ${d.day} · Неделя ${d.week} · ${d.weekday}</div><div class="day-sub">${d.phase} · целевой рейтинг: ${d.target_elo}</div></div><input type="checkbox" class="checkbox" id="dayCheck" ${d.completed ? 'checked' : ''}></div>
      ${tasksHTML}
      <textarea class="note-area" id="noteArea" placeholder="Напиши, из-за чего проиграл...">${d.note || ''}</textarea>
    </div>
  `;
  document.getElementById('dayCheck').onchange = async (e) => {
    await fetch('/api/complete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({day: d.day, completed: e.target.checked}) });
    d.completed = e.target.checked; document.querySelector('.day-card').classList.toggle('done', d.completed); updateProgress(); renderPhases();
  };
  let noteTimer;
  document.getElementById('noteArea').oninput = (e) => {
    clearTimeout(noteTimer); noteTimer = setTimeout(async () => {
      await fetch('/api/note', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({day: d.day, text: e.target.value}) }); 
      d.note = e.target.value;
      const recRes = await fetch('/api/recommendations');
      const recData = await recRes.json();
      updateRecommendationsUI(recData.recommendations);
    }, 800);
  };
  document.getElementById('prevBtn').disabled = currentDay <= 1;
  document.getElementById('nextBtn').disabled = currentDay >= totalDays;
}
window.toggleChecklistView = function(boxId, btn) { const box = document.getElementById(boxId); box.classList.toggle('open'); btn.classList.toggle('active'); };
window.toggleChecklistItem = function(checkId) { const cb = document.getElementById(checkId); localStorage.setItem(checkId, cb.checked ? 'true' : 'false'); };
document.getElementById('prevBtn').onclick = () => showDay(currentDay - 1);
document.getElementById('nextBtn').onclick = () => showDay(currentDay + 1);
document.getElementById('todayBtn').onclick = () => {
  const todayName = daysMap[new Date().getDay()];
  const currentWeek = PLAN[currentDay - 1].week;
  const todayInWeek = PLAN.find(d => d.week === currentWeek && d.weekday === todayName);
  showDay(todayInWeek ? todayInWeek.day : currentDay);
};

function renderPuzzlesList() {
  const list = document.getElementById('puzzleList');
  list.innerHTML = puzzlesData.map(p => `<div class="list-item" data-id="${p.id}">${p.title}</div>`).join('');
  list.querySelectorAll('.list-item').forEach(el => { el.onclick = () => selectPuzzle(puzzlesData.find(p => p.id == el.dataset.id)); });
  if (puzzlesData.length) selectPuzzle(puzzlesData[0]);
}
function selectPuzzle(puzzle) {
  currentPuzzle = puzzle;
  puzzleSolved = false;
  clearHighlights();
  clearUserDrawings('puzzleBoard');
  document.querySelectorAll('#puzzleList .list-item').forEach(i => i.classList.remove('active'));
  const el = document.querySelector(`#puzzleList .list-item[data-id="${puzzle.id}"]`);
  if (el) el.classList.add('active');
  puzzleGame = new Chess(puzzle.fen);
  if (!puzzleBoard) {
    puzzleBoard = Chessboard('puzzleBoard', {
      position: puzzle.fen, draggable: true,
      onDragStart: (source, piece) => {
        clearUserDrawings('puzzleBoard');
        const turn = puzzleGame.turn() === 'w' ? 'w' : 'b';
        if ((turn === 'w' && piece.search(/^b/) !== -1) || (turn === 'b' && piece.search(/^w/) !== -1)) return false;
        highlightMoves(puzzleGame, source);
      },
      onDrop: handlePuzzleDrop, onSnapEnd: () => clearHighlights(), pieceTheme: PIECE_THEME
    });
  } else {
    puzzleBoard.position(puzzle.fen); puzzleBoard.resize();
  }
  if (window.initBoardClickToMove) {
    window.initBoardClickToMove('puzzleBoard', () => puzzleGame, handlePuzzleDrop);
  }
  setFeedback('', ''); document.getElementById('puzzleHint').textContent = '';
}
function handlePuzzleDrop(source, target) {
  if (!currentPuzzle || puzzleSolved) return 'snapback';
  
  const moves = puzzleGame.moves({ verbose: true });
  const isPromotion = moves.some(m => m.from === source && m.to === target && m.flags.includes('p'));
  if (isPromotion) {
    pendingPromotion = { source, target, context: 'puzzle' };
    document.getElementById('promotionModal').style.display = 'flex';
    return 'snapback';
  }

  let move = null;
  try { move = puzzleGame.move({ from: source, to: target }); } catch(e) {}
  if (!move) return 'snapback';
  if (source + target === currentPuzzle.solution) {
    puzzleSolved = true; puzzleBoard.position(puzzleGame.fen());
    setFeedback('✅ Верно! Это мат.', 'ok'); return;
  } else {
    puzzleGame.undo(); setFeedback('❌ Неверно, попробуй другой ход.', 'err'); return 'snapback';
  }
}
function setFeedback(text, cls) { const fb = document.getElementById('puzzleFeedback'); fb.textContent = text; fb.className = 'feedback ' + cls; }
document.getElementById('puzzleResetBtn').onclick = () => { if (currentPuzzle) selectPuzzle(currentPuzzle); };
document.getElementById('puzzleHintBtn').onclick = () => { if (currentPuzzle) document.getElementById('puzzleHint').textContent = '💡 ' + (currentPuzzle.hint || ''); };
document.getElementById('puzzleSolutionBtn').onclick = () => {
  if (!currentPuzzle) return;
  const from = currentPuzzle.solution.slice(0, 2), to = currentPuzzle.solution.slice(2, 4);
  let mv = null;
  try { mv = puzzleGame.move({ from, to, promotion: 'q' }); } catch(e) {}
  if (mv) { puzzleSolved = true; puzzleBoard.position(puzzleGame.fen()); setFeedback('Решение показано.', 'ok'); }
};

// --- ИНТЕРАКТИВНЫЕ ДЕБЮТЫ ---
function renderSideButtons() {
  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); currentSide = btn.dataset.side; renderOpeningsList();
    };
  });
  renderOpeningsList();
}

function renderOpeningsList() {
  const list = document.getElementById('openingList');
  const filtered = openingsData.filter(o => o.side === currentSide);
  if (filtered.length === 0) { list.innerHTML = '<div style="padding:10px; color:#888; font-weight:600;">Нет дебютов.</div>'; return; }
  
  const groups = {};
  filtered.forEach(o => { if (!groups[o.family]) groups[o.family] = []; groups[o.family].push(o); });
  
  let html = '';
  Object.keys(groups).forEach(family => {
    html += `<div class="family-header">${family}</div>`;
    groups[family].forEach(o => { html += `<div class="list-item" data-id="${o.id}">${o.name}</div>`; });
  });
  list.innerHTML = html;
  
  list.querySelectorAll('.list-item').forEach(el => {
    el.onclick = () => {
      document.querySelectorAll('#openingList .list-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active'); 
      selectOpening(filtered.find(o => o.id === el.dataset.id));
    };
  });
  
  if (filtered.length > 0) {
    const firstEl = document.querySelector(`#openingList .list-item[data-id="${filtered[0].id}"]`);
    if(firstEl) firstEl.classList.add('active');
    selectOpening(filtered[0]);
  }
}

function selectOpening(opening) {
  currentOpening = opening; 
  currentMoveIndex = 0;
  isOpponentMoving = false;
  openingGame = new Chess();
  clearUserDrawings('openingBoard');

  if (!openingBoard) {
    openingBoard = Chessboard('openingBoard', {
      position: 'start', 
      draggable: true,
      onDragStart: (source, piece) => {
        if (isOpponentMoving || currentMoveIndex >= currentOpening.moves.length) return false;
        const turn = openingGame.turn() === 'w' ? 'w' : 'b';
        const userSide = currentOpening.side === 'white' ? 'w' : 'b';
        if (turn !== userSide) return false;
        if ((turn === 'w' && piece.search(/^b/) !== -1) || (turn === 'b' && piece.search(/^w/) !== -1)) return false;
        highlightMoves(openingGame, source);
        return true;
      },
      onDrop: handleOpeningDrop,
      onSnapEnd: () => { clearHighlights(); openingBoard.position(openingGame.fen()); },
      pieceTheme: PIECE_THEME
    });
  } else {
    openingBoard.position('start');
  }
  if (window.initBoardClickToMove) {
    window.initBoardClickToMove('openingBoard', () => openingGame, handleOpeningDrop, {
      canSelect: piece => Boolean(
        !isOpponentMoving &&
        currentOpening &&
        piece &&
        piece.color === (currentOpening.side === 'white' ? 'w' : 'b')
      )
    });
  }
  
  // Ждем 100мс, пока вкладка прогрузится, и выравниваем доску
  setTimeout(() => { if (openingBoard) openingBoard.resize(); }, 100);

  document.getElementById('openingNav').style.display = 'flex'; 
  updateOpeningView();
}

function handleOpeningDrop(source, target) {
  if (currentMoveIndex >= currentOpening.moves.length) return 'snapback';
  
  let move = null;
  try { move = openingGame.move({ from: source, to: target, promotion: 'q' }); } catch(e) {}
  if (!move) return 'snapback';

  const expectedMoveStr = currentOpening.moves[currentMoveIndex];
  
  if (move.san !== expectedMoveStr) {
    openingGame.undo();
    errorSound.currentTime = 0;
    errorSound.play().catch(e => {});
    return 'snapback';
  }
  
  moveSound.currentTime = 0;
  moveSound.play().catch(e => {});
  
  currentMoveIndex++;
  updateOpeningView();
  clearHighlights();

  if (currentMoveIndex < currentOpening.moves.length) {
    isOpponentMoving = true;
    setTimeout(() => {
      openingGame.move(currentOpening.moves[currentMoveIndex]);
      currentMoveIndex++;
      openingBoard.position(openingGame.fen());
      updateOpeningView();
      isOpponentMoving = false;
      moveSound.currentTime = 0;
      moveSound.play().catch(e => {});
    }, 400);
  }
  
  return; 
}

function updateOpeningView() {
  if (!currentOpening) return;
  
  openingGame = new Chess();
  for (let i = 0; i < currentMoveIndex; i++) {
    openingGame.move(currentOpening.moves[i]);
  }
  openingBoard.position(openingGame.fen());
  
  const movesHTML = currentOpening.moves.map((m, i) => {
    const cls = i < currentMoveIndex ? 'current' : '';
    const moveNum = i % 2 === 0 ? (Math.floor(i/2)+1) + '. ' : '';
    return `<span class="move-chip ${cls}" data-idx="${i+1}">${moveNum}${m}</span>`;
  }).join('');
  
  document.getElementById('openingDesc').innerHTML = `
    <p><strong>${currentOpening.name}</strong></p><p>${currentOpening.description}</p>
    <p><strong>План белых:</strong> ${currentOpening.plans_white}</p>
    <p><strong>План чёрных:</strong> ${currentOpening.plans_black}</p>
    <p style="color:#fcd34d; font-size:12px; margin-top:10px;">💡 Вы играете за ${currentOpening.side === 'white' ? 'белых' : 'чёрных'}. Сделайте правильный ход на доске или нажмите «Вперёд».</p>
    <div class="move-list">${movesHTML}</div>
  `;
  
  document.querySelectorAll('#openingDesc .move-chip').forEach(chip => {
    chip.onclick = () => {
      currentMoveIndex = +chip.dataset.idx; 
      updateOpeningView();
    };
  });
}

document.getElementById('openingStart').onclick = () => { currentMoveIndex = 0; updateOpeningView(); };
document.getElementById('openingPrev').onclick = () => { if (currentMoveIndex > 0) { currentMoveIndex--; updateOpeningView(); } };
document.getElementById('openingNext').onclick = () => { 
  if (currentOpening && currentMoveIndex < currentOpening.moves.length) { 
    currentMoveIndex++; 
    updateOpeningView(); 
  } 
};
document.getElementById('openingEnd').onclick = () => { if (currentOpening) { currentMoveIndex = currentOpening.moves.length; updateOpeningView(); } };

// --- АНАЛИЗ (ВСПОМОГАТЕЛЬНЫЕ) ---
function initAnalysis() {
  analysisBoard = Chessboard('analysisBoard', {
    position: 'start', draggable: true,
    onDragStart: (source, piece) => {
      clearUserDrawings('analysisBoard');
      if (isAnalyzing) return false;
      const turn = analysisGame.turn() === 'w' ? 'w' : 'b';
      if ((turn === 'w' && piece.search(/^b/) !== -1) || (turn === 'b' && piece.search(/^w/) !== -1)) return false;
      highlightMoves(analysisGame, source);
    },
    onDrop: handleAnalysisDrop, onSnapEnd: () => clearHighlights(), pieceTheme: PIECE_THEME
  });
  if (window.initBoardClickToMove) {
    window.initBoardClickToMove('analysisBoard', () => analysisGame, handleAnalysisDrop);
  }
  initAnalysisArrowResize();

  const refreshLinesButton = document.getElementById('refreshEngineLinesBtn');
  if (refreshLinesButton) {
    refreshLinesButton.addEventListener('click', () => {
      if (!analysisGame) return;
      evaluateCurrentPosition(analysisGame.fen(), null);
    });
  }

  document.getElementById('flipBoardBtn').onclick = () => {
    analysisBoard.flip();
    isBoardFlipped = !isBoardFlipped;
    updatePlayerNamesAndMaterial(analysisGame.fen());
    if (currentAnalysisIndex >= 0 && analysisMoves[currentAnalysisIndex]) {
      drawBoardBadge(analysisMoves[currentAnalysisIndex]);
      if (analysisMoves[currentAnalysisIndex].next_top_moves) {
        drawArrows(analysisMoves[currentAnalysisIndex].next_top_moves);
      }
    } else {
      const overlay = document.querySelector('#analysisBoard .custom-overlay');
      if (overlay) overlay.innerHTML = '';
      drawArrows(null);
    }
  };
}

const unicodePieces = { P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

function updatePlayerNamesAndMaterial(fen) {
  const board = new Chess(fen).board();
  const initialPieces = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const currentWhite = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const currentBlack = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        if (piece.color === 'w') currentWhite[piece.type]++;
        else currentBlack[piece.type]++;
      }
    }
  }
  
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let whiteScore = 0, blackScore = 0;
  let whiteCaptured = [], blackCaptured = [];
  
  for (const type in initialPieces) {
    if (type === 'k') continue;
    whiteScore += currentWhite[type] * values[type];
    blackScore += currentBlack[type] * values[type];
    
    for (let i = 0; i < initialPieces[type] - currentWhite[type]; i++) blackCaptured.push(`w${type.toUpperCase()}`);
    for (let i = 0; i < initialPieces[type] - currentBlack[type]; i++) whiteCaptured.push(`b${type.toUpperCase()}`);
  }
  
  const diff = whiteScore - blackScore;
  const whiteAdvStr = diff > 0 ? ` <span style="color:#81b64c;">+${diff}</span>` : '';
  const blackAdvStr = diff < 0 ? ` <span style="color:#81b64c;">+${Math.abs(diff)}</span>` : '';
  
  const whiteCapturedStr = whiteCaptured.map(p => unicodePieces[p]).join('');
  const blackCapturedStr = blackCaptured.map(p => unicodePieces[p]).join('');
  
  const whiteDisplay = `${currentWhitePlayer}${whiteAdvStr}`;
  const blackDisplay = `${currentBlackPlayer}${blackAdvStr}`;
  
  const topEl = document.getElementById('topPlayer');
  const bottomEl = document.getElementById('bottomPlayer');
  
  if (isBoardFlipped) {
    topEl.innerHTML = `<span>${whiteDisplay} <span class="captured-pieces">${whiteCapturedStr}</span></span><span class="player-clock" id="topClock">${document.getElementById('topClock').textContent}</span>`;
    bottomEl.innerHTML = `<span>${blackDisplay} <span class="captured-pieces">${blackCapturedStr}</span></span><span class="player-clock" id="bottomClock">${document.getElementById('bottomClock').textContent}</span>`;
  } else {
    topEl.innerHTML = `<span>${blackDisplay} <span class="captured-pieces">${blackCapturedStr}</span></span><span class="player-clock" id="topClock">${document.getElementById('topClock').textContent}</span>`;
    bottomEl.innerHTML = `<span>${whiteDisplay} <span class="captured-pieces">${whiteCapturedStr}</span></span><span class="player-clock" id="bottomClock">${document.getElementById('bottomClock').textContent}</span>`;
  }
}

function drawArrows(lines) {
  const svg = document.getElementById('arrowOverlay');
  const boardEl = document.getElementById('analysisBoard');
  if (!svg || !boardEl) return;

  analysisArrowLines = normaliseEngineLines(lines).slice(0, 3);
  svg.replaceChildren();

  const host = svg.parentElement;
  if (!host) return;
  const boardRect = boardEl.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height || !hostRect.width || !hostRect.height) return;

  const width = hostRect.width;
  const height = hostRect.height;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('preserveAspectRatio', 'none');

  const boardLeft = boardRect.left - hostRect.left;
  const boardTop = boardRect.top - hostRect.top;
  const squareW = boardRect.width / 8;
  const squareH = boardRect.height / 8;
  const files = 'abcdefgh';
  const ns = 'http://www.w3.org/2000/svg';
  const colors = [
    { fill: '#77bd3e', stroke: 'rgba(22,55,17,.52)' },
    { fill: '#3194f4', stroke: 'rgba(8,37,83,.55)' },
    { fill: '#b879e8', stroke: 'rgba(53,24,77,.55)' }
  ];

  analysisArrowLines.forEach((line, index) => {
    const fromFile = files.indexOf(line.uci[0].toLowerCase());
    const fromRank = Number(line.uci[1]);
    const toFile = files.indexOf(line.uci[2].toLowerCase());
    const toRank = Number(line.uci[3]);
    if (fromFile < 0 || toFile < 0 || fromRank < 1 || fromRank > 8 || toRank < 1 || toRank > 8) return;

    const fromSquare = line.uci.slice(0, 2).toLowerCase();
    const toSquare = line.uci.slice(2, 4).toLowerCase();
    // Используем ту же таблицу ориентации, что и ПКМ: белые — a1 снизу
    // слева, чёрные — h1 снизу слева. Центры клеток берём из геометрии доски,
    // а не из классов/атрибутов квадратов Chessboard.js.
    const boardFlipped = isAnalysisBoardFlipped();
    const startCol = boardFlipped ? 7 - fromFile : fromFile;
    const startRow = boardFlipped ? fromRank - 1 : 8 - fromRank;
    const endCol = boardFlipped ? 7 - toFile : toFile;
    const endRow = boardFlipped ? toRank - 1 : 8 - toRank;
    const x1 = boardLeft + (startCol + 0.5) * squareW;
    const y1 = boardTop + (startRow + 0.5) * squareH;
    const x2 = boardLeft + (endCol + 0.5) * squareW;
    const y2 = boardTop + (endRow + 0.5) * squareH;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const cell = Math.min(squareW, squareH);
    const shaftWidth = cell * (index === 0 ? 0.285 : index === 1 ? 0.205 : 0.135);
    const headWidth = cell * (index === 0 ? 0.62 : index === 1 ? 0.49 : 0.36);
    const headLength = Math.min(cell * (index === 0 ? 0.70 : 0.60), length * 0.50);
    const startInset = cell * 0.10;
    const tipInset = cell * 0.055;
    const sx = x1 + ux * startInset;
    const sy = y1 + uy * startInset;
    const tx = x2 - ux * tipInset;
    const ty = y2 - uy * tipInset;
    const bx = tx - ux * headLength;
    const by = ty - uy * headLength;
    const halfShaft = shaftWidth / 2;
    const halfHead = headWidth / 2;
    const point = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const points = [
      point(sx + px * halfShaft, sy + py * halfShaft),
      point(bx + px * halfShaft, by + py * halfShaft),
      point(bx + px * halfHead, by + py * halfHead),
      point(tx, ty),
      point(bx - px * halfHead, by - py * halfHead),
      point(bx - px * halfShaft, by - py * halfShaft),
      point(sx - px * halfShaft, sy - py * halfShaft)
    ].join(' ');

    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', colors[index].fill);
    polygon.setAttribute('fill-opacity', index === 0 ? '0.9' : index === 1 ? '0.83' : '0.76');
    polygon.setAttribute('stroke', colors[index].stroke);
    polygon.setAttribute('stroke-width', String(Math.max(2, cell * 0.026)));
    polygon.setAttribute('stroke-linejoin', 'round');
    polygon.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.55))';
    svg.appendChild(polygon);
  });
}
function initAnalysisArrowResize() {
  const boardEl = document.getElementById('analysisBoard');
  const host = document.getElementById('arrowOverlay')?.parentElement;
  if (!boardEl || !host) return;
  if (analysisArrowResizeObserver) analysisArrowResizeObserver.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    analysisArrowResizeObserver = new ResizeObserver(() => {
      if (analysisArrowLines.length) requestAnimationFrame(() => drawArrows(analysisArrowLines));
    });
    analysisArrowResizeObserver.observe(boardEl);
    analysisArrowResizeObserver.observe(host);
  }
  window.addEventListener('resize', () => {
    if (analysisArrowLines.length) requestAnimationFrame(() => drawArrows(analysisArrowLines));
  }, { passive: true });
}

function drawBoardBadge(moveData) {
  const boardEl = document.getElementById('analysisBoard');
  let overlay = boardEl.querySelector('.custom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'custom-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none'; overlay.style.zIndex = '100';
    boardEl.appendChild(overlay);
  }

  overlay.innerHTML = '';
  if (!moveData || !moveData.uci) return;

  const toSquare = moveData.uci.slice(2, 4);
  const files = ['a','b','c','d','e','f','g','h'];
  
  let file = files.indexOf(toSquare[0]);
  let rank = parseInt(toSquare[1]) - 1;
  
  if (file < 0 || rank < 0) return;

let xPct, yPct;

if (isAnalysisBoardFlipped()) {
  xPct = (7 - file) * 12.5;
  yPct = rank * 12.5;
} else {
  xPct = file * 12.5;
  yPct = (7 - rank) * 12.5;
}

  const badge = document.createElement('div');
  badge.className = 'board-badge';

  let text = ''; let cls = '';

  const classMap = {
    'brilliant': { t: '!!', c: 'badge-brilliant' }, 'critical': { t: '‼', c: 'badge-critical' }, 'great': { t: '!', c: 'badge-great' },
    'best': { t: '★', c: 'badge-best' }, 'excellent': { t: '✓', c: 'badge-excellent' },
    'good': { t: '✓', c: 'badge-good' }, 'inaccuracy': { t: '?!', c: 'badge-inaccuracy' },
    'mistake': { t: '?', c: 'badge-mistake' }, 'miss': { t: '✗', c: 'badge-miss' },
    'blunder': { t: '??', c: 'badge-blunder' }, 'book': { t: '📖', c: 'badge-book' },
    'forced': { t: '□', c: 'badge-forced' }
  };

  if (moveData.classification && classMap[moveData.classification]) {
    text = classMap[moveData.classification].t; cls = classMap[moveData.classification].c;
  } else if (moveData.is_mate) {
    text = moveData.mate_in > 0 ? `М${moveData.mate_in}` : `-М${Math.abs(moveData.mate_in)}`; cls = 'badge-eval';
  } else {
    text = (moveData.eval > 0 ? '+' : '') + moveData.eval.toFixed(1); cls = 'badge-eval';
  }

  badge.textContent = text;
  badge.classList.add(cls);
  
  badge.style.left = `${xPct + 11.2}%`;
  badge.style.top = `${yPct + 1.2}%`;
  badge.style.transform = 'translate(-100%, 0)';
  
  overlay.appendChild(badge);
}

function drawGraph(evals, currentIndex = -1) {
  const canvas = document.getElementById('evalGraph');
  const ctx = canvas.getContext('2d');
  const w = canvas.width; const h = canvas.height;
  
  ctx.clearRect(0, 0, w, h);
  if (!evals || evals.length === 0) return;
  
  ctx.fillStyle = '#262522'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#312e2b'; ctx.fillRect(0, 0, w, h / 2);
  
  const step = w / (evals.length || 1);
  ctx.beginPath(); ctx.moveTo(0, h / 2);
  
  for (let i = 0; i < evals.length; i++) {
    const x = i * step;
    let evalVal = Math.max(-10, Math.min(10, evals[i]));
    let y = (h / 2) - (evalVal / 10 * (h / 2)); 
    ctx.lineTo(x, y);
  }
  
  ctx.lineTo(w, h / 2);
  ctx.strokeStyle = '#81b64c'; ctx.lineWidth = 2; ctx.stroke();
  
  ctx.lineTo(w, h); ctx.lineTo(0, h);
  ctx.fillStyle = 'rgba(129, 182, 76, 0.2)'; ctx.fill();

  if (currentIndex >= 0 && currentIndex < evals.length) {
    const curX = currentIndex * step;
    ctx.beginPath(); ctx.moveTo(curX, 0); ctx.lineTo(curX, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
  }
}

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (document.getElementById('tab-analysis').classList.contains('active')) {
      if (e.key === 'ArrowLeft' && currentAnalysisIndex > 0) showAnalysisMove(currentAnalysisIndex - 1);
      else if (e.key === 'ArrowRight' && currentAnalysisIndex < analysisMoves.length - 1) showAnalysisMove(currentAnalysisIndex + 1);
    }
    if (document.getElementById('tab-openings').classList.contains('active')) {
      if (e.key === 'ArrowLeft') document.getElementById('openingPrev').click();
      if (e.key === 'ArrowRight') document.getElementById('openingNext').click();
    }
  }
});

function highlightMoves(game, source) {
  clearHighlights();
  if (!game || !source) return;
  const moves = game.moves({ square: source, verbose: true });
  moves.forEach(move => {
    const el = document.querySelector(`.square-${move.to}`);
    if (el) {
      const isCapture = move.flags.includes('c') || move.flags.includes('e');
      el.classList.add(isCapture ? 'highlight-capture' : 'highlight-move');
    }
  });
}

function clearHighlights() {
  document.querySelectorAll('.highlight-move, .highlight-capture').forEach(el => {
    el.classList.remove('highlight-move', 'highlight-capture');
  });
}

function playMoveSound() {
  moveSound.currentTime = 0;
  moveSound.play().catch(e => console.log("Звук не воспроизведен:", e));
}

async function analyzePGN(pgn, gameUrl) {
  cancelCurrentPositionEvaluation();
  document.getElementById('evalText').textContent = 'Анализ...';
  document.getElementById('topLinesList').innerHTML = '<span style="color:#81b64c; font-weight:600;">Анализ...</span>';
  document.getElementById('moveTableBody').innerHTML = '';
  const moveListContainer = document.querySelector('.move-list-container');
  if (moveListContainer) moveListContainer.scrollTop = 0;
  drawArrows(null);
  analysisArrowLines = [];
  analysisMoves = [];
  fullEvals = [];
  currentAnalysisIndex = -1;
  renderAnalysisSummary();
  refreshAnalysisNavigation();
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  isAnalyzing = true;
  updateAnalysisProgress(-1, 'running');
  stopAnalysisPlayback();

  const ANALYSIS_VERSION = 'v7-equivalent-moves-book-transpositions';
  const cacheKey = `analysis_${ANALYSIS_VERSION}_${gameUrl || pgn.slice(0, 50)}`;
  const cachedData = localStorage.getItem(cacheKey);
  if (cachedData) {
    try {
      const data = JSON.parse(cachedData);
      if (data && Array.isArray(data.moves) && data.moves.every(move => Object.prototype.hasOwnProperty.call(move, 'next_top_moves'))) {
        loadAnalysisData(data);
        isAnalyzing = false;
        return;
      }
      // Старый кеш без линий Stockfish не используем: он оставлял блок Топ-3 пустым.
    } catch (cacheError) {
      console.warn('Кеш анализа повреждён, запускаю новый анализ.', cacheError);
    }
    localStorage.removeItem(cacheKey);
  }

  try {
    const res = await fetch('/api/analyze', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pgn}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка анализа');
    if (!data || !Array.isArray(data.moves)) throw new Error('Сервер вернул некорректный результат анализа');
    localStorage.setItem(cacheKey, JSON.stringify(data));
    loadAnalysisData(data);
  } catch (e) {
    alert('Ошибка: ' + e.message);
    document.getElementById('evalText').textContent = '0.0';
    document.getElementById('topLinesList').textContent = 'Ошибка анализа';
    updateAnalysisProgress(-1, 'error');
    refreshAnalysisNavigation();
  } finally {
    isAnalyzing = false;
  }
}

function formatClockTime(seconds) {
  if (seconds === null || seconds === undefined) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSpentTime(seconds) {
  if (seconds === null || seconds === undefined) return '';
  if (seconds < 1) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const ANALYSIS_CLASS_ROWS = [
  { key: 'brilliant', label: 'Бриллиантовый', icon: '!!', className: 'brilliant' },
  { key: 'critical', label: 'Критический', icon: '‼', className: 'critical' },
  { key: 'great', label: 'Замечательный', icon: '!', className: 'great' },
  { key: 'best', label: 'Лучший', icon: '★', className: 'best' },
  { key: 'excellent', label: 'Отличный', icon: '👍', className: 'excellent' },
  { key: 'good', label: 'Хороший', icon: '✓', className: 'good' },
  { key: 'inaccuracy', label: 'Неточность', icon: '?!', className: 'inaccuracy' },
  { key: 'mistake', label: 'Ошибка', icon: '?', className: 'mistake' },
  { key: 'miss', label: 'Промах', icon: '✗', className: 'miss' },
  { key: 'blunder', label: 'Зевок', icon: '??', className: 'blunder' },
  { key: 'book', label: 'Теория', icon: '▤', className: 'book' },
  { key: 'forced', label: 'Вынужденный', icon: '□', className: 'forced' }
];

function getMoveAccuracy(move) {
  // Backend cp_loss is expected-points loss * 1000 (see game analyzer).
  const rawCpLoss = move ? move.cp_loss : null;
  const cpLoss = rawCpLoss === null || rawCpLoss === undefined ? NaN : Number(rawCpLoss);
  if (Number.isFinite(cpLoss)) {
    return Math.max(0, Math.min(100, 100 - Math.max(0, cpLoss) / 10));
  }
  // Fallback for older cached analyses that did not store cp_loss.
  const fallbackLoss = {
    brilliant: 0, critical: 0.2, great: 0.5, best: 0, excellent: 1.5,
    good: 4, inaccuracy: 10, mistake: 22, miss: 30, blunder: 45,
    book: 0, forced: 0
  };
  return 100 - (fallbackLoss[move?.classification] ?? 8);
}

function renderAnalysisSummary() {
  const rowsContainer = document.getElementById('analysisCategoryRows');
  if (!rowsContainer) return;
  const whiteMoves = analysisMoves.filter((_, index) => index % 2 === 0);
  const blackMoves = analysisMoves.filter((_, index) => index % 2 === 1);
  // A small display calibration (-0.5 pp) keeps this estimate closer to Chess.com.
  // It remains an approximation: Chess.com uses its own proprietary accuracy model.
  const averageAccuracy = moves => moves.length
    ? Math.max(0, moves.reduce((sum, move) => sum + getMoveAccuracy(move), 0) / moves.length - 0.5)
    : null;
  const whiteAccuracy = averageAccuracy(whiteMoves);
  const blackAccuracy = averageAccuracy(blackMoves);

  const setAccuracy = (value, valueId, fillId) => {
    const valueEl = document.getElementById(valueId);
    const fillEl = document.getElementById(fillId);
    if (valueEl) valueEl.textContent = value === null ? '—' : `${value.toFixed(1)}%`;
    if (fillEl) fillEl.style.width = value === null ? '0%' : `${value}%`;
  };
  setAccuracy(whiteAccuracy, 'analysisWhiteAccuracy', 'analysisWhiteAccuracyFill');
  setAccuracy(blackAccuracy, 'analysisBlackAccuracy', 'analysisBlackAccuracyFill');

  const whiteNameEl = document.getElementById('analysisWhiteName');
  const blackNameEl = document.getElementById('analysisBlackName');
  if (whiteNameEl) whiteNameEl.textContent = currentWhitePlayer || 'Белые';
  if (blackNameEl) blackNameEl.textContent = currentBlackPlayer || 'Чёрные';

  const counts = new Map();
  ANALYSIS_CLASS_ROWS.forEach(row => counts.set(row.key, { white: 0, black: 0 }));
  analysisMoves.forEach((move, index) => {
    const key = move?.classification || '';
    if (!counts.has(key)) return;
    const count = counts.get(key);
    if (index % 2 === 0) count.white += 1;
    else count.black += 1;
  });

  rowsContainer.innerHTML = ANALYSIS_CLASS_ROWS.map(row => {
    const count = counts.get(row.key);
    return `<div class="analysis-category-row">\
      <span class="analysis-category-name">${row.label}</span>\
      <strong class="analysis-count white-count">${count.white}</strong>\
      <span class="analysis-category-icon icon-${row.className}" title="${row.label}">${row.icon}</span>\
      <strong class="analysis-count black-count">${count.black}</strong>\
    </div>`;
  }).join('');
}

function updateAnalysisProgress(index = -1, state = 'ready') {
  const fill = document.getElementById('analysisProgressFill');
  const value = document.getElementById('analysisProgressValue');
  const label = document.getElementById('analysisProgressLabel');
  const remaining = document.getElementById('analysisProgressRemaining');
  if (!fill || !value || !label || !remaining) return;

  fill.classList.remove('is-indeterminate');
  if (state === 'running') {
    fill.style.width = '38%';
    fill.classList.add('is-indeterminate');
    value.textContent = '…';
    label.textContent = 'Stockfish анализирует партию';
    remaining.textContent = 'Подсчёт ходов';
    return;
  }
  if (state === 'error') {
    fill.style.width = '0%';
    value.textContent = '—';
    label.textContent = 'Не удалось завершить анализ';
    remaining.textContent = 'Попробуйте ещё раз';
    return;
  }

  const total = analysisMoves.length;
  if (!total) {
    fill.style.width = '0%';
    value.textContent = '—';
    label.textContent = 'Загрузите партию для анализа';
    remaining.textContent = '—';
    return;
  }
  const completed = Math.max(0, Math.min(total, index + 1));
  const percent = Math.round((completed / total) * 100);
  const left = total - completed;
  fill.style.width = `${percent}%`;
  value.textContent = `${percent}%`;
  label.textContent = `Ход ${completed} из ${total}`;
  remaining.textContent = left === 0 ? 'Конец партии' : `Осталось ${left} ${left === 1 ? 'ход' : left < 5 ? 'хода' : 'ходов'}`;
}

function animateAnalysisMove(moveData) {
  const effect = document.getElementById('analysisMoveEffect');
  const pulse = document.getElementById('analysisMoveEffectPulse');
  const boardEl = document.getElementById('analysisBoard');
  if (!effect || !pulse || !boardEl || !moveData?.uci) return;
  effect.className = 'analysis-move-effect';

  const classification = moveData.classification || '';
  let effectType = '';
  if (classification === 'brilliant') effectType = 'brilliant';
  else if (classification === 'great' || classification === 'critical') effectType = 'great';
  else if (classification === 'blunder') effectType = 'blunder';
  else if (classification === 'mistake' || classification === 'miss') effectType = 'mistake';
  if (!effectType) return;

  const target = moveData.uci.slice(2, 4);
  const file = 'abcdefgh'.indexOf(target[0]);
  const rank = Number(target[1]);
  if (file < 0 || rank < 1 || rank > 8) return;
  const boardRect = boardEl.getBoundingClientRect();
  const effectRect = effect.getBoundingClientRect();
  const boardFlipped = isAnalysisBoardFlipped();
  const col = boardFlipped ? 7 - file : file;
  const row = boardFlipped ? rank - 1 : 8 - rank;
  const x = boardRect.left - effectRect.left + ((col + 0.5) * boardRect.width / 8);
  const y = boardRect.top - effectRect.top + ((row + 0.5) * boardRect.height / 8);
  pulse.style.left = `${x}px`;
  pulse.style.top = `${y}px`;

  if (window.analysisMoveEffectTimeout) clearTimeout(window.analysisMoveEffectTimeout);
  void effect.offsetWidth;
  effect.classList.add(`effect-${effectType}`, 'active');
  window.analysisMoveEffectTimeout = setTimeout(() => {
    effect.className = 'analysis-move-effect';
  }, effectType === 'brilliant' ? 1900 : 1350);
}

function refreshAnalysisNavigation() {
  const hasMoves = analysisMoves.length > 0;
  const index = currentAnalysisIndex;
  const setDisabled = (id, disabled) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  };
  setDisabled('analysisStart', !hasMoves || index <= 0);
  setDisabled('analysisPrev', !hasMoves || index <= 0);
  setDisabled('analysisNext', !hasMoves || index >= analysisMoves.length - 1);
  setDisabled('analysisEnd', !hasMoves || index >= analysisMoves.length - 1);
  const play = document.getElementById('analysisPlay');
  if (play) {
    play.textContent = analysisPlaybackTimer ? 'Ⅱ' : '▶';
    play.title = analysisPlaybackTimer ? 'Остановить воспроизведение' : 'Воспроизвести партию';
    play.setAttribute('aria-label', play.title);
    play.classList.toggle('is-playing', !!analysisPlaybackTimer);
  }
}

function stopAnalysisPlayback() {
  if (analysisPlaybackTimer) {
    clearInterval(analysisPlaybackTimer);
    analysisPlaybackTimer = null;
  }
  refreshAnalysisNavigation();
}

function loadAnalysisData(data) {
  analysisMoves = Array.isArray(data.moves) ? data.moves : [];
  fullEvals = Array.isArray(data.evals) ? data.evals : [];
  currentAnalysisIndex = -1;
  
  currentWhitePlayer = data.white_player || "White";
  currentBlackPlayer = data.black_player || "Black";
  
  let whiteHeader = `♔ ${currentWhitePlayer}`;
  let blackHeader = `♚ ${currentBlackPlayer}`;
  if (myUsername) {
    if (currentWhitePlayer.toLowerCase() === myUsername.toLowerCase()) whiteHeader += ' (Вы)';
    if (currentBlackPlayer.toLowerCase() === myUsername.toLowerCase()) blackHeader += ' (Вы)';
  }
  document.getElementById('headerWhite').textContent = whiteHeader;
  document.getElementById('headerBlack').textContent = blackHeader;
  
  renderAnalysisSummary();
  renderMoveTable();
  const moveListContainer = document.querySelector('.move-list-container');
  if (moveListContainer) moveListContainer.scrollTop = 0;
  drawGraph(fullEvals, -1);
  refreshAnalysisNavigation();
  if (analysisMoves.length > 0) showAnalysisMove(0);
  else {
    updateAnalysisProgress(-1);
    refreshAnalysisNavigation();
    const rows = document.getElementById('analysisCategoryRows');
    if (rows) rows.innerHTML = '<div class="analysis-stats-empty">В этой партии нет ходов для подсчёта.</div>';
  }
}

function handleAnalysisDrop(source, target) {
  if (isAnalyzing) return 'snapback';
  
  const moves = analysisGame.moves({ verbose: true });
  const isPromotion = moves.some(m => m.from === source && m.to === target && m.flags.includes('p'));
  if (isPromotion) {
    pendingPromotion = { source, target, context: 'analysis' };
    document.getElementById('promotionModal').style.display = 'flex';
    return 'snapback';
  }

  let move = null;
  try { move = analysisGame.move({ from: source, to: target }); } catch(e) {}
  if (!move) return 'snapback';
  const moveWithUci = { ...move, uci: moveObjectToUci(move) };

  currentAnalysisIndex = -1;
  playMoveSound();
  analysisBoard.position(analysisGame.fen());
  document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
  
  drawArrows(null);
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  document.getElementById('topLinesList').innerHTML = 'Анализ вариации...';
  stopAnalysisPlayback();
  const progressLabel = document.getElementById('analysisProgressLabel');
  const progressValue = document.getElementById('analysisProgressValue');
  const progressRemaining = document.getElementById('analysisProgressRemaining');
  if (progressLabel) progressLabel.textContent = 'Анализ пользовательской позиции';
  if (progressValue) progressValue.textContent = '—';
  if (progressRemaining) progressRemaining.textContent = 'Отдельная вариация';

  evaluateCurrentPosition(analysisGame.fen(), moveWithUci);
}

function moveObjectToUci(move) {
  if (!move || !move.from || !move.to) return '';
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function normaliseEngineLines(payload) {
  let source = payload;
  if (source && !Array.isArray(source)) {
    source = source.top_moves || source.topMoves || source.lines || source.variations || source.moves || source.pv_lines || [];
  }
  if (!Array.isArray(source)) return [];

  const current = analysisGame && typeof analysisGame.fen === 'function'
    ? new Chess(analysisGame.fen())
    : new Chess();

  const normalized = source.map((item) => {
    if (typeof item === 'string') item = { pv: item };
    if (!item || typeof item !== 'object') return null;

    const pvText = Array.isArray(item.pv) ? item.pv.join(' ') : (typeof item.pv === 'string' ? item.pv : (item.variation || item.line || ''));
    let uci = item.uci || item.best_move_uci || item.move_uci || item.best_move || '';
    if (!uci && typeof item.move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(item.move)) uci = item.move;
    if (!uci && pvText) {
      const firstToken = pvText.trim().split(/\s+/)[0];
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(firstToken)) uci = firstToken;
    }

    // Если сервер прислал SAN без UCI, преобразуем первый SAN легальным ходом.
    if (!uci && item.san) {
      try {
        const match = current.moves({ verbose: true }).find(candidate => candidate.san === item.san);
        if (match) uci = moveObjectToUci(match);
      } catch (error) { /* malformed line is ignored below */ }
    }

    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;

    let san = item.san || '';
    if (!san) {
      try {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci[4] || 'q';
        const candidate = new Chess(current.fen());
        const played = candidate.move({ from, to, promotion });
        if (played) san = played.san;
      } catch (error) { /* keep UCI label as fallback */ }
    }

    return {
      ...item,
      uci,
      san: san || uci,
      pv: pvText,
      eval: Number.isFinite(Number(item.eval)) ? Number(item.eval) : 0,
      is_mate: Boolean(item.is_mate ?? item.isMate),
      mate_in: Number(item.mate_in ?? item.mateIn ?? 0)
    };
  }).filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const line of normalized) {
    const key = String(line.uci || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
    if (unique.length === 3) break;
  }
  return unique;
}

function formatEvalString(isMate, mateIn, evalScore) {
  if (isMate) return (mateIn > 0 ? 'М' : '-М') + Math.abs(Number(mateIn) || 0);
  const score = Number.isFinite(Number(evalScore)) ? Number(evalScore) : 0;
  return (score > 0 ? '+' : '') + score.toFixed(1);
}

function updateEvalBar(isMate, mateIn, evalScore) {
  let whitePercent = 50;
  if (isMate) whitePercent = mateIn > 0 ? 100 : 0;
  else whitePercent = Math.max(0, Math.min(100, 50 + (evalScore * 5)));
  
  document.getElementById('evalBarWhite').style.height = whitePercent + '%';
  document.getElementById('evalText').textContent = formatEvalString(isMate, mateIn, evalScore);
}

let currentPositionEvaluationId = 0;
let currentPositionEvaluationController = null;

function cancelCurrentPositionEvaluation() {
  currentPositionEvaluationId += 1;
  if (currentPositionEvaluationController) {
    currentPositionEvaluationController.abort();
    currentPositionEvaluationController = null;
  }
}

async function evaluateCurrentPosition(fen, moveObj = null) {
  const requestId = ++currentPositionEvaluationId;
  if (currentPositionEvaluationController) currentPositionEvaluationController.abort();
  currentPositionEvaluationController = new AbortController();
  const evalText = document.getElementById('evalText');
  const topLines = document.getElementById('topLinesList');
  if (evalText) evalText.textContent = '…';
  if (topLines) {
    topLines.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'engine-lines-state is-loading';
    loading.textContent = 'Stockfish анализирует позицию…';
    topLines.appendChild(loading);
  }

  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen }),
      signal: currentPositionEvaluationController.signal
    });
    const data = await res.json();
    if (requestId !== currentPositionEvaluationId) return;
    if (!res.ok) throw new Error(data.detail || `Ошибка Stockfish: ${res.status}`);

    const isMate = Boolean(data.is_mate ?? data.isMate);
    const mateIn = Number(data.mate_in ?? data.mateIn ?? 0);
    const evaluation = Number.isFinite(Number(data.eval)) ? Number(data.eval) : 0;
    updateEvalBar(isMate, mateIn, evaluation);
    updatePlayerNamesAndMaterial(fen);

    if (moveObj) {
      const uci = moveObj.uci || moveObjectToUci(moveObj);
      if (uci) drawBoardBadge({ uci, is_mate: isMate, mate_in: mateIn, eval: evaluation });
    }

    const lines = normaliseEngineLines(data.top_moves ?? data.topMoves ?? data.lines ?? data.variations ?? []);
    if (lines.length) {
      renderTopLines(lines);
      requestAnimationFrame(() => drawArrows(lines));
    } else {
      renderTopLines([]);
      drawArrows(null);
      if (topLines) {
        topLines.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'engine-lines-state';
        empty.textContent = 'Stockfish оценил позицию, но не вернул легальных продолжений.';
        topLines.appendChild(empty);
      }
    }

    // В пользовательской ветке доска остаётся самостоятельной позицией.
    // Следующий ручной ход снова отправит её FEN в Stockfish.
    if (moveObj) {
      const hint = document.getElementById('analysisPositionHint');
      if (hint) hint.textContent = 'Оценена текущая позиция после вашего хода';
    }
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== currentPositionEvaluationId) return;
    console.error('Ошибка оценки позиции Stockfish:', error);
    if (evalText) evalText.textContent = 'Ошибка';
    if (topLines) {
      topLines.replaceChildren();
      const errorEl = document.createElement('div');
      errorEl.className = 'engine-lines-state is-error';
      errorEl.textContent = error.message || 'Не удалось получить продолжения Stockfish';
      topLines.appendChild(errorEl);
    }
    drawArrows(null);
  }
}

function renderTopLines(rawLines) {
  const container = document.getElementById('topLinesList');
  if (!container) return;
  const lines = normaliseEngineLines(rawLines);
  container.replaceChildren();
  container.style.setProperty('display', 'grid', 'important');
  container.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
  container.style.setProperty('width', '100%', 'important');
  container.style.setProperty('height', 'auto', 'important');
  container.style.setProperty('min-height', '48px', 'important');
  container.style.setProperty('overflow', 'visible', 'important');
  container.style.setProperty('visibility', 'visible', 'important');
  container.style.setProperty('opacity', '1', 'important');
  container.classList.toggle('has-engine-lines', lines.length > 0);
  if (!lines.length) {
    const empty = document.createElement('div');
    empty.className = 'engine-lines-state';
    empty.textContent = analysisGame && analysisGame.game_over && analysisGame.game_over()
      ? 'Партия завершена — легальных продолжений нет.'
      : 'Stockfish не вернул варианты. Нажми «Обновить», чтобы повторить MultiPV-анализ.';
    container.appendChild(empty);
    return;
  }

  lines.forEach((line, idx) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `top-line top-line-button top-line-${idx + 1}`;
    button.dataset.engineRank = String(idx + 1);
    button.title = `Сделать ход №${idx + 1} от Stockfish`;
    button.style.setProperty('display', 'grid', 'important');
    button.style.setProperty('grid-template-columns', '26px minmax(64px, auto) minmax(0, 1fr) auto', 'important');
    button.style.setProperty('width', '100%', 'important');
    button.style.setProperty('min-height', '52px', 'important');
    button.style.setProperty('visibility', 'visible', 'important');
    button.style.setProperty('opacity', '1', 'important');
    button.addEventListener('click', () => window.playTopMove(line.uci));

    const rank = document.createElement('span');
    rank.className = 'top-line-rank';
    rank.textContent = String(idx + 1);
    const move = document.createElement('span');
    move.className = 'top-line-move';
    move.textContent = line.san || line.uci;
    const pv = document.createElement('span');
    pv.className = 'top-line-pv';
    pv.textContent = line.pv || line.san || line.uci;
    const evalEl = document.createElement('span');
    evalEl.className = 'top-line-eval';
    evalEl.textContent = formatEvalString(line.is_mate, line.mate_in, line.eval);
    button.append(rank, move, pv, evalEl);
    container.appendChild(button);
  });
}

window.playTopMove = function(uci) {
  if (isAnalyzing) return;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : 'q';
  
  let move = null;
  try { move = analysisGame.move({ from, to, promotion }); } catch(e) {}
  if (!move) return;
  const moveWithUci = { ...move, uci: moveObjectToUci(move) };
  currentAnalysisIndex = -1;

  playMoveSound();
  analysisBoard.position(analysisGame.fen());
  document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
  
  drawArrows(null);
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  document.getElementById('topLinesList').innerHTML = 'Анализ вариации...';

  evaluateCurrentPosition(analysisGame.fen(), moveWithUci);
};

// ТУТ БЫЛА ОШИБКА, ТЕПЕРЬ ФУНКЦИЯ ЗАКРЫТА И ДОПИСАНА
function renderMoveTable() {
  const tbody = document.getElementById('moveTableBody'); tbody.innerHTML = '';
  
  const classSymbols = {
    'brilliant': { text: '!!', title: 'Бриллиантовый ход' },
    'critical': { text: '‼', title: 'Критический ход' },
    'great': { text: '!', title: 'Замечательный ход' },
    'best': { text: '★', title: 'Лучший ход' },
    'excellent': { text: '✓', title: 'Отличный ход' },
    'good': { text: '✓', title: 'Хороший ход' },
    'inaccuracy': { text: '?!', title: 'Неточность' },
    'mistake': { text: '?', title: 'Ошибка' },
    'miss': { text: '✗', title: 'Промах' },
    'blunder': { text: '??', title: 'Зевок' },
    'book': { text: '📖', title: 'Дебютный ход' },
    'forced': { text: '□', title: 'Вынужденный ход' }
  };

  for (let i = 0; i < analysisMoves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = analysisMoves[i];
    const blackMove = analysisMoves[i + 1];

    let whiteHtml = `<button type="button" class="move-cell" data-move-index="${i}" aria-label="Перейти к ходу ${moveNum}, белые: ${whiteMove.san}">${whiteMove.san}</button>`;
    if (whiteMove.classification && classSymbols[whiteMove.classification]) {
      whiteHtml += `<span class="move-class-badge cls-${whiteMove.classification}" title="${classSymbols[whiteMove.classification].title}">${classSymbols[whiteMove.classification].text}</span>`;
    }

    let blackHtml = '...';
    if (blackMove) {
      blackHtml = `<button type="button" class="move-cell" data-move-index="${i+1}" aria-label="Перейти к ходу ${moveNum}, чёрные: ${blackMove.san}">${blackMove.san}</button>`;
      if (blackMove.classification && classSymbols[blackMove.classification]) {
        blackHtml += `<span class="move-class-badge cls-${blackMove.classification}" title="${classSymbols[blackMove.classification].title}">${classSymbols[blackMove.classification].text}</span>`;
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-num">${moveNum}</td>
      <td class="col-white">${whiteHtml}</td>
      <td class="col-black">${blackHtml}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ДОБАВЛЕНА НЕДОСТАЮЩАЯ ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ХОДОВ
window.showAnalysisMove = function(index) {
  const targetIndex = Number(index);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= analysisMoves.length) return;
  cancelCurrentPositionEvaluation();
  currentAnalysisIndex = targetIndex;
  const moveData = analysisMoves[targetIndex];

  document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
  const selectedCell = document.querySelector(`.move-cell[data-move-index="${targetIndex}"]`);
  if (selectedCell) {
    selectedCell.classList.add('active');
    const list = document.querySelector('.move-list-container');
    if (list) {
      const cellRect = selectedCell.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      if (cellRect.top < listRect.top) list.scrollTop -= (listRect.top - cellRect.top) + 12;
      else if (cellRect.bottom > listRect.bottom) list.scrollTop += (cellRect.bottom - listRect.bottom) + 12;
    }
  }

  // The backend already returns the resulting FEN for each move. Prefer it;
  // replay SAN only for older cached records without FEN.
  let nextGame = null;
  if (moveData && typeof moveData.fen === 'string' && moveData.fen.trim()) {
    try {
      const candidate = new Chess(moveData.fen);
      if (candidate && candidate.board) nextGame = candidate;
    } catch (error) {
      console.warn('Некорректный FEN хода; восстанавливаю позицию по SAN.', error);
    }
  }
  if (!nextGame) {
    nextGame = new Chess();
    for (let i = 0; i <= targetIndex; i++) {
      if (!analysisMoves[i]?.san || !nextGame.move(analysisMoves[i].san)) {
        console.error('Не удалось восстановить позицию после хода', i + 1);
        return;
      }
    }
  }
  analysisGame = nextGame;
  if (analysisBoard) analysisBoard.position(analysisGame.fen());

  updateEvalBar(!!moveData.is_mate, Number(moveData.mate_in || 0), Number(moveData.eval || 0));
  updatePlayerNamesAndMaterial(analysisGame.fen());
  drawGraph(fullEvals, targetIndex);
  drawBoardBadge(moveData);

  const savedEngineLines = normaliseEngineLines(moveData.next_top_moves || []);
  if (savedEngineLines.length === 3) {
    renderTopLines(savedEngineLines);
    requestAnimationFrame(() => drawArrows(savedEngineLines));
  } else {
    const topLines = document.getElementById('topLinesList');
    if (topLines) topLines.textContent = 'Запрашиваю лучшие продолжения Stockfish…';
    drawArrows(null);
    // Для старых/неполных записей партии запрашиваем MultiPV прямо для
    // выбранной позиции. Поэтому рекомендации видны даже без next_top_moves в кеше.
    evaluateCurrentPosition(analysisGame.fen(), null);
  }

  updateAnalysisProgress(targetIndex);
  animateAnalysisMove(moveData);
  refreshAnalysisNavigation();
};

// Навигация по уже проанализированной партии.
(function initAnalysisNavigationControls() {
  const start = document.getElementById('analysisStart');
  const prev = document.getElementById('analysisPrev');
  const next = document.getElementById('analysisNext');
  const end = document.getElementById('analysisEnd');
  const play = document.getElementById('analysisPlay');
  const moveBody = document.getElementById('moveTableBody');
  if (moveBody && !moveBody.dataset.navigationBound) {
    moveBody.dataset.navigationBound = '1';
    moveBody.addEventListener('click', event => {
      const cell = event.target.closest('.move-cell[data-move-index]');
      if (!cell) return;
      const index = Number(cell.dataset.moveIndex);
      if (Number.isInteger(index)) window.showAnalysisMove(index);
    });
  }

  if (start) start.addEventListener('click', () => {
    stopAnalysisPlayback();
    if (analysisMoves.length) window.showAnalysisMove(0);
  });
  if (prev) prev.addEventListener('click', () => {
    stopAnalysisPlayback();
    if (currentAnalysisIndex > 0) window.showAnalysisMove(currentAnalysisIndex - 1);
  });
  if (next) next.addEventListener('click', () => {
    stopAnalysisPlayback();
    if (currentAnalysisIndex < analysisMoves.length - 1) window.showAnalysisMove(currentAnalysisIndex + 1);
  });
  if (end) end.addEventListener('click', () => {
    stopAnalysisPlayback();
    if (analysisMoves.length) window.showAnalysisMove(analysisMoves.length - 1);
  });
  if (play) play.addEventListener('click', () => {
    if (analysisPlaybackTimer) {
      stopAnalysisPlayback();
      return;
    }
    if (!analysisMoves.length) return;
    if (currentAnalysisIndex >= analysisMoves.length - 1) window.showAnalysisMove(0);
    analysisPlaybackTimer = setInterval(() => {
      if (currentAnalysisIndex >= analysisMoves.length - 1) {
        stopAnalysisPlayback();
        return;
      }
      window.showAnalysisMove(currentAnalysisIndex + 1);
      if (currentAnalysisIndex >= analysisMoves.length - 1) stopAnalysisPlayback();
    }, 850);
    refreshAnalysisNavigation();
  });

    refreshAnalysisNavigation();
})();

(function initMoveListScrolling() {
  const list = document.querySelector('.move-list-container');
  if (!list || list.dataset.wheelBound) return;
  list.dataset.wheelBound = '1';
  list.addEventListener('wheel', event => {
    if (list.scrollHeight <= list.clientHeight + 1) return;
    const maxScroll = list.scrollHeight - list.clientHeight;
    const canScrollUp = list.scrollTop > 0;
    const canScrollDown = list.scrollTop < maxScroll - 1;
    const movingInsideList = (event.deltaY < 0 && canScrollUp) || (event.deltaY > 0 && canScrollDown);
    if (!movingInsideList) return; // At the top/bottom, let the page itself scroll.
    event.preventDefault();
    event.stopPropagation();
    list.scrollTop += event.deltaY;
  }, { passive: false });

  const toTop = document.getElementById('analysisMoveTop');
  const toBottom = document.getElementById('analysisMoveBottom');
  if (toTop) toTop.addEventListener('click', () => {
    list.scrollTo({ top: 0, behavior: 'smooth' });
    if (analysisMoves.length) window.showAnalysisMove(0);
  });
  if (toBottom) toBottom.addEventListener('click', () => {
    if (analysisMoves.length) window.showAnalysisMove(analysisMoves.length - 1);
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  });
})();


document.addEventListener('click', event => {
  const tabButton = event.target.closest('.tab-btn[data-tab="analysis"]');
  if (!tabButton) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (analysisBoard) analysisBoard.resize();
    if (analysisArrowLines.length) drawArrows(analysisArrowLines);
    if (currentAnalysisIndex >= 0) animateAnalysisMove(analysisMoves[currentAnalysisIndex]);
  }));
});
