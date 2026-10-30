const daysMap = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const monthsMap = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

let PLAN = [], currentDay = 1, totalDays = 0;
let puzzleBoard = null, puzzleGame = null, currentPuzzle = null, puzzleSolved = false;
let endgameBoard = null, endgameGame = null, currentEndgame = null;
let openingBoard = null, currentOpening = null, currentMoveIndex = 0;
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

let pendingPromotion = null;

const PIECE_THEME = '/img/pieces/{piece}.png';
const moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3');

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

// ========== ФУНКЦИОНАЛ РИСОВАНИЯ ПКМ ==========
function initRightClickDrawing(boardId) {
  const boardEl = document.getElementById(boardId);
  const svgEl = document.getElementById(`userDraw_${boardId}`);
  if (!boardEl || !svgEl) return;

  svgEl.setAttribute('viewBox', '0 0 8 8');
  svgEl.innerHTML = ''; 

  let isDrawing = false;
  let startX = -1, startY = -1;

  const getSquareCoords = (e) => {
    const rect = boardEl.getBoundingClientRect();
    const size = rect.width / 8;
    let x = Math.floor((e.clientX - rect.left) / size);
    let y = Math.floor((e.clientY - rect.top) / size);
    
    if (boardId === 'analysisBoard' && isBoardFlipped) {
      x = 7 - x;
      y = 7 - y;
    }
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return { x, y };
  };

  // capture: true - перехватываем ПКМ до библиотеки
  boardEl.addEventListener('mousedown', e => {
    if (e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    const sq = getSquareCoords(e);
    if (!sq) return;

    isDrawing = true;
    startX = sq.x; startY = sq.y;
    svgEl.innerHTML = ''; 
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', startX + 0.5); circle.setAttribute('cy', startY + 0.5);
    circle.setAttribute('r', '0.4');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'rgba(255, 69, 0, 0.8)');
    circle.setAttribute('stroke-width', '0.15');
    svgEl.appendChild(circle);
  }, true);

  boardEl.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    const sq = getSquareCoords(e);
    if (!sq) return;

    const currentX = sq.x; const currentY = sq.y;
    svgEl.innerHTML = '';

    const x1 = startX + 0.5;
    const y1 = startY + 0.5;
    const x2 = currentX + 0.5;
    const y2 = currentY + 0.5;

    if (startX === currentX && startY === currentY) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x1); circle.setAttribute('cy', y1);
      circle.setAttribute('r', '0.4');
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', 'rgba(255, 69, 0, 0.8)');
      circle.setAttribute('stroke-width', '0.15');
      svgEl.appendChild(circle);
    } else {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('stroke', 'rgba(255, 69, 0, 0.8)');
      path.setAttribute('stroke-width', '0.15');
      path.setAttribute('fill', 'none');

      const dx = Math.abs(currentX - startX);
      const dy = Math.abs(currentY - startY);
      const isKnightMove = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);

      let endLineX = x2, endLineY = y2;

      if (isKnightMove) {
        if (dx === 2) {
          path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`);
          endLineX = x2; endLineY = y2;
        } else {
          path.setAttribute('d', `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`);
          endLineX = x2; endLineY = y2;
        }
      } else {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        endLineX = x2 - 0.2 * Math.cos(angle);
        endLineY = y2 - 0.2 * Math.sin(angle);
        path.setAttribute('d', `M ${x1} ${y1} L ${endLineX} ${endLineY}`);
      }
      svgEl.appendChild(path);

      // Математический треугольник
      let angle = 0;
      if (isKnightMove) {
         if (dx === 2) angle = (currentY > startY) ? Math.PI/2 : -Math.PI/2;
         else angle = (currentX > startX) ? 0 : Math.PI;
      } else {
         angle = Math.atan2(y2 - y1, x2 - x1);
      }

      const len = 0.4;
      const ang = Math.PI / 6;
      
      const ax1 = x2 - len * Math.cos(angle - ang);
      const ay1 = y2 - len * Math.sin(angle - ang);
      const ax2 = x2 - len * Math.cos(angle + ang);
      const ay2 = y2 - len * Math.sin(angle + ang);

      const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      head.setAttribute('points', `${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`);
      head.setAttribute('fill', 'rgba(255, 69, 0, 0.8)');
      svgEl.appendChild(head);
    }
  }, true);

  document.addEventListener('mouseup', e => {
    if (e.button === 2 && isDrawing) {
      isDrawing = false;
    }
  });
}

function clearUserDrawings(boardId) {
  const svg = document.getElementById(`userDraw_${boardId}`);
  if (svg) svg.innerHTML = '';
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
function selectEndgame(eg) {
  currentEndgame = eg;
  document.querySelectorAll('#endgameList .list-item').forEach(i => i.classList.remove('active'));
  const el = document.querySelector(`#endgameList .list-item[data-id="${eg.id}"]`);
  if (el) el.classList.add('active');
  clearUserDrawings('endgameBoard');

  let fenToUse = eg.fen;
  let hintToUse = eg.hint;

  if (eg.id === 1) {
    const variations = [
      { fen: "8/8/8/8/8/4K3/4P3/4k3 w - - 0 1", hint: "Ход белых. Защити пешку королем и проведи её в ферзи." },
      { fen: "8/8/8/8/4K3/8/4P3/4k3 w - - 0 1", hint: "Ход белых. Король должен прикрывать пешку. Проведи пешку в ферзи." },
      { fen: "8/8/8/8/8/8/4P3/4K2k w - - 0 1", hint: "Ход белых. Проведи пешку в ферзи, прикрывая её королем." },
      { fen: "8/8/8/8/8/8/3P4/3K2k1 w - - 0 1", hint: "Ход белых. Пешка на d2. Проведи её в ферзи." }
    ];
    const v = variations[Math.floor(Math.random() * variations.length)];
    fenToUse = v.fen;
    hintToUse = v.hint;
  }

  endgameGame = new Chess(fenToUse);
  if (!endgameBoard) {
    endgameBoard = Chessboard('endgameBoard', {
      position: fenToUse, draggable: true,
      onDragStart: (source, piece) => {
        clearUserDrawings('endgameBoard');
        if (endgameGame.turn() === 'w' && piece.search(/^b/) !== -1) return false;
        if (endgameGame.turn() === 'b' && piece.search(/^w/) !== -1) return false;
        highlightMoves(endgameGame, source);
      },
      onDrop: handleEndgameDrop, onSnapEnd: () => clearHighlights(), pieceTheme: PIECE_THEME
    });
  } else {
    endgameBoard.position(fenToUse);
    endgameBoard.resize();
  }
  document.getElementById('endgameFeedback').textContent = hintToUse;
  document.getElementById('endgameFeedback').className = 'feedback info';
}
function handleEndgameDrop(source, target) {
  if (!currentEndgame) return 'snapback';
  let move = null;
  try { move = endgameGame.move({ from: source, to: target, promotion: 'q' }); } catch(e) {}
  if (!move) return 'snapback';
  
  document.getElementById('endgameFeedback').textContent = '';
  
  if (!endgameGame.game_over() && endgameGame.turn() === 'b') {
    setTimeout(async () => {
      try {
        const res = await fetch('/api/bot_move', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ fen: endgameGame.fen(), level: 6 })
        });
        const data = await res.json();
        if (data.move) {
          endgameGame.move({ from: data.move.slice(0,2), to: data.move.slice(2,4), promotion: 'q' });
          endgameBoard.position(endgameGame.fen());
        }
      } catch(e) {}
    }, 500);
  } else if (endgameGame.game_over()) {
    document.getElementById('endgameFeedback').textContent = endgameGame.in_checkmate() ? '✅ Мат! Отлично!' : 'Ничья.';
  }
}
document.getElementById('endgameResetBtn').onclick = () => { if (currentEndgame) selectEndgame(currentEndgame); };

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
      el.classList.add('active'); selectOpening(filtered.find(o => o.id === el.dataset.id));
    };
  });
  if (filtered.length > 0) {
    const firstEl = document.querySelector(`#openingList .list-item[data-id="${filtered[0].id}"]`);
    if(firstEl) firstEl.classList.add('active');
    selectOpening(filtered[0]);
  }
}
function selectOpening(opening) {
  currentOpening = opening; currentMoveIndex = 0;
  if (!openingBoard) openingBoard = Chessboard('openingBoard', { position: 'start', draggable: false, pieceTheme: PIECE_THEME });
  else openingBoard.resize();
  document.getElementById('openingNav').style.display = 'flex'; updateOpeningView();
}
function updateOpeningView() {
  if (!currentOpening) return;
  const game = new Chess();
  for (let i = 0; i < currentMoveIndex; i++) game.move(currentOpening.moves[i]);
  openingBoard.position(game.fen());
  const movesHTML = currentOpening.moves.map((m, i) => {
    const cls = i < currentMoveIndex ? 'current' : '';
    const moveNum = i % 2 === 0 ? (Math.floor(i/2)+1) + '. ' : '';
    return `<span class="move-chip ${cls}" data-idx="${i+1}">${moveNum}${m}</span>`;
  }).join('');
  document.getElementById('openingDesc').innerHTML = `
    <p><strong>${currentOpening.name}</strong></p><p>${currentOpening.description}</p>
    <p><strong>План белых:</strong> ${currentOpening.plans_white}</p>
    <p><strong>План чёрных:</strong> ${currentOpening.plans_black}</p>
    <div class="move-list">${movesHTML}</div>
  `;
  document.querySelectorAll('#openingDesc .move-chip').forEach(chip => {
    chip.onclick = () => { currentMoveIndex = +chip.dataset.idx; updateOpeningView(); };
  });
}
document.getElementById('openingStart').onclick = () => { currentMoveIndex = 0; updateOpeningView(); };
document.getElementById('openingPrev').onclick = () => { if (currentMoveIndex > 0) { currentMoveIndex--; updateOpeningView(); } };
document.getElementById('openingNext').onclick = () => { if (currentOpening && currentMoveIndex < currentOpening.moves.length) { currentMoveIndex++; updateOpeningView(); } };
document.getElementById('openingEnd').onclick = () => { if (currentOpening) { currentMoveIndex = currentOpening.moves.length; updateOpeningView(); } };

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
  svg.innerHTML = '';
  if (!lines || lines.length === 0) return;
  
  const boardWidth = document.getElementById('analysisBoard').offsetWidth;
  const squareSize = boardWidth / 8;
  const files = ['a','b','c','d','e','f','g','h'];
  
  lines.forEach((line, index) => {
    const from = line.uci.substring(0, 2);
    const to = line.uci.substring(2, 4);
    
    let startX = (files.indexOf(from[0]) * squareSize) + squareSize / 2;
    let startY = ((8 - parseInt(from[1])) * squareSize) + squareSize / 2;
    let endX = (files.indexOf(to[0]) * squareSize) + squareSize / 2;
    let endY = ((8 - parseInt(to[1])) * squareSize) + squareSize / 2;
    
    if (isBoardFlipped) {
      startX = boardWidth - startX; startY = boardWidth - startY;
      endX = boardWidth - endX; endY = boardWidth - endY;
    }
    
    const thickness = index === 0 ? 10 : (index === 1 ? 6 : 3);
    const color = index === 0 ? 'rgba(129, 182, 76, 0.9)' : (index === 1 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(168, 85, 247, 0.7)');
    
    const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineEl.setAttribute('x1', startX); lineEl.setAttribute('y1', startY);
    lineEl.setAttribute('x2', endX); lineEl.setAttribute('y2', endY);
    lineEl.setAttribute('stroke', color); lineEl.setAttribute('stroke-width', thickness);
    lineEl.setAttribute('stroke-linecap', 'round'); lineEl.setAttribute('marker-end', `url(#arrowhead${index})`);
    svg.appendChild(lineEl);
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `arrowhead${index}`); marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '4'); marker.setAttribute('refX', '2');
    marker.setAttribute('refY', '2'); marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0,0 4,2 0,4'); polygon.setAttribute('fill', color);
    marker.appendChild(polygon); defs.appendChild(marker); svg.appendChild(defs);
  });
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
  if (isBoardFlipped) {
    xPct = (7 - file) * 100; yPct = rank * 100;
  } else {
    xPct = file * 100; yPct = (7 - rank) * 100;
  }

  const badge = document.createElement('div');
  badge.className = 'board-badge';

  let text = ''; let cls = '';

  const classMap = {
    'brilliant': { t: '!!', c: 'badge-brilliant' }, 'great': { t: '!', c: 'badge-great' },
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
  
  badge.style.left = `calc(${xPct}% + 87.5% - 10px)`; 
  badge.style.top = `calc(${yPct}% + 10px)`;
  
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
  document.getElementById('evalText').textContent = 'Анализ...';
  document.getElementById('topLinesList').innerHTML = '<span style="color:#81b64c; font-weight:600;">Анализ...</span>';
  document.getElementById('moveTableBody').innerHTML = '';
  document.getElementById('arrowOverlay').innerHTML = '';
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  isAnalyzing = true;

  const cacheKey = `analysis_${gameUrl || pgn.slice(0, 50)}`;
  const cachedData = localStorage.getItem(cacheKey);
  
  if (cachedData) {
    const data = JSON.parse(cachedData);
    loadAnalysisData(data);
    isAnalyzing = false;
    return;
  }

  try {
    const res = await fetch('/api/analyze', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({pgn}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Ошибка анализа');
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    loadAnalysisData(data);
  } catch (e) { 
    alert('Ошибка: ' + e.message); 
    document.getElementById('evalText').textContent = '0.0';
    document.getElementById('topLinesList').innerHTML = 'Ошибка';
  }
  finally { isAnalyzing = false; }
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

function loadAnalysisData(data) {
  analysisMoves = data.moves; 
  fullEvals = data.evals;
  
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
  
  renderMoveTable();
  drawGraph(fullEvals, -1);
  if (analysisMoves.length > 0) showAnalysisMove(0);
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

  playMoveSound();
  analysisBoard.position(analysisGame.fen());
  document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
  
  document.getElementById('arrowOverlay').innerHTML = '';
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  document.getElementById('topLinesList').innerHTML = 'Анализ вариации...';

  evaluateCurrentPosition(analysisGame.fen(), move);
}

function formatEvalString(isMate, mateIn, evalScore) {
  if (isMate) return (mateIn > 0 ? "М" : "-М") + Math.abs(mateIn);
  return (evalScore > 0 ? '+' : '') + evalScore.toFixed(1);
}

function updateEvalBar(isMate, mateIn, evalScore) {
  let whitePercent = 50;
  if (isMate) whitePercent = mateIn > 0 ? 100 : 0;
  else whitePercent = Math.max(0, Math.min(100, 50 + (evalScore * 5)));
  
  document.getElementById('evalBarWhite').style.height = whitePercent + '%';
  document.getElementById('evalText').textContent = formatEvalString(isMate, mateIn, evalScore);
}

async function evaluateCurrentPosition(fen, moveObj = null) {
  document.getElementById('evalText').textContent = '...';
  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fen})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    
    updateEvalBar(data.is_mate, data.mate_in, data.eval);
    updatePlayerNamesAndMaterial(fen);
    
    if (moveObj && moveObj.uci) {
      drawBoardBadge({
        uci: moveObj.uci,
        is_mate: data.is_mate,
        mate_in: data.mate_in,
        eval: data.eval
      });
    }
    
    if (data.top_moves) {
      renderTopLines(data.top_moves);
      drawArrows(data.top_moves);
    }
  } catch (e) {
    document.getElementById('evalText').textContent = 'Error';
  }
}

