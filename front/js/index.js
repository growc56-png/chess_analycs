const daysMap = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const monthsMap = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

let PLAN = [], currentDay = 1, totalDays = 0;
let GOAL_PROFILE = null;
let puzzleBoard = null, puzzleGame = null, currentPuzzle = null, puzzleSolved = false;
let endgameBoard = null, endgameGame = null, endgameVirtualGame = null, currentEndgame = null;
let myEndgamesBoard = null, myEndgamesGame = null, myEndgamesCurrent = null, myEndgameMoveIndex = 0;
let myEndgamePracticeGame = null;
let myEndgamePracticeVirtualGame = null;
let myEndgamePracticeActive = false;
let myEndgamePracticeBotActive = false;
let myEndgamePracticeColor = 'w';
let myEndgamePracticeQueue = [];
let myEndgamePracticeVersion = 0;
let myEndgamePracticeTimeLeft = 300;
let myEndgamePracticeTimeLimit = 300;
let myEndgamePracticeTimerId = null;
let myEndgamePracticeTimerActive = false;
let myEndgamePracticeLastTick = 0;

let endgamePremoveQueue = [], endgameBotRequestActive = false, endgamePositionVersion = 0;
let endgamePlayerColor = 'w';
let openingBoard = null, currentOpening = null, currentMoveIndex = 0;
let openingGame = new Chess();
let isOpponentMoving = false;
let openingPremoveQueue = [];
let openingVirtualGame = null;
let openingBotMoveVersion = 0;
let blindfoldBoard = null, blindfoldGame = new Chess();
let analysisBoard = null;
let puzzlesData = [], endgamesData = [], openingsData = [];
let currentSide = 'white';
let analysisMoves = [];
let currentAnalysisIndex = -1;
let latestGamesCache = null;

let analysisGame = new Chess();
let currentAnalysisPgn = '';
let activeAnalysisChallenge = null;
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

