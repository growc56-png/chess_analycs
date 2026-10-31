const MATES = [
  { id: "kq", name: "Король и ферзь", fen: "8/8/8/4k3/8/8/6K1/7Q w - - 0 1", desc: "Мат ферзём и королём за 30 секунд." },
  { id: "kr", name: "Король и ладья", fen: "8/8/8/4k3/8/8/6K1/7R w - - 0 1", desc: "Мат ладьёй и королём («лесенкой»)." },
  { id: "kbb", name: "Король и два слона", fen: "8/8/8/4k3/8/3B4/6K1/2B5 w - - 0 1", desc: "Мат двумя слонами." },
  { id: "kbn", name: "Король, конь и слон", fen: "8/8/8/4k3/8/3N4/6K1/2B5 w - - 0 1", desc: "Сложный мат: конь и слон." }
];

let TIME_LIMIT = 30.0;
const BOT_LEVEL = 6;
let board = null, game = new Chess(), currentMate = null, gameActive = false, premoveQueue = [];
let timerId = null, timerActive = false, timeLeft = TIME_LIMIT, lastTickAt = 0;
let mateRecords = {};

function loadRecords() {
  fetch('/api/mates/records').then(res => res.json()).then(data => {
    mateRecords = data.records;
    renderMates();
  }).catch(() => renderMates());
}

function renderMates() {
  const list = document.getElementById('mateList');
  list.innerHTML = MATES.map(m => {
    const rec = mateRecords[m.id] ? `<span class="record-time">${mateRecords[m.id].toFixed(1)}s</span>` : '';
    return `<div class="list-item" data-id="${m.id}"><span>${m.name}</span>${rec}</div>`;
  }).join('');
  list.querySelectorAll('.list-item').forEach(el => {
    el.onclick = () => selectMate(MATES.find(m => m.id === el.dataset.id));
  });
  if (MATES.length > 0 && !currentMate) selectMate(MATES[0]);
}

function selectMate(mate) {
  currentMate = mate;
  document.querySelectorAll('#mateList .list-item').forEach(i => i.classList.remove('active'));
  const el = document.querySelector(`#mateList .list-item[data-id="${mate.id}"]`);
  if (el) el.classList.add('active');

  game = new Chess(mate.fen);
  if (!board) {
    board = Chessboard('mateBoard', {
      position: mate.fen, draggable: true, onDragStart: onMateDragStart, onDrop: handleDrop,
      onSnapEnd: () => { board.position(game.fen()); clearHighlights(); }, pieceTheme: '/img/pieces/{piece}.png'
    });
    initRightClickDrawing('mateBoard');
  } else { board.position(mate.fen); }

  stopTimer(); timeLeft = TIME_LIMIT; gameActive = false; premoveQueue = [];
  updateTimerDisplay();
  document.getElementById('mateDesc').textContent = mate.desc;
  document.getElementById('mainBtn').textContent = '▶ Старт';
  document.getElementById('mainBtn').classList.add('primary');
  document.getElementById('timeInput').disabled = false;
  setFeedback('Нажми «Старт», чтобы начать', 'info');
  document.getElementById('mateModal').classList.remove('active');
}

function highlightLegalMoves(game, source) {
  clearHighlights();
  game.moves({ square: source, verbose: true }).forEach(move => {
    const el = document.querySelector(`.square-${move.to}`);
    if (el) el.classList.add(move.flags.includes('c') || move.flags.includes('e') ? 'capture-hint' : 'move-hint');
  });
}
function clearHighlights() { document.querySelectorAll('.move-hint, .capture-hint').forEach(el => el.classList.remove('move-hint', 'capture-hint')); }

function onMateDragStart(source, piece) {
  if (!gameActive || piece.search(/^b/) !== -1) return false;
  if (game.turn() === 'w') {
    if (game.moves({ square: source }).length === 0) return false;
    highlightLegalMoves(game, source);
  }
}

function handleDrop(source, target) {
  if (!gameActive) return 'snapback';
  if (game.turn() !== 'w') {
    let dummyFen = game.fen().replace(/ (b|w) /, ' w ');
    let dummyGame = new Chess(dummyFen);
    try { dummyGame.move({ from: source, to: target, promotion: 'q' }); } catch (e) { playSound('error'); return 'snapback'; }
    premoveQueue.push({ from: source, to: target }); return; 
  }
  premoveQueue = [];
  let move = null;
  try { move = game.move({ from: source, to: target, promotion: 'q' }); } catch (e) { playSound('error'); return 'snapback'; }
  if (!move) { playSound('error'); return 'snapback'; }
  playSound(move.flags.includes('c') || move.flags.includes('e') ? 'capture' : 'move');
  board.position(game.fen());
  if (checkMateOrDraw()) return;
  pauseTimer(); setTimeout(() => { makeBlackMove(); }, 400);
}

async function makeBlackMove() {
  if (!gameActive || game.game_over() || game.turn() !== 'b') return;
  try {
    const res = await fetch('/api/bot_move', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ fen: game.fen(), level: BOT_LEVEL }) });
    const data = await res.json();
    if (data.move) {
      try {
        const applied = game.move({ from: data.move.slice(0, 2), to: data.move.slice(2, 4), promotion: 'q' });
        if (applied) { playSound(applied.flags.includes('c') || applied.flags.includes('e') ? 'capture' : 'move'); board.position(game.fen()); }
      } catch (e) {}
    }
  } catch (e) {
    const moves = game.moves(); if (moves.length > 0) { game.move(moves[0]); board.position(game.fen()); }
  } finally {
    resumeTimer();
    if (gameActive) { if (!checkMateOrDraw()) executePremoves(); }
  }
}