function renderTopLines(lines) {
  const container = document.getElementById('topLinesList');
  if (!lines || lines.length === 0) { container.innerHTML = 'Нет данных'; return; }
  
  container.innerHTML = lines.map((line, idx) => `
    <div class="top-line" onclick="playTopMove('${line.uci}')" title="Сделать ход">
      <span class="top-line-move" style="color: ${idx === 0 ? '#81b64c' : '#fff'}">${idx + 1}. ${line.san}</span>
      <span class="top-line-pv">${line.pv}</span>
      <span class="top-line-eval">${formatEvalString(line.is_mate, line.mate_in, line.eval)}</span>
    </div>
  `).join('');
}

window.playTopMove = function(uci) {
  if (isAnalyzing) return;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : 'q';
  
  let move = null;
  try { move = analysisGame.move({ from, to, promotion }); } catch(e) {}
  if (!move) return;

  playMoveSound();
  analysisBoard.position(analysisGame.fen());
  document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
  
  document.getElementById('arrowOverlay').innerHTML = '';
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  document.getElementById('topLinesList').innerHTML = 'Анализ вариации...';

  evaluateCurrentPosition(analysisGame.fen(), move);
};

function renderMoveTable() {
  const tbody = document.getElementById('moveTableBody'); tbody.innerHTML = '';
  
  const classSymbols = {
    'brilliant': { text: '!!', title: 'Бриллиантовый ход' },
    'great': { text: '!', title: 'Великий ход' },
    'best': { text: '★', title: 'Лучший ход' },
    'excellent': { text: '✓', title: 'Отличный ход' },
    'good': { text: '✓', title: 'Хороший ход' },
    'inaccuracy': { text: '?!', title: 'Неточность' },
    'mistake': { text: '?', title: 'Ошибка' },
    'miss': { text: '✗', title: 'Упущение' },
    'blunder': { text: '??', title: 'Зевок' },
    'book': { text: '📖', title: 'Теория' },
    'forced': { text: '□', title: 'Единственный ход' }
  };

  for (let i = 0; i < analysisMoves.length; i += 2) {
    const whiteMove = analysisMoves[i];
    const blackMove = analysisMoves[i+1];
    
    const tr = document.createElement('tr');
    const moveNum = Math.floor(i/2) + 1;
    
    let whiteHtml = '';
    if (whiteMove) {
      const cls = classSymbols[whiteMove.classification] || { text: '', title: '' };
      whiteHtml = `<div class="move-cell" onclick="showAnalysisMove(${i})" id="move-cell-${i}">
        <span class="move-san">${whiteMove.san} <span class="move-class-badge ${whiteMove.classification ? 'cls-' + whiteMove.classification : ''}" title="${cls.title}">${cls.text}</span></span>
        <span class="move-time">${whiteMove.time_spent ? formatSpentTime(whiteMove.time_spent) : ''}</span>
      </div>`;
    }
    
    let blackHtml = '';
    if (blackMove) {
      const cls = classSymbols[blackMove.classification] || { text: '', title: '' };
      blackHtml = `<div class="move-cell" onclick="showAnalysisMove(${i+1})" id="move-cell-${i+1}">
        <span class="move-san">${blackMove.san} <span class="move-class-badge ${blackMove.classification ? 'cls-' + blackMove.classification : ''}" title="${cls.title}">${cls.text}</span></span>
        <span class="move-time">${blackMove.time_spent ? formatSpentTime(blackMove.time_spent) : ''}</span>
      </div>`;
    }

    tr.innerHTML = `<td class="col-num">${moveNum}</td><td class="col-white">${whiteHtml}</td><td class="col-black">${blackHtml}</td>`;
    tbody.appendChild(tr);
  }
}