window.addEventListener('load', async () => {
  if (typeof jQuery === 'undefined') return showError('Ошибка: jQuery не загрузился.');
  if (typeof Chessboard === 'undefined') return showError('Ошибка: Chessboard.js не загрузился.');
  if (typeof Chess === 'undefined') return showError('Ошибка: Chess.js не загрузился.');

  if (window.requireChessAuth) {
    const authenticated = await window.requireChessAuth();
    if (!authenticated) return;
  }

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

// Единый модуль пометок используется всеми досками сайта.
function initRightClickDrawing(boardId) {
  return window.ChessBoardDrawing ? window.ChessBoardDrawing.init(boardId) : false;
}

function clearUserDrawings(boardId) {
  if (window.ChessBoardDrawing) window.ChessBoardDrawing.clear(boardId);
  else {
    const svg = document.getElementById('userDraw_' + boardId);
    if (svg) svg.replaceChildren();
  }
}

async function initApp() {
  try {
    const todayName = getTodayInfo();
    
    const [planRes, puzzlesRes, endgamesRes, openingsRes, recRes] = await Promise.all([
      fetch('/api/plan'), fetch('/api/puzzles'), fetch('/api/endgames'), fetch('/api/openings'), fetch('/api/recommendations')
    ]);

    const checkResponse = async (res, name) => {
      if (!res.ok) throw new Error(`Сервер вернул ошибку ${res.status} для ${name}`);
      const text = await res.text();
      if (text.startsWith('<!DOCTYPE')) throw new Error('Запустите бэкенд через uvicorn и откройте http://127.0.0.1:8000');
      return JSON.parse(text);
    };

    const planData = await checkResponse(planRes, 'plan');
    PLAN = planData.plan || [];
    GOAL_PROFILE = planData.goal || null;
    totalDays = PLAN.length;
    renderGoalSummary(GOAL_PROFILE);
    puzzlesData = (await checkResponse(puzzlesRes, 'puzzles')).puzzles;
    endgamesData = (await checkResponse(endgamesRes, 'endgames')).endgames;
    openingsData = (await checkResponse(openingsRes, 'openings')).openings;
    const recData = await checkResponse(recRes, 'recommendations');

    updateRecommendationsUI(recData.recommendations);
    renderPlan(todayName);
    window.dispatchEvent(new CustomEvent('chess-plan-updated'));
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

// --- ВИНСТРИК: источник данных — реальные партии Chess.com ---
const STREAK_USERNAME_KEY = 'chessTrainer.streak.username.v1';
let streakLoading = false;
let streakLoadedAt = 0;
let streakLoadedUsername = '';

function setStreakStatus(message, type) {
  const el = document.getElementById('streakStatus');
  if (!el) return;
  el.textContent = message;
  el.className = 'streak-status' + (type ? ' ' + type : '');
}

function updateStreakUI(data) {
  const wins = Math.max(0, Number(data.wins) || 0);
  const losses = Math.max(0, Number(data.losses) || 0);
  const draws = Math.max(0, Number(data.draws) || 0);
  const total = wins + losses + draws;
  const winrate = total ? ((wins / total) * 100).toFixed(1) : '0.0';
  document.getElementById('streak-total').textContent = String(total);
  document.getElementById('streak-wins').textContent = String(wins);
  document.getElementById('streak-losses').textContent = String(losses);
  document.getElementById('streak-draws').textContent = String(draws);
  document.getElementById('streak-current').textContent = String(Math.max(0, Number(data.current_streak) || 0));
  document.getElementById('streak-max').textContent = String(Math.max(0, Number(data.max_streak) || 0));
  document.getElementById('streak-winrate').textContent = winrate + '%';
}

function classifyChessComResult(game, username) {
  const wanted = String(username || '').trim().toLowerCase();
  const white = String(game && game.white && game.white.username || '').trim().toLowerCase();
  const black = String(game && game.black && game.black.username || '').trim().toLowerCase();
  let result = '';
  if (wanted && wanted === white) result = game.white && game.white.result;
  else if (wanted && wanted === black) result = game.black && game.black.result;
  else return null;
  result = String(result || '').toLowerCase();
  if (result === 'win') return 'win';
  if (['checkmated', 'resigned', 'timeout', 'abandoned', 'lose', 'loss', 'bughousepartnerlose'].includes(result)) return 'loss';
  if (['draw', 'stalemate', 'insufficient', '50move', 'repetition', 'timevsinsufficient'].includes(result)) return 'draw';
  return null;
}

function calculateTodayStreak(games, username) {
  const today = new Date();
  const seen = new Set();
  const todayGames = (Array.isArray(games) ? games : []).filter(game => {
    const endTime = Number(game && game.end_time);
    if (!Number.isFinite(endTime) || endTime <= 0) return false;
    const date = new Date(endTime * 1000);
    if (date.getFullYear() !== today.getFullYear()
      || date.getMonth() !== today.getMonth()
      || date.getDate() !== today.getDate()) return false;
    const identity = String(game.url || game.uuid || game.id || [
      endTime, game.white && game.white.username, game.black && game.black.username, game.time_class || ''
    ].join('|'));
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).sort((a, b) => Number(a.end_time) - Number(b.end_time));

  let wins = 0, losses = 0, draws = 0, currentStreak = 0, maxStreak = 0;
  todayGames.forEach(game => {
    const result = classifyChessComResult(game, username);
    if (!result) return;
    if (result === 'win') {
      wins++;
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      if (result === 'loss') losses++;
      else draws++;
      currentStreak = 0;
    }
  });
  return { wins, losses, draws, current_streak: currentStreak, max_streak: maxStreak };
}

async function loadStreak(forceRefresh = false) {
  const input = document.getElementById('streakUsername');
  let username = input ? input.value.trim() : '';
  if (!username) {
    try { username = localStorage.getItem(STREAK_USERNAME_KEY) || ''; } catch (error) { /* storage may be disabled */ }
  }
  if (input && username) input.value = username;
  if (!username) {
    updateStreakUI({ wins: 0, losses: 0, draws: 0, current_streak: 0, max_streak: 0 });
    setStreakStatus('Введи ник Chess.com, чтобы посчитать реальные партии за сегодня.');
    return;
  }
  if (streakLoading) return;
  if (!forceRefresh && streakLoadedUsername === username.toLowerCase() && Date.now() - streakLoadedAt < 60000) return;

  const button = document.getElementById('analyzeTodayBtn');
  const oldText = button ? button.textContent : '';
  streakLoading = true;
  if (button) { button.disabled = true; button.textContent = 'Загружаю партии…'; }
  setStreakStatus('Сверяю завершённые партии с Chess.com…');
  try {
    const response = await fetch('/api/chesscom/' + encodeURIComponent(username) + '/games?limit=100', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Не удалось загрузить партии Chess.com.');
    const canonicalUsername = payload.username || username;
    const stats = calculateTodayStreak(payload.games, canonicalUsername);
    updateStreakUI(stats);
    try { localStorage.setItem(STREAK_USERNAME_KEY, canonicalUsername); } catch (error) { /* storage may be disabled */ }
    if (input) input.value = canonicalUsername;
    streakLoadedUsername = canonicalUsername.toLowerCase();
    streakLoadedAt = Date.now();
    const total = stats.wins + stats.losses + stats.draws;
    setStreakStatus(total
      ? 'Учтено партий за сегодня: ' + total + '. Данные взяты из архива Chess.com.'
      : 'Chess.com пока не показывает завершённых партий за сегодня.', 'success');
  } catch (error) {
    setStreakStatus('Не удалось обновить винстрик: ' + error.message, 'error');
  } finally {
    streakLoading = false;
    if (button) { button.disabled = false; button.textContent = oldText || 'Обновить результаты'; }
  }
}

const streakButton = document.getElementById('analyzeTodayBtn');
if (streakButton) streakButton.addEventListener('click', () => loadStreak(true));
const streakInput = document.getElementById('streakUsername');
if (streakInput) streakInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') loadStreak(true);
});

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


function getMyEndgamesStorageKey() {
  const account = window.getChessTrainerUser ? window.getChessTrainerUser() : null;
  const scope = account && account.id ? String(account.id) : 'guest';
  return 'chessTrainer.myEndgames.v1.user.' + scope;
}

function readMyEndgames() {
  try {
    const raw = localStorage.getItem(getMyEndgamesStorageKey());
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) return [];
    // Показываем только позиции, подтверждённые анализом Stockfish:
    // партия проиграна игроком, а оценка сохранённой позиции >= +2.0 в его пользу.
    return items.filter(item => {
      if (!item || !item.id || !item.fen || !Array.isArray(item.moves)) return false;
      if (item.stockfishQualified !== true || item.playerLost !== true) return false;
      const playerEval = Number(item.stockfishPlayerEval);
      const winningMate = item.stockfishIsMate === true && Number(item.stockfishMateInPlayer) > 0;
      return (Number.isFinite(playerEval) && playerEval >= 2.0) || winningMate;
    });
  } catch (error) {
    console.warn('Не удалось загрузить личные эндшпили:', error);
    return [];
  }
}

function isPersonalEndgamePosition(game) {
  const weights = { n: 1, b: 1, r: 2, q: 4 };
  let score = 0;
  game.board().forEach(row => row.forEach(piece => {
    if (piece) score += weights[piece.type] || 0;
  }));
  return score <= 8;
}

function hashPersonalEndgame(value) {
  let hash = 2166136261;
  const source = String(value || '');
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getPersonalEndgamePlayerColor(pgn, override) {
  const requested = String(override || '').trim().toLowerCase();
  if (requested === 'w' || requested === 'white') return 'w';
  if (requested === 'b' || requested === 'black') return 'b';

  const username = String(myUsername || '').trim().toLowerCase();
  const white = getPgnHeader(pgn, 'White', '').trim().toLowerCase();
  const black = getPgnHeader(pgn, 'Black', '').trim().toLowerCase();
  if (username && white === username) return 'w';
  if (username && black === username) return 'b';
  return '';
}

function isPlayerLostPgnResult(result, playerColor) {
  if (playerColor === 'w') return result === '0-1';
  if (playerColor === 'b') return result === '1-0';
  return false;
}

function formatPersonalEndgameStockfishEval(item) {
  if (item && item.stockfishIsMate === true && Number(item.stockfishMateInPlayer) > 0) {
    const mateIn = Number(item.stockfishMateInPlayer);
    return mateIn ? 'мат в ' + mateIn : 'форсированный мат';
  }
  const score = Number(item && item.stockfishPlayerEval);
  return (score >= 0 ? '+' : '') + score.toFixed(1);
}

function saveMyEndgameFromPgn(pgn, gameUrl, analysisData, playerColorOverride) {
  try {
    if (!pgn || typeof Chess !== 'function') return false;
    const analysisMoves = analysisData && Array.isArray(analysisData.moves) ? analysisData.moves : [];
    if (!analysisMoves.length) return false;

    const white = getPgnHeader(pgn, 'White', 'Белые');
    const black = getPgnHeader(pgn, 'Black', 'Чёрные');
    const result = getPgnHeader(pgn, 'Result', '*');
    const playerColor = getPersonalEndgamePlayerColor(pgn, playerColorOverride);

    // Нужна именно проигранная игроком партия. Ничьи и неизвестный результат пропускаем.
    if (!playerColor || !isPlayerLostPgnResult(result, playerColor)) return false;

    const parsed = new Chess();
    parsed.load_pgn(String(pgn));
    const sanMoves = parsed.history();
    if (!Array.isArray(sanMoves) || sanMoves.length < 4) return false;

    const startFen = getPgnHeader(pgn, 'FEN', '');
    const replay = startFen ? new Chess(startFen) : new Chess();
    const playerSign = playerColor === 'w' ? 1 : -1;
    const MIN_WINNING_EVAL = 2.0;
    let startIndex = -1;
    let selectedPlayerEval = null;
    let selectedWhiteEval = null;
    let selectedMateInPlayer = 0;
    let selectedIsMate = false;
    let selectedDepth = null;

    for (let index = 0; index < sanMoves.length; index++) {
      if (sanMoves.length - index >= 4 && index > 0 && isPersonalEndgamePosition(replay)) {
        // Оценка предыдущего полухода относится к текущей позиции (после предыдущего хода).
        const positionAnalysis = analysisMoves[index - 1];
        const whiteEval = Number(positionAnalysis && positionAnalysis.eval);
        if (Number.isFinite(whiteEval)) {
          const playerEval = whiteEval * playerSign;
          const mateInPlayer = Number(positionAnalysis && positionAnalysis.mate_in || 0) * playerSign;
          const winningMate = Boolean(positionAnalysis && positionAnalysis.is_mate === true) && mateInPlayer > 0;
          if (playerEval >= MIN_WINNING_EVAL || winningMate) {
            startIndex = index;
            selectedPlayerEval = playerEval;
            selectedWhiteEval = whiteEval;
            selectedMateInPlayer = mateInPlayer;
            selectedIsMate = Boolean(positionAnalysis && positionAnalysis.is_mate === true);
            selectedDepth = Number(positionAnalysis && positionAnalysis.analysis_depth_used) || null;
            break;
          }
        }
      }

      try {
        if (!replay.move(sanMoves[index])) break;
      } catch (error) {
        break;
      }
    }
    if (startIndex < 0) return false;

    const item = {
      id: 'my-endgame-' + hashPersonalEndgame(String(gameUrl || '') + '|' + String(pgn)),
      fen: replay.fen(),
      moves: sanMoves.slice(startIndex),
      white,
      black,
      result,
      date: getPgnHeader(pgn, 'Date', 'Дата неизвестна'),
      event: getPgnHeader(pgn, 'Event', 'Партия'),
      playerColor,
      playerLost: true,
      stockfishQualified: true,
      stockfishPlayerEval: Number(selectedPlayerEval.toFixed(2)),
      stockfishWhiteEval: Number(selectedWhiteEval.toFixed(2)),
      stockfishIsMate: selectedIsMate,
      stockfishMateInPlayer: selectedMateInPlayer,
      stockfishDepth: selectedDepth,
      sourceUrl: String(gameUrl || ''),
      startPly: startIndex
    };

    const items = readMyEndgames();
    if (items.some(saved => saved.id === item.id)) return false;
    items.unshift(item);
    localStorage.setItem(getMyEndgamesStorageKey(), JSON.stringify(items.slice(0, 80)));
    renderMyEndgamesList();
    return true;
  } catch (error) {
    console.warn('Не удалось сохранить эндшпиль из партии:', error);
    return false;
  }
}
window.saveMyEndgameFromPgn = saveMyEndgameFromPgn;

function renderMyEndgamesList() {
  const list = document.getElementById('myEndgamesList');
  const count = document.getElementById('myEndgamesCount');
  if (!list) return;
  const items = readMyEndgames();
  if (count) count.textContent = String(items.length);
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'coach-empty';
    empty.textContent = 'Здесь появятся позиции из проигранных партий, где Stockfish видел выигрыш в твою пользу (+2.0 и выше).';
    list.appendChild(empty);
    return;
  }
  items.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-item my-endgame-item' + (myEndgamesCurrent && myEndgamesCurrent.id === item.id ? ' active' : '');
    const title = document.createElement('strong');
    title.textContent = item.playerColor === 'w'
      ? 'Белые: ты · Чёрные: ' + item.black
      : (item.playerColor === 'b' ? 'Белые: ' + item.white + ' · Чёрные: ты' : item.white + ' — ' + item.black);
    const meta = document.createElement('small');
    meta.textContent = item.date + ' · ' + item.moves.length + ' ходов · Stockfish ' + formatPersonalEndgameStockfishEval(item);
    button.append(title, meta);
    button.addEventListener('click', () => selectMyEndgame(item));
    list.appendChild(button);
  });
}

function updateMyEndgameViewer() {
  if (!myEndgamesGame || !myEndgamesCurrent) return;
  if (myEndgamesBoard) myEndgamesBoard.position(myEndgamesGame.fen(), false);
  const total = myEndgamesCurrent.moves.length;
  const played = myEndgameMoveIndex;
  const label = document.getElementById('myEndgameMoveLabel');
  const previous = document.getElementById('myEndgamePrev');
  const next = document.getElementById('myEndgameNext');
  if (label) label.textContent = played ? 'Ход ' + played + ' из ' + total : 'Начальная позиция';
  if (previous) previous.disabled = played <= 0;
  if (next) {
    next.disabled = played >= total;
    next.textContent = played >= total ? 'Партия завершена' : 'Следующий ход →';
  }
  renderMyEndgamesList();
}

function selectMyEndgame(item) {
  if (!item || typeof Chess !== 'function' || typeof Chessboard !== 'function') return;
  stopMyEndgamePractice();
  myEndgamesCurrent = item;
  myEndgamesGame = new Chess(item.fen);
  myEndgameMoveIndex = 0;
  if (!myEndgamesBoard) {
    myEndgamesBoard = Chessboard('myEndgamesBoard', {
      position: item.fen,
      draggable: true,
      pieceTheme: PIECE_THEME,
      appearSpeed: 0,
      moveSpeed: 0,
      snapbackSpeed: 0,
      snapSpeed: 0,
      onDragStart: onMyEndgamePracticeDragStart,
      onDrop: handleMyEndgamePracticeDrop,
      onSnapEnd: () => {
        clearHighlights();
        if (myEndgamePracticeActive) renderMyEndgamePracticeBoard();
        else if (myEndgamesGame) myEndgamesBoard.position(myEndgamesGame.fen(), false);
      }
    });
    initRightClickDrawing('myEndgamesBoard');
    if (window.initBoardClickToMove) {
      window.initBoardClickToMove(
        'myEndgamesBoard',
        () => myEndgamePracticeActive
          ? (myEndgamePracticeVirtualGame || myEndgamePracticeGame)
          : myEndgamesGame,
        handleMyEndgamePracticeDrop,
        { canSelect: piece => Boolean(
          myEndgamePracticeActive && piece && piece.color === myEndgamePracticeColor
        ) }
      );
    }
  }
  if (myEndgamesBoard.orientation) myEndgamesBoard.orientation(item.playerColor === 'b' ? 'black' : 'white');
  const title = document.getElementById('myEndgameTitle');
  const meta = document.getElementById('myEndgameMeta');
  if (title) title.textContent = item.white + ' — ' + item.black;
  if (meta) meta.textContent = item.date + (item.result && item.result !== '*' ? ' · ' + item.result : '') + ' · Stockfish ' + formatPersonalEndgameStockfishEval(item) + ' в твою пользу';
  updateMyEndgameViewer();
  updateMyEndgamePracticeControls();
  setMyEndgamePracticeClock();
  setTimeout(() => myEndgamesBoard && myEndgamesBoard.resize(), 80);
}

function moveMyEndgame(direction) {
  if (myEndgamePracticeActive || !myEndgamesGame || !myEndgamesCurrent) return;
  if (direction < 0) {
    if (myEndgameMoveIndex <= 0) return;
    myEndgamesGame.undo();
    myEndgameMoveIndex--;
  } else {
    if (myEndgameMoveIndex >= myEndgamesCurrent.moves.length) return;
    try {
      const move = myEndgamesGame.move(myEndgamesCurrent.moves[myEndgameMoveIndex]);
      if (!move) return;
      myEndgameMoveIndex++;
    } catch (error) {
      return;
    }
  }
  updateMyEndgameViewer();
}


function setMyEndgamePracticeFeedback(message, type) {
  const el = document.getElementById('myEndgamePracticeFeedback');
  if (!el) return;
  el.textContent = message;
  el.className = 'my-endgame-practice-feedback' + (type ? ' ' + type : '');
}

function setMyEndgamePracticeClock() {
  const el = document.getElementById('myEndgamePracticeClock');
  if (!el) return;
  const seconds = Math.max(0, Math.ceil(myEndgamePracticeTimeLeft));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  el.textContent = String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  el.classList.toggle('low', seconds <= 30 && myEndgamePracticeActive);
}

function getMyEndgamePracticeTime() {
  const select = document.getElementById('myEndgameTimeControl');
  const custom = document.getElementById('myEndgameCustomMinutes');
  if (!select) return 300;
  if (select.value !== 'custom') return Math.max(60, Number(select.value) || 300);
  const minutes = Number(custom && custom.value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
    throw new Error('Введи время от 1 до 180 минут.');
  }
  return Math.round(minutes) * 60;
}

function updateMyEndgamePracticeControls() {
  const active = myEndgamePracticeActive;
  const timeControl = document.getElementById('myEndgameTimeControl');
  const custom = document.getElementById('myEndgameCustomMinutes');
  const start = document.getElementById('myEndgamePracticeStart');
  const reset = document.getElementById('myEndgamePracticeReset');
  const review = document.getElementById('myEndgameReviewControls');
  const hasGame = Boolean(myEndgamesCurrent);

  if (timeControl) timeControl.disabled = active;
  if (custom) custom.disabled = active;
  if (start) {
    start.disabled = !hasGame || active;
    start.textContent = active ? 'Игра идёт' : '▶ Практика';
  }
  if (reset) reset.disabled = !hasGame || (!active && !myEndgamePracticeGame);
  if (review) review.hidden = Boolean(myEndgamePracticeGame);
}

function stopMyEndgamePracticeTimer() {
  myEndgamePracticeTimerActive = false;
  if (myEndgamePracticeTimerId) {
    clearInterval(myEndgamePracticeTimerId);
    myEndgamePracticeTimerId = null;
  }
}

function pauseMyEndgamePracticeTimer() {
  myEndgamePracticeTimerActive = false;
}

function startMyEndgamePracticeTimer() {
  if (!myEndgamePracticeActive || myEndgamePracticeTimeLeft <= 0) return;
  pauseMyEndgamePracticeTimer();
  myEndgamePracticeTimerActive = true;
  myEndgamePracticeLastTick = performance.now();
  if (!myEndgamePracticeTimerId) {
    myEndgamePracticeTimerId = setInterval(tickMyEndgamePracticeTimer, 100);
  }
}

function finishMyEndgamePractice(result, message) {
  if (!myEndgamePracticeActive) return;
  stopMyEndgamePracticeTimer();
  myEndgamePracticeActive = false;
  myEndgamePracticeQueue = [];
  myEndgamePracticeVersion++;
  myEndgamePracticeBotActive = false;
  setMyEndgamePracticeFeedback(message, result);
  updateMyEndgamePracticeControls();
  renderMyEndgamePracticeBoard();
}

function tickMyEndgamePracticeTimer() {
  if (!myEndgamePracticeActive || !myEndgamePracticeTimerActive) return;
  const now = performance.now();
  myEndgamePracticeTimeLeft = Math.max(
    0,
    myEndgamePracticeTimeLeft - (now - myEndgamePracticeLastTick) / 1000
  );
  myEndgamePracticeLastTick = now;
  setMyEndgamePracticeClock();

  if (myEndgamePracticeTimeLeft <= 0) {
    stopMyEndgamePracticeTimer();
    finishMyEndgamePractice('err', '⏰ Время вышло. Бот победил. Попробуй ещё раз!');
  }
}

function forceMyEndgamePracticeTurn(chessGame) {
  return window.ChessPremove
    ? window.ChessPremove.forceTurn(chessGame, myEndgamePracticeColor)
    : new Chess(chessGame.fen());
}

function rebuildMyEndgamePracticeVirtualBoard() {
  if (!myEndgamePracticeGame) {
    myEndgamePracticeVirtualGame = null;
    return;
  }
  if (window.ChessPremove) {
    const result = window.ChessPremove.rebuild(
      myEndgamePracticeGame,
      myEndgamePracticeColor,
      myEndgamePracticeQueue
    );
    myEndgamePracticeVirtualGame = result.virtualGame;
    myEndgamePracticeQueue = result.queue;
  } else {
    myEndgamePracticeVirtualGame = forceMyEndgamePracticeTurn(new Chess(myEndgamePracticeGame.fen()));
  }
}

function updateMyEndgamePracticePremoveHighlights() {
  document.querySelectorAll('#myEndgamesBoard .premove-from, #myEndgamesBoard .premove-to')
    .forEach(el => el.classList.remove('premove-from', 'premove-to'));
  myEndgamePracticeQueue.forEach(move => {
    const from = document.querySelector('#myEndgamesBoard .square-' + move.from);
    const to = document.querySelector('#myEndgamesBoard .square-' + move.to);
    if (from) from.classList.add('premove-from');
    if (to) to.classList.add('premove-to');
  });
}

function renderMyEndgamePracticeBoard() {
  if (!myEndgamesBoard || !myEndgamePracticeGame) return;
  rebuildMyEndgamePracticeVirtualBoard();
  const visible = myEndgamePracticeVirtualGame || myEndgamePracticeGame;
  myEndgamesBoard.position(visible.fen(), false);
  updateMyEndgamePracticePremoveHighlights();
  if (myEndgamesBoard.resize) myEndgamesBoard.resize();
}

function checkMyEndgamePracticeGameOver() {
  if (!myEndgamePracticeGame) return true;
  if (myEndgamePracticeGame.in_checkmate()) {
    const humanWon = myEndgamePracticeGame.turn() !== myEndgamePracticeColor;
    finishMyEndgamePractice(
      humanWon ? 'ok' : 'err',
      humanWon ? '✅ Мат! Ты победил Stockfish!' : '❌ Мат. На этот раз бот оказался сильнее.'
    );
    return true;
  }
  if (
    myEndgamePracticeGame.in_draw()
    || myEndgamePracticeGame.in_stalemate()
    || myEndgamePracticeGame.in_threefold_repetition()
    || myEndgamePracticeGame.insufficient_material()
  ) {
    finishMyEndgamePractice('info', '🤝 Ничья. Можно начать заново или выбрать другой эндшпиль.');
    return true;
  }
  return false;
}

function onMyEndgamePracticeDragStart(source, piece) {
  if (!myEndgamePracticeActive || !myEndgamePracticeGame || !piece || piece.charAt(0) !== myEndgamePracticeColor) return false;
  const planning = myEndgamePracticeGame.turn() !== myEndgamePracticeColor
    || myEndgamePracticeBotActive || myEndgamePracticeQueue.length > 0;
  const activeGame = planning ? myEndgamePracticeVirtualGame : myEndgamePracticeGame;
  if (!activeGame || !activeGame.moves({ square: source }).length) return false;
  clearUserDrawings('myEndgamesBoard');
  highlightMoves(activeGame, source);
  return true;
}

function handleMyEndgamePracticeDrop(source, target) {
  clearHighlights();
  if (!myEndgamePracticeActive || !myEndgamePracticeGame || source === target || myEndgamePracticeGame.game_over()) return 'snapback';

  const planning = myEndgamePracticeGame.turn() !== myEndgamePracticeColor
    || myEndgamePracticeBotActive || myEndgamePracticeQueue.length > 0;

  if (planning) {
    rebuildMyEndgamePracticeVirtualBoard();
    const planned = window.ChessPremove
      ? window.ChessPremove.add(myEndgamePracticeGame, myEndgamePracticeColor, myEndgamePracticeQueue, {
          from: source, to: target, promotion: 'q'
        })
      : { ok: false };
    if (!planned.ok) return 'snapback';
    myEndgamePracticeQueue = planned.queue;
    myEndgamePracticeVirtualGame = planned.virtualGame;
    renderMyEndgamePracticeBoard();
    setMyEndgamePracticeFeedback('Премув ' + source + ' → ' + target + ' поставлен. Можно добавить следующий ход в очередь.', '');
    return;
  }

  let move = null;
  try {
    move = myEndgamePracticeGame.move({ from: source, to: target, promotion: 'q' });
  } catch (error) {
    move = null;
  }
  if (!move) return 'snapback';

  renderMyEndgamePracticeBoard();
  playMoveSound();
  if (checkMyEndgamePracticeGameOver()) return;

  pauseMyEndgamePracticeTimer();
  setMyEndgamePracticeFeedback('Stockfish думает… Можешь заранее поставить премув.', '');
  setTimeout(makeMyEndgamePracticeBotMove, 120);
}

async function makeMyEndgamePracticeBotMove() {
  if (
    !myEndgamePracticeActive || !myEndgamePracticeGame
    || myEndgamePracticeGame.game_over()
    || myEndgamePracticeGame.turn() === myEndgamePracticeColor
    || myEndgamePracticeBotActive
  ) return;

  myEndgamePracticeBotActive = true;
  pauseMyEndgamePracticeTimer();
  const requestVersion = myEndgamePracticeVersion;
  const requestFen = myEndgamePracticeGame.fen();

  try {
    const response = await fetch('/api/bot_move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: requestFen, level: 6 })
    });
    if (!response.ok) throw new Error('Stockfish вернул ошибку ' + response.status);
    const data = await response.json();
    if (requestVersion !== myEndgamePracticeVersion || !myEndgamePracticeActive) return;

    let applied = null;
    if (data && data.move) {
      try {
        applied = myEndgamePracticeGame.move({
          from: data.move.slice(0, 2),
          to: data.move.slice(2, 4),
          promotion: data.move[4] || 'q'
        });
      } catch (error) {
        applied = null;
      }
    }
    if (!applied) throw new Error('Stockfish не вернул допустимый ход');
    playMoveSound();
  } catch (error) {
    if (requestVersion !== myEndgamePracticeVersion || !myEndgamePracticeActive) return;
    const fallbackMoves = myEndgamePracticeGame.moves({ verbose: true });
    if (!fallbackMoves.length) {
      finishMyEndgamePractice('err', 'Не удалось получить ход Stockfish. Начни практику заново.');
      return;
    }
    const fallback = fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
    myEndgamePracticeGame.move({
      from: fallback.from,
      to: fallback.to,
      promotion: fallback.promotion || 'q'
    });
    setMyEndgamePracticeFeedback('Связь с Stockfish прервалась. Сыгран запасной ход, партия продолжается.', 'err');
  } finally {
    if (requestVersion !== myEndgamePracticeVersion) return;
    myEndgamePracticeBotActive = false;
    if (!myEndgamePracticeActive) return;

    renderMyEndgamePracticeBoard();
    if (checkMyEndgamePracticeGameOver()) return;

    if (myEndgamePracticeQueue.length) executeMyEndgamePracticePremove();
    else {
      setMyEndgamePracticeFeedback('Твой ход. Время снова пошло.', '');
      startMyEndgamePracticeTimer();
    }
  }
}