function executePremoves() {
  if (premoveQueue.length === 0 || game.game_over() || !gameActive || game.turn() !== 'w') return;
  while (premoveQueue.length > 0 && game.turn() === 'w') {
    let pm = premoveQueue[0]; let move = null;
    try { move = game.move({ from: pm.from, to: pm.to, promotion: 'q' }); } catch (e) {}
    if (move) {
      premoveQueue.shift(); playSound(move.flags.includes('c') || move.flags.includes('e') ? 'capture' : 'move'); board.position(game.fen());
      if (checkMateOrDraw()) return;
    } else { premoveQueue = []; break; }
  }
  if (game.turn() === 'b' && gameActive) { pauseTimer(); setTimeout(() => { makeBlackMove(); }, 400); }
}

function checkMateOrDraw() {
  if (game.in_checkmate()) {
    stopTimer(); gameActive = false; playSound('end');
    const isWin = game.turn() === 'b';
    setFeedback(isWin ? `✅ Мат! Осталось ${timeLeft.toFixed(1)} с.` : '❌ Тебя заматовали.', isWin ? 'ok' : 'err');
    document.getElementById('mainBtn').textContent = '↺ Заново';
    document.getElementById('timeInput').disabled = false; premoveQueue = []; board.position(game.fen());
    
    if (isWin) {
      fetch('/api/mates/records', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ mate_id: currentMate.id, time: TIME_LIMIT - timeLeft }) })
      .then(() => fetch('/api/mates/records')).then(res => res.json()).then(data => {
        mateRecords = data.records; renderMates();
      });
    }
    
    setTimeout(() => { document.getElementById('modalMateResult').textContent = isWin ? 'Мат! Ты победил!' : 'Мат! Ты проиграл'; document.getElementById('modalMateResult').className = isWin ? 'win' : 'loss'; document.getElementById('mateModal').classList.add('active'); }, 300);
    return true;
  }
  if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition() || game.insufficient_material()) {
    stopTimer(); gameActive = false; playSound('end');
    setFeedback('❌ Ничья (пат). Попробуй ещё раз.', 'err');
    document.getElementById('mainBtn').textContent = '↺ Заново';
    document.getElementById('timeInput').disabled = false; premoveQueue = []; board.position(game.fen());
    setTimeout(() => { document.getElementById('modalMateResult').textContent = 'Ничья'; document.getElementById('modalMateResult').className = ''; document.getElementById('mateModal').classList.add('active'); }, 300);
    return true;
  }
  return false;
}

function startTimer() { stopTimer(); timerActive = true; lastTickAt = performance.now(); updateTimerDisplay(); timerId = setInterval(tickTimer, 100); }
function tickTimer() {
  if (!timerActive) return;
  const now = performance.now(); timeLeft = Math.max(0, timeLeft - (now - lastTickAt) / 1000); lastTickAt = now; updateTimerDisplay();
  if (timeLeft <= 0) {
    stopTimer(); gameActive = false; playSound('end');
    setFeedback('⏰ Время вышло! Ты проиграл.', 'err');
    document.getElementById('mainBtn').textContent = '↺ Заново';
    document.getElementById('timeInput').disabled = false; premoveQueue = []; board.position(game.fen());
    setTimeout(() => { document.getElementById('modalMateResult').textContent = 'Время вышло!'; document.getElementById('modalMateResult').className = 'loss'; document.getElementById('mateModal').classList.add('active'); }, 300);
  }
}
function pauseTimer() { timerActive = false; }
function resumeTimer() { if (gameActive && timeLeft > 0) { timerActive = true; lastTickAt = performance.now(); } }
function stopTimer() { timerActive = false; if (timerId) { clearInterval(timerId); timerId = null; } }
function updateTimerDisplay() { const el = document.getElementById('timer'); el.textContent = timeLeft.toFixed(1); el.classList.toggle('low', timeLeft <= 5 && gameActive); }
function setFeedback(text, cls) { const fb = document.getElementById('mateFeedback'); fb.textContent = text; fb.className = 'feedback ' + (cls || ''); }

function startGame() {
  if (!currentMate) return;
  TIME_LIMIT = parseFloat(document.getElementById('timeInput').value) || 30.0; timeLeft = TIME_LIMIT;
  game = new Chess(currentMate.fen); board.position(currentMate.fen);
  gameActive = true; premoveQueue = []; startTimer();
  setFeedback(`Мат за ${TIME_LIMIT} секунд! Твой ход.`, 'info');
  document.getElementById('mainBtn').textContent = '↺ Заново'; document.getElementById('mainBtn').classList.remove('primary');
  document.getElementById('timeInput').disabled = true; document.getElementById('mateModal').classList.remove('active');
}

document.getElementById('mainBtn').onclick = () => { if (gameActive) selectMate(currentMate); else startGame(); };
document.getElementById('hintBtn').onclick = () => { if (currentMate && gameActive) { playSound('move'); highlightLegalMoves(game, currentMate.fen.split(' ')[0]); } };
document.getElementById('modalMateRetryBtn').onclick = () => { document.getElementById('mateModal').classList.remove('active'); startGame(); };
document.getElementById('modalMateCloseBtn').onclick = () => { document.getElementById('mateModal').classList.remove('active'); };
window.addEventListener('resize', () => board && board.resize());
loadRecords();