window.showAnalysisMove = function(index) {
  if (index < 0 || index >= analysisMoves.length) return;
  currentAnalysisIndex = index;
  const moveData = analysisMoves[index];
  
  analysisGame = new Chess();
  for (let i = 0; i <= index; i++) {
    try { analysisGame.move(analysisMoves[i].san); } catch(e) {}
  }
  
  analysisBoard.position(analysisGame.fen(), false);
  
  document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
  const activeCell = document.getElementById(`move-cell-${index}`);
  if (activeCell) activeCell.classList.add('active');
  
  updateEvalBar(moveData.is_mate, moveData.mate_in, moveData.eval);
  drawBoardBadge(moveData);
  drawArrows(moveData.next_top_moves);
  renderTopLines(moveData.next_top_moves);
  drawGraph(fullEvals, index);
};

document.getElementById('analysisStart').onclick = () => showAnalysisMove(0);
document.getElementById('analysisEnd').onclick = () => showAnalysisMove(analysisMoves.length - 1);
document.getElementById('analysisPrev').onclick = () => { if (currentAnalysisIndex > 0) showAnalysisMove(currentAnalysisIndex - 1); };
document.getElementById('analysisNext').onclick = () => { if (currentAnalysisIndex < analysisMoves.length - 1) showAnalysisMove(currentAnalysisIndex + 1); };