function executeMyEndgamePracticePremove() {
  if (
    !myEndgamePracticeQueue.length || !myEndgamePracticeActive
    || !myEndgamePracticeGame || myEndgamePracticeGame.game_over()
    || myEndgamePracticeGame.turn() !== myEndgamePracticeColor
  ) {
    renderMyEndgamePracticeBoard();
    return;
  }
  const executed = window.ChessPremove
    ? window.ChessPremove.execute(myEndgamePracticeGame, myEndgamePracticeColor, myEndgamePracticeQueue)
    : { move: null, queue: [] };
  const move = executed.move;
  myEndgamePracticeQueue = executed.queue;
  if (!move) {
    myEndgamePracticeQueue = [];
    renderMyEndgamePracticeBoard();
    setMyEndgamePracticeFeedback('Премув отменён: после хода бота позиция изменилась.', 'err');
    startMyEndgamePracticeTimer();
    return;
  }

  myEndgamePracticeTimeLeft = Math.max(0, myEndgamePracticeTimeLeft - 0.1);
  setMyEndgamePracticeClock();
  if (myEndgamePracticeTimeLeft <= 0) {
    finishMyEndgamePractice('err', '⏰ Время вышло. Бот победил. Попробуй ещё раз!');
    return;
  }
  renderMyEndgamePracticeBoard();
  playMoveSound();
  if (checkMyEndgamePracticeGameOver()) return;
  pauseMyEndgamePracticeTimer();
  setMyEndgamePracticeFeedback('Премув выполнен. Stockfish отвечает…', '');
  setTimeout(makeMyEndgamePracticeBotMove, 120);
}

