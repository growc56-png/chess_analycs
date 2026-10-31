const daysMap = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const monthsMap = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

let PLAN = [], currentDay = 1, totalDays = 0;
let puzzleBoard = null, puzzleGame = null, currentPuzzle = null, puzzleSolved = false;
let endgameBoard = null, endgameGame = null, currentEndgame = null;
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
    if (btn.dataset.tab === 'analysis' && analysisBoard) setTimeout(() => analysisBoard.resize(), 50);
    if (btn.dataset.tab === 'blindfold' && blindfoldBoard) setTimeout(() => blindfoldBoard.resize(), 50);
    if (btn.dataset.tab === 'diary') drawDiary();
    if (btn.dataset.tab === 'streak') loadStreak();
  };
});

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
    setTimeout(() => openingBoard.resize(), 100); // <--- ИСПРАВЛЕНИЕ РАЗМЕРА
  }
  
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

  document.getElementById('flipBoardBtn').onclick = () => {
    analysisBoard.flip();
    isBoardFlipped = !isBoardFlipped;
    updatePlayerNamesAndMaterial(analysisGame.fen());
    if (currentAnalysisIndex >= 0 && analysisMoves[currentAnalysisIndex]) {
      drawBoardBadge(analysisMoves[currentAnalysisIndex]);
      if (analysisMoves[currentAnalysisIndex].