document.getElementById('evalGraph').onclick = (e) => {
  if (analysisMoves.length === 0) return;
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = x / rect.width;
  const index = Math.floor(pct * analysisMoves.length);
  if (index >= 0 && index < analysisMoves.length) showAnalysisMove(index);
};

document.querySelectorAll('.promotion-btn').forEach(btn => {
  btn.onclick = () => {
    if (!pendingPromotion) return;
    const piece = btn.dataset.piece;
    const { source, target, context } = pendingPromotion;
    
    document.getElementById('promotionModal').style.display = 'none';
    pendingPromotion = null;

    if (context === 'puzzle') {
      let move = null;
      try { move = puzzleGame.move({ from: source, to: target, promotion: piece }); } catch(e) {}
      if (!move) return;
      if ((source + target + piece).toLowerCase() === currentPuzzle.solution.toLowerCase() || source + target === currentPuzzle.solution) {
        puzzleSolved = true; puzzleBoard.position(puzzleGame.fen());
        setFeedback('✅ Верно! Это мат.', 'ok');
      } else {
        puzzleGame.undo(); setFeedback('❌ Неверно, попробуй другой ход.', 'err');
        puzzleBoard.position(puzzleGame.fen()); 
      }
    } else if (context === 'analysis') {
      let move = null;
      try { move = analysisGame.move({ from: source, to: target, promotion: piece }); } catch(e) {}
      if (!move) return;
      
      playMoveSound();
      analysisBoard.position(analysisGame.fen());
      document.querySelectorAll('.move-cell').forEach(el => el.classList.remove('active'));
      document.getElementById('arrowOverlay').innerHTML = '';
      const overlay = document.querySelector('#analysisBoard .custom-overlay');
      if (overlay) overlay.innerHTML = '';
      document.getElementById('topLinesList').innerHTML = 'Анализ вариации...';
      
      evaluateCurrentPosition(analysisGame.fen(), move);
    }
  };
});