function startMyEndgamePractice() {
  if (!myEndgamesCurrent) return;
  let seconds = 300;
  try {
    seconds = getMyEndgamePracticeTime();
  } catch (error) {
    setMyEndgamePracticeFeedback(error.message, 'err');
    return;
  }
  stopMyEndgamePracticeTimer();
  myEndgamePracticeVersion++;
  myEndgamePracticeGame = new Chess(myEndgamesCurrent.fen);
  myEndgamePracticeColor = myEndgamesCurrent.playerColor === 'w' || myEndgamesCurrent.playerColor === 'b'
    ? myEndgamesCurrent.playerColor
    : myEndgamePracticeGame.turn();
  myEndgamePracticeVirtualGame = new Chess(myEndgamePracticeGame.fen());
  myEndgamePracticeQueue = [];
  rebuildMyEndgamePracticeVirtualBoard();
  myEndgamePracticeBotActive = false;
  myEndgamePracticeTimeLimit = seconds;
  myEndgamePracticeTimeLeft = seconds;
  myEndgamePracticeActive = true;
  myEndgameMoveIndex = 0;

  if (myEndgamesBoard && myEndgamesBoard.orientation) {
    myEndgamesBoard.orientation(myEndgamePracticeColor === 'w' ? 'white' : 'black');
  }
  renderMyEndgamePracticeBoard();
  setMyEndgamePracticeClock();
  updateMyEndgamePracticeControls();

  clearHighlights();
  clearUserDrawings('myEndgamesBoard');
  if (myEndgamePracticeGame.turn() === myEndgamePracticeColor) {
    setMyEndgamePracticeFeedback('Практика началась. Ты играешь ' + (myEndgamePracticeColor === 'w' ? 'белыми' : 'чёрными') + '. Твой ход!', 'success');
    startMyEndgamePracticeTimer();
  } else {
    setMyEndgamePracticeFeedback('Практика началась. Соперник ходит первым…', '');
    setTimeout(makeMyEndgamePracticeBotMove, 120);
  }
}

function resetMyEndgamePractice() {
  if (!myEndgamesCurrent) return;
  startMyEndgamePractice();
}

function stopMyEndgamePractice() {
  stopMyEndgamePracticeTimer();
  myEndgamePracticeActive = false;
  myEndgamePracticeBotActive = false;
  myEndgamePracticeQueue = [];
  myEndgamePracticeGame = null;
  myEndgamePracticeVirtualGame = null;
  myEndgamePracticeVersion++;
  try { myEndgamePracticeTimeLeft = getMyEndgamePracticeTime(); }
  catch (error) { myEndgamePracticeTimeLeft = 300; }
  clearHighlights();
  updateMyEndgamePracticeControls();
  setMyEndgamePracticeClock();
}

function initMyEndgamesUI() {
  const wrapper = document.getElementById('tab-endgames');
  if (!wrapper || wrapper.dataset.personalReady === '1') return;
  wrapper.dataset.personalReady = '1';
  wrapper.querySelectorAll('[data-endgames-view]').forEach(button => {
    button.addEventListener('click', () => {
      const mine = button.dataset.endgamesView === 'mine';
      const catalog = document.getElementById('endgamesCatalogView');
      const personalView = document.getElementById('myEndgamesView');
      wrapper.querySelectorAll('[data-endgames-view]').forEach(tab => tab.classList.toggle('active', tab === button));
      if (catalog) catalog.hidden = mine;
      if (personalView) personalView.hidden = !mine;
      if (mine) {
        if (!myEndgamePracticeActive) stopMyEndgamePractice();
        renderMyEndgamesList();
        const items = readMyEndgames();
        if (!myEndgamesCurrent && items.length) selectMyEndgame(items[0]);
        setTimeout(() => myEndgamesBoard && myEndgamesBoard.resize(), 80);
      }
    });
  });
  const timeSelect = document.getElementById('myEndgameTimeControl');
  const customMinutes = document.getElementById('myEndgameCustomMinutes');
  const startPractice = document.getElementById('myEndgamePracticeStart');
  const resetPractice = document.getElementById('myEndgamePracticeReset');
  if (timeSelect) {
    timeSelect.addEventListener('change', () => {
      if (customMinutes) customMinutes.hidden = timeSelect.value !== 'custom';
      try {
        const seconds = getMyEndgamePracticeTime();
        if (!myEndgamePracticeActive) {
          myEndgamePracticeTimeLeft = seconds;
          myEndgamePracticeTimeLimit = seconds;
          setMyEndgamePracticeClock();
        }
      } catch (error) {
        setMyEndgamePracticeFeedback(error.message, 'err');
      }
    });
  }
  if (customMinutes) {
    customMinutes.addEventListener('input', () => {
      if (!myEndgamePracticeActive) {
        try {
          const seconds = getMyEndgamePracticeTime();
          myEndgamePracticeTimeLeft = seconds;
          myEndgamePracticeTimeLimit = seconds;
          setMyEndgamePracticeClock();
        } catch (error) {
          setMyEndgamePracticeFeedback(error.message, 'err');
        }
      }
    });
  }
  if (startPractice) startPractice.addEventListener('click', startMyEndgamePractice);
  if (resetPractice) resetPractice.addEventListener('click', resetMyEndgamePractice);

  const prev = document.getElementById('myEndgamePrev');
  const next = document.getElementById('myEndgameNext');
  if (prev) prev.addEventListener('click', () => moveMyEndgame(-1));
  if (next) next.addEventListener('click', () => moveMyEndgame(1));
  renderMyEndgamesList();
  document.querySelector('.tab-btn[data-tab="endgames"]')?.addEventListener('click', () => {
    setTimeout(() => {
      if (myEndgamesBoard && !document.getElementById('myEndgamesView')?.hidden) myEndgamesBoard.resize();
      if (endgameBoard && !document.getElementById('endgamesCatalogView')?.hidden) endgameBoard.resize();
    }, 100);
  });
}

function renderEndgamesList() {
  const list = document.getElementById('endgameList');
  list.innerHTML = endgamesData.map(e => `<div class="list-item" data-id="${e.id}">${e.title}</div>`).join('');
  list.querySelectorAll('.list-item').forEach(el => { el.onclick = () => selectEndgame(endgamesData.find(e => e.id == el.dataset.id)); });
  if (endgamesData.length) selectEndgame(endgamesData[0]);
  initMyEndgamesUI();
  renderMyEndgamesList();
}

function forceEndgamePlayerTurn(chessGame) {
  return window.ChessPremove
    ? window.ChessPremove.forceTurn(chessGame, endgamePlayerColor)
    : new Chess(chessGame.fen());
}

// Виртуальная доска проигрывает очередь премувов, пропуская ответы соперника.
function rebuildEndgameVirtualBoard() {
  if (!endgameGame) {
    endgameVirtualGame = null;
    return;
  }
  if (window.ChessPremove) {
    const result = window.ChessPremove.rebuild(
      endgameGame,
      endgamePlayerColor,
      endgamePremoveQueue
    );
    endgameVirtualGame = result.virtualGame;
    endgamePremoveQueue = result.queue;
  } else {
    endgameVirtualGame = forceEndgamePlayerTurn(new Chess(endgameGame.fen()));
  }
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
  rebuildEndgameVirtualBoard();
  // Показываем виртуальную позицию, как в тренировке матов:
  // пользователь видит всю очередь заранее запланированных ходов.
  endgameBoard.position((endgameVirtualGame || endgameGame).fen(), false);
  updateEndgamePremoveHighlights();
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
      () => {
        rebuildEndgameVirtualBoard();
        return endgameGame.turn() !== endgamePlayerColor ||
          endgameBotRequestActive || endgamePremoveQueue.length
          ? endgameVirtualGame
          : endgameGame;
      },
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
    endgameBotRequestActive || endgamePremoveQueue.length > 0;

  rebuildEndgameVirtualBoard();
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
    endgameBotRequestActive || endgamePremoveQueue.length > 0;

  if (planningMode) {
    rebuildEndgameVirtualBoard();
    const planned = window.ChessPremove
      ? window.ChessPremove.add(endgameGame, endgamePlayerColor, endgamePremoveQueue, {
          from: source, to: target, promotion: 'q'
        })
      : { ok: false };
    if (!planned.ok) return 'snapback';

    endgamePremoveQueue = planned.queue;
    endgameVirtualGame = planned.virtualGame;
    renderEndgameBoard();
    setEndgameFeedback(
      'Премув ' + source + ' → ' + target + ' поставлен. Можно добавить следующий ход в очередь.',
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

  const executed = window.ChessPremove
    ? window.ChessPremove.execute(endgameGame, endgamePlayerColor, endgamePremoveQueue)
    : { move: null, queue: [] };
  const move = executed.move;
  endgamePremoveQueue = executed.queue;

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

function formatTrainingTime(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  if (value < 60) return value + ' мин';
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours + ' ч' + (mins ? ' ' + mins + ' мин' : '');
}

function renderGoalSummary(goal) {
  const container = document.getElementById('goalSummary');
  if (!container) return;
  if (!goal) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const warning = goal.warning
    ? '<div class="goal-summary-warning"><strong>Важно о сроке</strong><span>' + goal.warning + '</span></div>'
    : '<div class="goal-summary-note">' + (goal.estimate_basis || 'Срок — ориентир для расчёта нагрузки, не гарантия изменения рейтинга.') + ' Рост рейтинга не гарантирован: важны качество партий, регулярность и разбор ошибок.</div>';
  container.innerHTML = `
    <div class="goal-summary-main">
      <div class="goal-summary-item"><span>Текущий рейтинг</span><strong>${goal.current_elo} <small>Elo</small></strong></div>
      <div class="goal-summary-arrow">→</div>
      <div class="goal-summary-item target"><span>Твоя цель</span><strong>${goal.target_elo} <small>Elo</small></strong></div>
      <div class="goal-summary-divider"></div>
      <div class="goal-summary-meta"><span>Срок</span><strong>${goal.goal_days} дней</strong></div>
      <div class="goal-summary-meta"><span>Тренировка в день</span><strong>${formatTrainingTime(goal.daily_minutes)}</strong></div>
      <div class="goal-summary-meta"><span>Ориентир нагрузки</span><strong>${formatTrainingTime(goal.recommended_minutes)}</strong></div>
      <div class="goal-summary-meta"><span>Ориентир срока</span><strong>${goal.estimated_days ? goal.estimated_days + ' дней' : 'Цель достигнута'}</strong></div>
    </div>
    ${warning}
  `;
  const intro = document.getElementById('planIntroText');
  if (intro) intro.textContent = 'Персональный маршрут от ' + goal.current_elo + ' до ' + goal.target_elo + ' Elo с ежедневными заданиями.';
  const badge = document.getElementById('planDurationBadge');
  if (badge) badge.textContent = goal.goal_days + ' дней';
}

function renderPlan(todayName) {
  const firstOpen = PLAN.find(d => !d.completed);
  let todayTraining = null;

  if (GOAL_PROFILE && GOAL_PROFILE.start_date) {
    const now = new Date();
    const todayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const startMs = Date.parse(GOAL_PROFILE.start_date + 'T00:00:00Z');
    const todayMs = Date.parse(todayKey + 'T00:00:00Z');
    const elapsedDay = Math.floor((todayMs - startMs) / 86400000) + 1;
    if (elapsedDay >= 1 && elapsedDay <= totalDays) {
      todayTraining = PLAN.find(day => day.day === elapsedDay) || null;
    }
  }

  if (!todayTraining) {
    const currentWeek = firstOpen ? firstOpen.week : 1;
    todayTraining = PLAN.find(d => d.week === currentWeek && d.weekday === todayName);
  }
  if (todayTraining && todayTraining.completed && firstOpen) {
    todayTraining = firstOpen;
  }
  if (!todayTraining) todayTraining = firstOpen || PLAN[PLAN.length - 1];
  if (!todayTraining) return;

  currentDay = todayTraining.day;
  renderPhases();
  renderWeeks();
  showDay(currentDay);
  updateProgress();
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
function getPersonalChecklistPrefix() {
  const user = window.getChessTrainerUser ? window.getChessTrainerUser() : null;
  return 'chessTrainer.user.' + (user && user.id ? user.id : 'guest') + '.';
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
        const checkId = `${getPersonalChecklistPrefix()}${taskId}-item-${iIdx}`;
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
      <textarea class="note-area" id="noteArea" placeholder="Напиши, из-за чего проиграл..."></textarea>
    </div>
  `;
  document.getElementById('noteArea').value = d.note || '';
  document.getElementById('dayCheck').onchange = async (e) => {
    const checkbox = e.target;
    checkbox.disabled = true;
    try {
      const response = await fetch('/api/complete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({day: d.day, completed: checkbox.checked})
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Не удалось сохранить выполнение дня.');
      }
      d.completed = checkbox.checked;
      document.querySelector('.day-card').classList.toggle('done', d.completed);
      if (d.completed) {
        const now = new Date();
        const dateStr = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
        const diaryResponse = await fetch('/api/diary', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({day_date: dateStr})
        });
        if (!diaryResponse.ok) console.warn('Не удалось записать завершённую тренировку в дневник.');
      }
      updateProgress();
      renderPhases();
      window.dispatchEvent(new CustomEvent('chess-plan-updated'));
      if (document.getElementById('tab-diary').classList.contains('active') && window.drawDiary) window.drawDiary();
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      showError('Не удалось сохранить прогресс: ' + error.message);
    } finally {
      checkbox.disabled = false;
    }
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
  initRightClickDrawing('puzzleBoard');
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

function getMainOpeningPlayerColor() {
  return currentOpening && currentOpening.side === 'black' ? 'b' : 'w';
}

function getMainOpeningPremoveBase() {
  // Виртуально передаём очередь хода игроку, не меняя реальную позицию.
  return new Chess(openingGame.fen());
}

function rebuildMainOpeningPremove() {
  if (!window.ChessPremove || !openingGame || !currentOpening) {
    openingVirtualGame = openingGame ? new Chess(openingGame.fen()) : null;
    return;
  }
  const result = window.ChessPremove.rebuild(
    getMainOpeningPremoveBase(),
    getMainOpeningPlayerColor(),
    openingPremoveQueue
  );
  openingPremoveQueue = result.queue;
  openingVirtualGame = result.virtualGame;
}

function updateMainOpeningPremoveHighlights() {
  const host = document.getElementById('openingBoard');
  if (!host) return;
  host.querySelectorAll('.premove-from, .premove-to').forEach(el => {
    el.classList.remove('premove-from', 'premove-to');
  });
  openingPremoveQueue.forEach(move => {
    host.querySelector('.square-' + move.from)?.classList.add('premove-from');
    host.querySelector('.square-' + move.to)?.classList.add('premove-to');
  });
}

function renderMainOpeningBoard() {
  if (!openingBoard || !openingGame) return;
  rebuildMainOpeningPremove();
  openingBoard.position((openingVirtualGame || openingGame).fen(), false);
  updateMainOpeningPremoveHighlights();
}

function playMainOpeningOpponentMove() {
  if (!currentOpening || isOpponentMoving || currentMoveIndex >= currentOpening.moves.length) return;
  const playerColor = getMainOpeningPlayerColor();
  if (openingGame.turn() === playerColor) return;

  isOpponentMoving = true;
  renderMainOpeningBoard();
  const run = ++openingBotMoveVersion;
  setTimeout(() => {
    if (!currentOpening || !isOpponentMoving || run !== openingBotMoveVersion) return;
    const san = currentOpening.moves[currentMoveIndex];
    let move = null;
    try { move = openingGame.move(san); } catch (_) {}
    isOpponentMoving = false;
    if (!move) {
      document.getElementById('openingDesc').insertAdjacentText('afterbegin', ' Не удалось выполнить ход из линии: ' + san + '.');
      renderMainOpeningBoard();
      return;
    }

    currentMoveIndex++;
    updateOpeningView();
    moveSound.currentTime = 0;
    moveSound.play().catch(() => {});
    if (openingPremoveQueue.length) executeMainOpeningPremove();
  }, 400);
}

function executeMainOpeningPremove() {
  if (!openingPremoveQueue.length || !currentOpening) {
    renderMainOpeningBoard();
    return;
  }
  const playerColor = getMainOpeningPlayerColor();
  if (openingGame.turn() !== playerColor) return;

  rebuildMainOpeningPremove();
  const expectedGame = new Chess(openingGame.fen());
  let expected = null;
  try { expected = expectedGame.move(currentOpening.moves[currentMoveIndex]); } catch (_) {}
  const planned = openingPremoveQueue[0];
  if (!expected || !planned ||
      expected.from !== planned.from ||
      expected.to !== planned.to ||
      (expected.promotion || '') !== (planned.promotion || '')) {
    openingPremoveQueue = [];
    renderMainOpeningBoard();
    return;
  }

  const executed = window.ChessPremove.execute(openingGame, playerColor, openingPremoveQueue);
  openingPremoveQueue = executed.queue;
  if (!executed.move) {
    openingPremoveQueue = [];
    renderMainOpeningBoard();
    return;
  }

  currentMoveIndex++;
  moveSound.currentTime = 0;
  moveSound.play().catch(() => {});
  updateOpeningView();
  if (openingPremoveQueue.length || openingGame.turn() !== playerColor) {
    playMainOpeningOpponentMove();
  }
}

function selectOpening(opening) {
  openingBotMoveVersion++;
  currentOpening = opening;
  currentMoveIndex = 0;
  isOpponentMoving = false;
  openingPremoveQueue = [];
  openingVirtualGame = null;
  openingGame = new Chess();
  clearUserDrawings('openingBoard');

  if (!openingBoard) {
    openingBoard = Chessboard('openingBoard', {
      position: 'start',
      draggable: true,
      onDragStart: (source, piece) => {
        if (!currentOpening || !piece || piece[0] !== getMainOpeningPlayerColor() ||
            currentMoveIndex >= currentOpening.moves.length || openingGame.game_over()) return false;
        rebuildMainOpeningPremove();
        const activeGame = (isOpponentMoving || openingGame.turn() !== getMainOpeningPlayerColor() || openingPremoveQueue.length)
          ? openingVirtualGame : openingGame;
        return Boolean(activeGame && activeGame.moves({ square: source }).length);
      },
      onDrop: handleOpeningDrop,
      onSnapEnd: () => { clearHighlights(); renderMainOpeningBoard(); },
      pieceTheme: PIECE_THEME
    });
  } else {
    openingBoard.position('start');
  }
  initRightClickDrawing('openingBoard');
  if (window.initBoardClickToMove) {
    window.initBoardClickToMove('openingBoard', () => {
      if (isOpponentMoving || openingGame.turn() !== getMainOpeningPlayerColor() || openingPremoveQueue.length) {
        rebuildMainOpeningPremove();
        return openingVirtualGame || openingGame;
      }
      return openingGame;
    }, handleOpeningDrop, {
      canSelect: piece => Boolean(
        currentOpening &&
        piece &&
        piece.color === getMainOpeningPlayerColor() &&
        !openingGame.game_over() &&
        currentMoveIndex < currentOpening.moves.length
      )
    });
  }

  setTimeout(() => { if (openingBoard) openingBoard.resize(); }, 100);
  document.getElementById('openingNav').style.display = 'flex';
  updateOpeningView();
  if (openingGame.turn() !== getMainOpeningPlayerColor()) playMainOpeningOpponentMove();
}

function handleOpeningDrop(source, target) {
  if (!currentOpening || openingGame.game_over()) return 'snapback';
  const playerColor = getMainOpeningPlayerColor();
  const planningMode =
    isOpponentMoving ||
    openingGame.turn() !== playerColor ||
    openingPremoveQueue.length > 0;

  if (planningMode) {
    const planned = window.ChessPremove
      ? window.ChessPremove.add(getMainOpeningPremoveBase(), playerColor, openingPremoveQueue, {
          from: source, to: target, promotion: 'q'
        })
      : { ok: false };
    if (!planned.ok) return 'snapback';
    openingPremoveQueue = planned.queue;
    openingVirtualGame = planned.virtualGame;
    renderMainOpeningBoard();
    return;
  }

  if (currentMoveIndex >= currentOpening.moves.length) return 'snapback';
  let move = null;
  try { move = openingGame.move({ from: source, to: target, promotion: 'q' }); } catch (_) {}
  if (!move) return 'snapback';

  const expectedMove = new Chess();
  for (let i = 0; i < currentMoveIndex; i++) {
    try { expectedMove.move(currentOpening.moves[i]); } catch (_) {}
  }
  let expected = null;
  try { expected = expectedMove.move(currentOpening.moves[currentMoveIndex]); } catch (_) {}
  if (!expected || move.from !== expected.from || move.to !== expected.to ||
      (move.promotion || '') !== (expected.promotion || '')) {
    openingGame.undo();
    errorSound.currentTime = 0;
    errorSound.play().catch(() => {});
    return 'snapback';
  }

  moveSound.currentTime = 0;
  moveSound.play().catch(() => {});
  currentMoveIndex++;
  updateOpeningView();

  if (openingGame.turn() !== playerColor && currentMoveIndex < currentOpening.moves.length) {
    playMainOpeningOpponentMove();
  }
  return undefined;
}

function updateOpeningView() {
  if (!currentOpening) return;
  
  openingGame = new Chess();
  for (let i = 0; i < currentMoveIndex; i++) {
    openingGame.move(currentOpening.moves[i]);
  }
  renderMainOpeningBoard();
  
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
      stopMainOpeningPendingMove();
      currentMoveIndex = +chip.dataset.idx;
      updateOpeningView();
    };
  });
}

function stopMainOpeningPendingMove() {
  openingBotMoveVersion++;
  isOpponentMoving = false;
  openingPremoveQueue = [];
  openingVirtualGame = null;
}

document.getElementById('openingStart').onclick = () => { stopMainOpeningPendingMove(); currentMoveIndex = 0; updateOpeningView(); };
document.getElementById('openingPrev').onclick = () => { if (currentMoveIndex > 0) { stopMainOpeningPendingMove(); currentMoveIndex--; updateOpeningView(); } };
document.getElementById('openingNext').onclick = () => {
  if (currentOpening && currentMoveIndex < currentOpening.moves.length) {
    stopMainOpeningPendingMove();
    currentMoveIndex++;
    updateOpeningView();
  }
};
document.getElementById('openingEnd').onclick = () => { if (currentOpening) { stopMainOpeningPendingMove(); currentMoveIndex = currentOpening.moves.length; updateOpeningView(); } };

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
  if (!boardEl) return;

  // Старый плавающий слой мог позиционироваться относительно страницы,
  // а не самой доски. Удаляем его и прикрепляем отметку прямо к клетке.
  boardEl.querySelector('.custom-overlay')?.remove();
  boardEl.querySelectorAll('.board-badge').forEach(node => node.remove());

  if (!moveData || !moveData.uci || moveData.uci.length < 4) return;
  const toSquare = moveData.uci.slice(2, 4);
  if (!/^[a-h][1-8]$/.test(toSquare)) return;

  const squareEl = boardEl.querySelector('.square-' + toSquare);
  if (!squareEl) return;

  const classMap = {
    brilliant: { text: '!!', title: 'Бриллиантовый ход', css: 'badge-brilliant' },
    great: { text: '!', title: 'Замечательный ход', css: 'badge-great' },
    best: { text: '★', title: 'Лучший ход', css: 'badge-best' },
    excellent: { text: '✓', title: 'Отличный ход', css: 'badge-excellent' },
    good: { text: '✓', title: 'Хороший ход', css: 'badge-good' },
    inaccuracy: { text: '?!', title: 'Неточность', css: 'badge-inaccuracy' },
    mistake: { text: '?', title: 'Ошибка', css: 'badge-mistake' },
    miss: { text: '✗', title: 'Промах', css: 'badge-miss' },
    blunder: { text: '??', title: 'Зевок', css: 'badge-blunder' },
    book: { text: '📖', title: 'Дебютный ход', css: 'badge-book' },
    forced: { text: '□', title: 'Вынужденный ход', css: 'badge-forced' }
  };

  const marker = classMap[moveData.classification];
  const badge = document.createElement('div');
  badge.className = 'board-badge';
  badge.style.position = 'absolute';
  badge.style.top = '3px';
  badge.style.right = '3px';
  badge.style.left = 'auto';
  badge.style.transform = 'none';
  badge.textContent = marker ? marker.text : (
    moveData.is_mate
      ? (moveData.mate_in > 0 ? 'М' + moveData.mate_in : '-М' + Math.abs(moveData.mate_in))
      : (Number(moveData.eval) > 0 ? '+' : '') + Number(moveData.eval || 0).toFixed(1)
  );

  const sacrifice = moveData.sacrifice_details;
  badge.title = marker ? marker.title + ' · клетка ' + toSquare : 'Оценка после хода: ' + badge.text;
  if (sacrifice) {
    badge.title += ' · Жертва: ' + sacrifice.piece + '; соперник мог ответить ' + sacrifice.recapture_san;
  }
  if (marker) badge.classList.add(marker.css);

  // Chessboard.js already marks each square with its algebraic coordinate.
  // Making the square a positioning context keeps the badge on the right
  // square in both board orientations and at every screen size.
  squareEl.style.position = 'relative';
  squareEl.appendChild(badge);
}
function renderEvalAdvantageDots(evals, currentIndex = -1) {
  const container = document.getElementById('evalAdvantageDots');
  if (!container) return;

  if (!container.dataset.bound) {
    container.addEventListener('click', event => {
      const dot = event.target.closest('button[data-move-index]');
      if (!dot) return;
      const index = Number(dot.dataset.moveIndex);
      if (Number.isInteger(index) && typeof window.showAnalysisMove === 'function') {
        window.showAnalysisMove(index);
      }
    });
    container.dataset.bound = '1';
  }

  if (!Array.isArray(analysisMoves) || !analysisMoves.length) {
    container.innerHTML = '<span class="eval-dots-empty">Маркеры качества ходов появятся после анализа</span>';
    return;
  }

  const qualityLabels = {
    brilliant: 'Бриллиантовый',
    great: 'Замечательный',
    best: 'Лучший',
    excellent: 'Отличный',
    good: 'Хороший',
    inaccuracy: 'Неточность',
    mistake: 'Ошибка',
    miss: 'Промах',
    blunder: 'Зевок',
    book: 'Теория',
    forced: 'Вынужденный'
  };

  const qualityClasses = {
    brilliant: 'quality-brilliant',
    great: 'quality-great',
    best: 'quality-best',
    excellent: 'quality-excellent',
    good: 'quality-good',
    inaccuracy: 'quality-inaccuracy',
    mistake: 'quality-mistake',
    miss: 'quality-miss',
    blunder: 'quality-blunder',
    book: 'quality-book',
    forced: 'quality-forced'
  };

  container.innerHTML = analysisMoves.map((move, index) => {
    const value = Number(Array.isArray(evals) ? evals[index] : NaN);
    const scoreText = Number.isFinite(value)
      ? (value > 0 ? '+' : '') + value.toFixed(1)
      : 'оценка недоступна';
    const quality = move?.classification || '';
    const qualityLabel = qualityLabels[quality] || 'Без категории';
    const qualityClass = qualityClasses[quality] || 'quality-unclassified';
    const moveNumber = Number(move?.move_num) || (Math.floor(index / 2) + 1);
    const sideToMove = move?.mover === 'white'
      ? 'белые'
      : move?.mover === 'black'
        ? 'чёрные'
        : index % 2 === 0 ? 'белые' : 'чёрные';
    const san = move?.san ? ' · ' + move.san : '';
    const title = 'Ход ' + moveNumber + ' · ' + sideToMove + san
      + ' · ' + qualityLabel + ' · оценка позиции: ' + scoreText;

    return `<button type="button"
      class="eval-advantage-dot ${qualityClass}${index === currentIndex ? ' current' : ''}"
      data-move-index="${index}"
      aria-label="${title}"
      title="${title}"></button>`;
  }).join('');
}

function drawGraph(evals, currentIndex = -1) {
  renderEvalAdvantageDots(evals, currentIndex);
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
  currentAnalysisPgn = String(pgn || '');
  const downloadPgnButton = document.getElementById('analysisDownloadPgnBtn');
  if (downloadPgnButton) downloadPgnButton.disabled = !currentAnalysisPgn;
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

  const ANALYSIS_VERSION = 'v14-move-evaluations-deeper-analysis';
  const cacheKey = `analysis_${ANALYSIS_VERSION}_${gameUrl || pgn.slice(0, 50)}`;
  const cachedData = localStorage.getItem(cacheKey);
  if (cachedData) {
    try {
      const data = JSON.parse(cachedData);
      if (data && Array.isArray(data.moves) && data.moves.every(move => Object.prototype.hasOwnProperty.call(move, 'next_top_moves'))) {
        saveMyEndgameFromPgn(pgn, gameUrl, data);
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
    saveMyEndgameFromPgn(pgn, gameUrl, data);
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
  if (!move) return 0;

  const storedAccuracy = move.move_accuracy == null ? NaN : Number(move.move_accuracy);
  const accuracyVersion = Number(move.move_accuracy_version || 0);
  if (accuracyVersion >= 3 && Number.isFinite(storedAccuracy)) {
    return Math.max(0, Math.min(100, storedAccuracy));
  }

  // Старые отчёты пересчитываем по более строгой кривой потери в сантипешках.
  const rawCpLoss = move.cp_loss == null ? NaN : Number(move.cp_loss);
  if (Number.isFinite(rawCpLoss)) {
    return Math.max(0, Math.min(100, 100 * Math.exp(-0.006 * Math.max(0, rawCpLoss))));
  }

  if (Number.isFinite(storedAccuracy)) {
    return Math.max(0, Math.min(100, storedAccuracy));
  }

  const expectedPointsLoss = move.win_percent_loss == null ? NaN : Number(move.win_percent_loss);
  if (Number.isFinite(expectedPointsLoss)) {
    return Math.max(0, Math.min(100, 100 - expectedPointsLoss));
  }

  const fallbackLoss = {
    brilliant: 0, great: 0.5, best: 0, excellent: 1.5,
    good: 4, inaccuracy: 10, mistake: 22, miss: 30, blunder: 45,
    book: 0, forced: 0
  };
  return 100 - (fallbackLoss[move.classification] ?? 8);
}

function renderAnalysisSummary() {
  const rowsContainer = document.getElementById('analysisCategoryRows');
  if (!rowsContainer) return;

  const moveColor = (move, index) => move?.mover === 'white' || move?.mover === 'black' ? move.mover : (index % 2 === 0 ? 'white' : 'black');
  const whiteMoves = analysisMoves.filter((move, index) => moveColor(move, index) === 'white');
  const blackMoves = analysisMoves.filter((move, index) => moveColor(move, index) === 'black');
  const averageAccuracy = moves => {
    const ratedMoves = moves.filter(move => move?.classification !== 'forced');
    if (!ratedMoves.length) return null;
    return ratedMoves.reduce((sum, move) => sum + getMoveAccuracy(move), 0) / ratedMoves.length;
  };

  const setAccuracy = (value, valueId, fillId) => {
    const valueEl = document.getElementById(valueId);
    const fillEl = document.getElementById(fillId);
    if (valueEl) valueEl.textContent = value === null ? '—' : value.toFixed(1) + '%';
    if (fillEl) fillEl.style.width = value === null ? '0%' : value + '%';
  };
  setAccuracy(averageAccuracy(whiteMoves), 'analysisWhiteAccuracy', 'analysisWhiteAccuracyFill');
  setAccuracy(averageAccuracy(blackMoves), 'analysisBlackAccuracy', 'analysisBlackAccuracyFill');

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
    if (moveColor(move, index) === 'white') count.white += 1;
    else count.black += 1;
  });

  rowsContainer.innerHTML = ANALYSIS_CLASS_ROWS.map(row => {
    const count = counts.get(row.key);
    return `<div class="analysis-category-row">
      <span class="analysis-category-name">${row.label}</span>
      <strong class="analysis-count white-count">${count.white}</strong>
      <span class="analysis-category-icon icon-${row.className}" title="${row.label}">${row.icon}</span>
      <strong class="analysis-count black-count">${count.black}</strong>
    </div>`;
  }).join('');

  const phaseContainer = document.getElementById('analysisPhaseRows');
  if (phaseContainer) {
    const phaseDefinitions = [
      { key: 'opening', label: 'Дебют' },
      { key: 'middlegame', label: 'Миттельшпиль' },
      { key: 'endgame', label: 'Эндшпиль' }
    ];
    phaseContainer.innerHTML = phaseDefinitions.map(phase => {
      const phaseMoves = analysisMoves.filter(
        move => move?.phase === phase.key && move?.classification !== 'forced'
      );
      const accuracy = averageAccuracy(phaseMoves);
      const label = accuracy === null ? '—' : accuracy.toFixed(1) + '%';
      const width = accuracy === null ? 0 : accuracy;
      return `<div class="analysis-phase-row">
        <span>${phase.label}</span>
        <div class="analysis-phase-track"><i style="width:${width}%"></i></div>
        <strong>${label}</strong>
      </div>`;
    }).join('');
  }

  const deepSummary = document.getElementById('analysisDeepSummary');
  if (deepSummary) {
    const deepCount = analysisMoves.filter(move => move?.deep_analysis).length;
    const timePressureCount = analysisMoves.filter(move => move?.is_time_pressure).length;
    deepSummary.textContent = 'Глубоко перепроверено позиций: ' + deepCount
      + ' · ходов в цейтноте: ' + timePressureCount;
  }

  const keyMoments = document.getElementById('analysisKeyMoments');
  if (keyMoments) {
    if (!keyMoments.dataset.bound) {
      keyMoments.addEventListener('click', event => {
        const button = event.target.closest('button[data-move-index]');
        if (!button) return;
        const index = Number(button.dataset.moveIndex);
        if (Number.isInteger(index)) window.showAnalysisMove(index);
      });
      keyMoments.dataset.bound = '1';
    }

    const errorMoments = analysisMoves
      .map((move, index) => ({ move, index }))
      .filter(item => ['blunder', 'miss', 'mistake'].includes(item.move?.classification))
      .sort((a, b) => Number(b.move.win_percent_loss || 0) - Number(a.move.win_percent_loss || 0))
      .slice(0, 3);

    const bestMoments = analysisMoves
      .map((move, index) => ({ move, index }))
      .filter(item => ['brilliant', 'great'].includes(item.move?.classification))
      .slice(0, 2);

    const selectedMoments = [...errorMoments, ...bestMoments]
      .sort((a, b) => a.index - b.index);

    const momentLabels = {
      brilliant: 'Бриллиант',
      great: 'Замечательный',
      blunder: 'Зевок',
      miss: 'Промах',
      mistake: 'Ошибка'
    };

    keyMoments.innerHTML = '';
    if (!selectedMoments.length) {
      const empty = document.createElement('div');
      empty.className = 'analysis-stats-empty';
      empty.textContent = 'Ярких переломных моментов не найдено.';
      keyMoments.appendChild(empty);
    } else {
      selectedMoments.forEach(({ move, index }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'analysis-key-moment';
        button.dataset.moveIndex = String(index);

        const number = Number(move.move_num) || Math.floor(index / 2) + 1;
        const side = move.mover === 'black' ? 'чёрные' : 'белые';
        const category = momentLabels[move.classification] || 'Ход';
        const loss = Number(move.win_percent_loss);
        const detail = Number.isFinite(loss) && loss > 0
          ? loss.toFixed(1) + ' п.п.'
          : (move.san || '');

        const label = document.createElement('span');
        label.className = 'analysis-key-moment-label';
        label.textContent = category;

        const notation = document.createElement('strong');
        notation.textContent = number + '. ' + (move.san || '—');

        const meta = document.createElement('small');
        meta.textContent = side + (detail ? ' · ' + detail : '');

        button.append(label, notation, meta);
        keyMoments.appendChild(button);
      });
    }
  }
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
  else if (classification === 'great') effectType = 'great';
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
  const drillsButton = document.getElementById('analysisSendToDrillsBtn');
  if (drillsButton) {
    const drillCount = getAnalysisTrainingOpportunities().length;
    drillsButton.disabled = !hasMoves || drillCount === 0;
    drillsButton.textContent = drillCount ? '⚡ В тактику · ' + drillCount : '⚡ В тактику';
  }
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
  activeAnalysisChallenge = null;
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
    if (activeAnalysisChallenge) {
      const textEl = document.getElementById('analysisMoveInsightText');
      if (textEl) {
        textEl.textContent = 'В этой задаче лучший ход не требует превращения пешки. Попробуй другой вариант.';
      }
      return 'snapback';
    }
    pendingPromotion = { source, target, context: 'analysis' };
    document.getElementById('promotionModal').style.display = 'flex';
    return 'snapback';
  }

  let move = null;
  try { move = analysisGame.move({ from: source, to: target }); } catch(e) {}
  if (!move) return 'snapback';
  const moveWithUci = { ...move, uci: moveObjectToUci(move) };
  if (activeAnalysisChallenge) {
    const solved = handleAnalysisChallengeMove(moveWithUci);
    return solved ? undefined : 'snapback';
  }

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
function formatMoveEvaluation(move) {
  if (!move) return '';
  const hasEval = move.eval_after_white !== undefined && move.eval_after_white !== null;
  if (!hasEval) return '';
  const score = Number(move.eval_after_white);
  if (move.eval_after_is_mate) {
    const mateIn = Number(move.eval_after_mate_in || 0);
    return (mateIn > 0 ? 'М' : '-М') + Math.abs(mateIn);
  }
  if (!Number.isFinite(score)) return '';
  return (score > 0 ? '+' : '') + score.toFixed(1);
}

function renderMoveTable() {
  const tbody = document.getElementById('moveTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const classMeta = Object.fromEntries(ANALYSIS_CLASS_ROWS.map(row => [row.key, row]));

  const renderCell = (move, index, color, moveNum) => {
    if (!move) return '...';
    const san = String(move.san || '');
    const meta = classMeta[move.classification];
    const label = meta
      ? '<span class="move-class-icon cls-' + meta.className + '" title="' + meta.label + '" aria-label="' + meta.label + '" role="img">' + meta.icon + '</span>'
      : '';
    const evaluation = formatMoveEvaluation(move);
    const evalHtml = evaluation
      ? '<span class="move-eval" title="Оценка позиции после хода; знак «+» означает преимущество белых">' + evaluation + '</span>'
      : '';
    return '<span class="move-cell-wrap"><button type="button" class="move-cell" data-move-index="' + index +
      '" aria-label="Перейти к ходу ' + moveNum + ', ' + color + ': ' + san + '">' + san +
      '</button>' + label + evalHtml + '</span>';
  };

  for (let i = 0; i < analysisMoves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = analysisMoves[i];
    const blackMove = analysisMoves[i + 1];
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="col-num">' + moveNum + '</td>' +
      '<td class="col-white">' + renderCell(whiteMove, i, 'белые', moveNum) + '</td>' +
      '<td class="col-black">' + renderCell(blackMove, i + 1, 'чёрные', moveNum) + '</td>';
    tbody.appendChild(tr);
  }
}

function getAnalysisTrainingOpportunities() {
  const retryable = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);
  const gameLabel = (currentWhitePlayer || 'Белые') + ' — ' + (currentBlackPlayer || 'Чёрные');
  const date = new Date().toLocaleDateString('ru-RU');
  let playerColor = null;
  if (myUsername) {
    const username = String(myUsername).trim().toLowerCase();
    if (String(currentWhitePlayer || '').trim().toLowerCase() === username) playerColor = 'white';
    else if (String(currentBlackPlayer || '').trim().toLowerCase() === username) playerColor = 'black';
  }
  return analysisMoves.map((move, index) => {
    if (!move || !retryable.has(String(move.classification || ''))) return null;
    if (move.missed_tactic !== true) return null;
    if (playerColor && move.mover !== playerColor) return null;
    if (!move.before_fen || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(String(move.best_move_uci || ''))) return null;
    const accepted = Array.isArray(move.acceptable_moves_uci)
      ? [...new Set(move.acceptable_moves_uci.filter(value => typeof value === 'string'))]
      : [];
    if (accepted.includes(move.uci)) return null;
    if (!accepted.includes(move.best_move_uci)) accepted.unshift(move.best_move_uci);
    const alternatives = Array.isArray(move.acceptable_moves) ? move.acceptable_moves : [];
    const bestCandidate = alternatives.find(item => item && item.uci === move.best_move_uci);
    const bestLine = bestCandidate && Array.isArray(bestCandidate.line_san)
      ? bestCandidate.line_san
      : (Array.isArray(move.best_line_san) ? move.best_line_san : []);
    return {
      id: 'analysis-' + index + '-' + move.move_num + '-' + move.uci + '-' + String(move.before_fen).slice(0, 14),
      gameLabel,
      date,
      event: 'Текущий анализ',
      source: 'analysis',
      color: move.mover || 'white',
      moveNum: Number(move.move_num) || Math.floor(index / 2) + 1,
      playedSan: move.san || move.uci,
      classification: move.classification,
      cpLoss: Number(move.cp_loss || 0),
      beforeFen: move.before_fen,
      bestMoveUci: move.best_move_uci,
      bestMoveSan: move.best_move_san || move.best_move_uci,
      bestLineSan: bestLine.slice(0, 4),
      bestMoveMotifs: Array.isArray(move.best_move_motifs) ? move.best_move_motifs : [],
      acceptableMovesUci: accepted,
      acceptableMovesSan: alternatives.map(item => item && item.san).filter(Boolean),
      solved: false,
      revealed: false
    };
  }).filter(Boolean);
}

function sendAnalysisMistakesToTraining() {
  const items = getAnalysisTrainingOpportunities();
  const status = document.getElementById('analysisMoveInsightText');
  if (!items.length) {
    if (status) status.textContent = 'В этой партии нет твоих ошибок с сохранённой позицией для тактической тренировки.';
    return;
  }
  window.dispatchEvent(new CustomEvent('chessTrainer:add-analysis-drills', {
    detail: { opportunities: items }
  }));
  const errorsTab = document.querySelector('.tab-btn[data-tab="errors"]');
  if (errorsTab) errorsTab.click();
}

// Повтор выбранной ошибки и перенос ошибок партии в тактические задания.
function updateAnalysisRetryButton(moveData) {
  const button = document.getElementById('analysisRetryMistakeBtn');
  if (!button) return;

  if (activeAnalysisChallenge) {
    button.hidden = false;
    button.textContent = 'Выйти из тренировки';
    button.classList.add('is-active');
    return;
  }

  const retryable = ['inaccuracy', 'mistake', 'miss', 'blunder'];
  const hasBestMove = Boolean(
    moveData
    && moveData.best_move_uci
    && moveData.before_fen
    && moveData.best_move_uci.length === 4
    && retryable.includes(moveData.classification)
  );

  button.hidden = !hasBestMove;
  button.textContent = 'Попробовать найти лучший ход';
  button.classList.remove('is-active');
}

function startAnalysisMistakeChallenge() {
  const button = document.getElementById('analysisRetryMistakeBtn');
  const titleEl = document.getElementById('analysisMoveInsightTitle');
  const textEl = document.getElementById('analysisMoveInsightText');
  const bestEl = document.getElementById('analysisMoveInsightBest');
  const metaEl = document.getElementById('analysisMoveInsightMeta');
  if (activeAnalysisChallenge) {
    activeAnalysisChallenge = null;
    if (currentAnalysisIndex >= 0) showAnalysisMove(currentAnalysisIndex);
    return;
  }

  const moveData = analysisMoves[currentAnalysisIndex];
  if (
    !moveData
    || !moveData.before_fen
    || !moveData.best_move_uci
    || moveData.best_move_uci.length !== 4
  ) return;

  let challengeGame;
  try {
    challengeGame = new Chess(moveData.before_fen);
  } catch (error) {
    if (textEl) textEl.textContent = 'Не удалось восстановить позицию для тренировки.';
    return;
  }

  const acceptedMoves = Array.isArray(moveData.acceptable_moves_uci)
    ? moveData.acceptable_moves_uci.filter(value => typeof value === 'string')
    : [];
  if (!acceptedMoves.includes(moveData.best_move_uci)) {
    acceptedMoves.unshift(moveData.best_move_uci);
  }

  activeAnalysisChallenge = {
    moveIndex: currentAnalysisIndex,
    beforeFen: moveData.before_fen,
    bestMoveUci: moveData.best_move_uci,
    bestMoveSan: moveData.best_move_san || moveData.best_move_uci,
    acceptedMoves: [...new Set(acceptedMoves)],
    bestLine: Array.isArray(moveData.best_line_san) ? moveData.best_line_san : []
  };

  analysisGame = challengeGame;
  if (analysisBoard) analysisBoard.position(challengeGame.fen());
  drawArrows(null);
  const overlay = document.querySelector('#analysisBoard .custom-overlay');
  if (overlay) overlay.innerHTML = '';
  stopAnalysisPlayback();

  if (titleEl) titleEl.textContent = 'Тренировка ошибки · найди лучший ход';
  if (textEl) textEl.textContent = 'Позиция восстановлена до твоего хода. Найди сильнейшее продолжение самостоятельно. Подсказка пока скрыта.';
  if (bestEl) bestEl.textContent = 'Сделай ход на доске. Подойдут и равноценные варианты Stockfish.';
  if (metaEl) metaEl.textContent = 'Режим тренировки · ' + (moveData.mover === 'black' ? 'ход чёрных' : 'ход белых');
  updateAnalysisRetryButton(moveData);
}

function handleAnalysisChallengeMove(moveWithUci) {
  const challenge = activeAnalysisChallenge;
  if (!challenge) return false;

  const playedUci = moveWithUci && moveWithUci.uci;
  const accepted = challenge.acceptedMoves.includes(playedUci);
  const textEl = document.getElementById('analysisMoveInsightText');
  const bestEl = document.getElementById('analysisMoveInsightBest');
  const metaEl = document.getElementById('analysisMoveInsightMeta');

  if (!accepted) {
    analysisGame.undo();
    if (analysisBoard) analysisBoard.position(challenge.beforeFen);
    if (textEl) {
      textEl.textContent = 'Не тот ход. Позиция возвращена назад — попробуй ещё раз. Проверь шахи, взятия и угрозы соперника.';
    }
    if (bestEl) bestEl.textContent = 'Подсказка пока не открыта.';
    if (errorSound && typeof errorSound.play === 'function') {
      const sound = errorSound.play();
      if (sound && typeof sound.catch === 'function') sound.catch(() => {});
    }
    return false;
  }

  activeAnalysisChallenge = null;
  currentAnalysisIndex = challenge.moveIndex;
  if (analysisBoard) analysisBoard.position(analysisGame.fen());
  playMoveSound();

  const moveData = analysisMoves[challenge.moveIndex];
  const label = moveData?.best_move_san || challenge.bestMoveSan;
  if (textEl) textEl.textContent = 'Верно! Ты нашёл лучший или равноценный ход. Сравни идею с продолжением движка.';
  if (bestEl) {
    bestEl.textContent = 'Твой ход: ' + (moveWithUci.san || label)
      + (challenge.bestLine.length ? ' · Линия Stockfish: ' + challenge.bestLine.join(' ') : '');
  }
  if (metaEl) metaEl.textContent = 'Задача решена · правильный вариант найден';
  updateAnalysisRetryButton(moveData);
  updateAnalysisProgress(challenge.moveIndex);
  refreshAnalysisNavigation();
  return true;
}

function renderAnalysisMoveInsight(moveData) {
  const titleEl = document.getElementById('analysisMoveInsightTitle');
  const textEl = document.getElementById('analysisMoveInsightText');
  const bestEl = document.getElementById('analysisMoveInsightBest');
  const detailsEl = document.getElementById('analysisMoveInsightMeta');
  if (!titleEl || !textEl || !bestEl || !detailsEl) return;

  const labels = {
    brilliant: 'Бриллиантовый ход',
    great: 'Замечательный ход',
    best: 'Лучший ход',
    excellent: 'Отличный ход',
    good: 'Хороший ход',
    inaccuracy: 'Неточность',
    mistake: 'Ошибка',
    miss: 'Пропущенная возможность',
    blunder: 'Зевок',
    book: 'Теория',
    forced: 'Вынужденный ход'
  };
  const phaseLabels = {
    opening: 'дебют',
    middlegame: 'миттельшпиль',
    endgame: 'эндшпиль'
  };
  const motifLabels = {
    mate: 'мат',
    mate_in_2: 'матовая атака',
    fork: 'вилка',
    pin: 'связка',
    discovered_check: 'вскрытый шах',
    check: 'шах',
    capture: 'взятие'
  };
  const motifExplanations = {
    mate: 'форсированное завершение партии',
    mate_in_2: 'неотразимая матовая сеть',
    fork: 'одновременная атака на две или более цели',
    pin: 'связка фигуры, которая не может безопасно отойти',
    discovered_check: 'вскрытие линии шаха другой фигурой',
    check: 'темп с шахом королю',
    capture: 'выигрыш материала'
  };

  const moveNumber = Number(moveData.move_num) || Math.floor(currentAnalysisIndex / 2) + 1;
  const mover = moveData.mover === 'black' ? 'чёрные' : 'белые';
  titleEl.textContent = moveNumber + '. ' + (moveData.san || 'Ход') + ' — '
    + (labels[moveData.classification] || 'Оценка хода');

  const loss = Number(moveData.win_percent_loss);
  const accuracy = getMoveAccuracy(moveData);
  const phase = phaseLabels[moveData.phase] || 'этап не определён';
  const messages = [];

  if (moveData.classification === 'brilliant' && moveData.sacrifice_details) {
    const sacrifice = moveData.sacrifice_details;
    messages.push(
      'Это тихая жертва: ты предложил сопернику взять ' + sacrifice.piece
      + '. Возможное взятие: ' + sacrifice.recapture_san
      + '. Глубокая проверка Stockfish подтвердила, что ход сохраняет оценку.'
    );
  } else if (moveData.is_sacrifice && moveData.sacrifice_details) {
    const sacrifice = moveData.sacrifice_details;
    messages.push(
      'Ты предложил сопернику взять ' + sacrifice.piece
      + ' (' + sacrifice.recapture_san + '), но движок не подтвердил достаточную компенсацию, чтобы назвать ход бриллиантовым.'
    );
  } else if (moveData.missed_tactic) {
    messages.push('Ты пропустил тактическую возможность в этой позиции.');
  } else if (moveData.classification === 'blunder') {
    messages.push('Ход резко ухудшил оценку позиции. Проверь угрозы соперника и форсированные ответы перед следующим ходом.');
  } else if (moveData.classification === 'mistake' || moveData.classification === 'inaccuracy') {
    messages.push('После этого хода позиция стала заметно хуже. Сравни сыгранный ход с предложением Stockfish.');
  } else if (moveData.classification === 'forced') {
    messages.push('Практически не было выбора: это вынужденный ответ.');
  } else if (moveData.classification === 'book') {
    messages.push('Ход распознан как дебютная теория.');
  } else {
    messages.push('Ход сохранил большую часть оценки позиции. Продолжай искать шахи, взятия и прямые угрозы.');
  }

  if (moveData.best_move_san && moveData.best_move_san !== moveData.san) {
    messages.push('Более сильный вариант: ' + moveData.best_move_san + '.');
  }
  if (Number.isFinite(loss) && loss > 0) {
    messages.push('Потеря ожидаемого результата: ' + loss.toFixed(1) + ' п.п.');
  }
  const motifs = (moveData.best_move_motifs || [])
    .map(motif => motifLabels[motif])
    .filter(Boolean);
  if (motifs.length) {
    const uniqueMotifs = [...new Set(motifs)];
    const motifDetails = uniqueMotifs.map(motif => motifExplanations[motif]).filter(Boolean);
    messages.push('Тактическая идея лучшего продолжения: '
      + (motifDetails.length ? motifDetails.join('; ') : uniqueMotifs.join(', ')) + '.');
  }
  const cpLoss = Number(moveData.cp_loss ?? moveData.centipawn_loss);
  if (Number.isFinite(cpLoss) && cpLoss >= 15) {
    messages.push('Сыгранный ход уступил лучшему примерно на ' + (cpLoss / 100).toFixed(2)
      + ' пешки по оценке Stockfish.');
  }
  textEl.textContent = messages.join(' ');
  bestEl.textContent = moveData.best_line_san?.length
    ? 'Линия Stockfish: ' + moveData.best_line_san.join(' ')
    : moveData.best_move_san
      ? 'Лучший ход Stockfish: ' + moveData.best_move_san
      : 'Для этой позиции нет сохранённой лучшей линии.';

  const meta = [
    accuracy.toFixed(1) + '% точность хода',
    phase,
    moveData.deep_analysis
      ? 'перепроверено на глубине ' + (moveData.analysis_depth_used || '—')
      : 'быстрый проход',
    moveData.is_time_pressure ? 'ход в цейтноте' : null,
    moveData.time_spent != null ? 'время на ход: ' + Math.round(moveData.time_spent) + ' с' : null
  ].filter(Boolean);
  detailsEl.textContent = mover + ' · ' + meta.join(' · ');
}

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
  if (activeAnalysisChallenge && activeAnalysisChallenge.moveIndex !== targetIndex) {
    activeAnalysisChallenge = null;
  }
  drawGraph(fullEvals, targetIndex);
  drawBoardBadge(moveData);
  renderAnalysisMoveInsight(moveData);
  updateAnalysisRetryButton(moveData);

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
function downloadCurrentAnalysisPgn() {
  const pgn = String(currentAnalysisPgn || '').trim();
  if (!pgn) return;
  const safePart = value => String(value || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 48);
  const white = safePart(getPgnHeader(pgn, 'White', 'White'));
  const black = safePart(getPgnHeader(pgn, 'Black', 'Black'));
  const date = safePart(getPgnHeader(pgn, 'Date', new Date().toISOString().slice(0, 10)));
  const blob = new Blob([pgn.endsWith('\n') ? pgn : pgn + '\n'], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = [date, white, 'vs', black].filter(Boolean).join('_') + '.pgn';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

(function initAnalysisNavigationControls() {
  const downloadButton = document.getElementById('analysisDownloadPgnBtn');
  if (downloadButton && !downloadButton.dataset.bound) {
    downloadButton.addEventListener('click', downloadCurrentAnalysisPgn);
    downloadButton.dataset.bound = '1';
  }
  const retryButton = document.getElementById('analysisRetryMistakeBtn');
  if (retryButton && !retryButton.dataset.bound) {
    retryButton.addEventListener('click', startAnalysisMistakeChallenge);
    retryButton.dataset.bound = '1';
  }
  const drillsButton = document.getElementById('analysisSendToDrillsBtn');
  if (drillsButton && !drillsButton.dataset.bound) {
    drillsButton.addEventListener('click', sendAnalysisMistakesToTraining);
    drillsButton.dataset.bound = '1';
  }
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
