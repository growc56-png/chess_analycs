let board = null;
let game = new Chess();
let isBotThinking = false;
let premoveQueue = []; 
let playerColor = 'w'; 

let timeControlMode = "unlimited";
let baseTime = 0, increment = 0, whiteTime = 0, blackTime = 0;
let clockInterval = null, turnStartTime = 0, gameActive = false;

const statusEl = document.getElementById('gameStatus');
const botLevelEl = document.getElementById('botLevel');
const sideSelectEl = document.getElementById('sideSelect');
const timeControlEl = document.getElementById('timeControl');
const playerClockEl = document.getElementById('playerClock');
const botClockEl = document.getElementById('botClock');

function updateStatus(text, className = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + className;
}

function formatTime(seconds) {
  if (seconds === Infinity) return '∞';
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateClocksUI() {
  if (timeControlMode === 'unlimited') {
    playerClockEl.textContent = '∞'; botClockEl.textContent = '∞';
    playerClockEl.className = 'clock'; botClockEl.className = 'clock';
    return;
  }
  if (playerColor === 'w') {
    playerClockEl.textContent = formatTime(whiteTime); botClockEl.textContent = formatTime(blackTime);
  } else {
    playerClockEl.textContent = formatTime(blackTime); botClockEl.textContent = formatTime(whiteTime);
  }
  if (gameActive) {
    if (game.turn() === playerColor) {
      playerClockEl.classList.add('active'); botClockEl.classList.remove('active');
    } else {
      botClockEl.classList.add('active'); playerClockEl.classList.remove('active');
    }
  } else {
    playerClockEl.classList.remove('active'); botClockEl.classList.remove('active');
  }
  const pTime = playerColor === 'w' ? whiteTime : blackTime;
  const bTime = playerColor === 'w' ? blackTime : whiteTime;
  playerClockEl.classList.toggle('low', pTime <= 10 && gameActive);
  botClockEl.classList.toggle('low', bTime <= 10 && gameActive);
}

function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  if (timeControlMode === 'unlimited' || !gameActive) return;
  turnStartTime = performance.now();
  clockInterval = setInterval(() => {
    if (!gameActive) return;
    const elapsed = (performance.now() - turnStartTime) / 1000;
    if (game.turn() === 'w') {
      whiteTime -= elapsed; if (whiteTime <= 0) handleTimeout('w');
    } else {
      blackTime -= elapsed; if (blackTime <= 0) handleTimeout('b');
    }
    turnStartTime = performance.now(); updateClocksUI();
  }, 100);
}

function stopClock() { if (clockInterval) { clearInterval(clockInterval); clockInterval = null; } }
function switchTurn() {
  if (!gameActive || timeControlMode === 'unlimited') return;
  stopClock();
  if (game.turn() === 'b') whiteTime += increment; else blackTime += increment;
  startClock();
}

function handleTimeout(side) {
  stopClock(); gameActive = false; updateClocksUI();
  const isPlayerTimeout = (side === playerColor);
  updateStatus(isPlayerTimeout ? "⏰ Время вышло! Победил бот." : "⏰ У бота кончилось время! Ты победил!", "gameover");
  playSound('end'); showGameOverModal('timeout', !isPlayerTimeout);
}

const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const initialPieces = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const unicodePieces = { P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

function updateMaterial() {
  const boardArr = game.board();
  let whiteScore = 0, blackScore = 0;
  let whitePieces = { p:0, n:0, b:0, r:0, q:0, k:0 };
  let blackPieces = { p:0, n:0, b:0, r:0, q:0, k:0 };
  boardArr.forEach(row => row.forEach(piece => {
    if (piece) {
      if (piece.color === 'w') { whiteScore += pieceValues[piece.type]; whitePieces[piece.type]++; }
      else { blackScore += pieceValues[piece.type]; blackPieces[piece.type]++; }
    }
  }));
  let capturedWhite = [], capturedBlack = [];
  ['p', 'n', 'b', 'r', 'q'].forEach(type => {
    for (let i = 0; i < initialPieces[type] - whitePieces[type]; i++) capturedWhite.push(unicodePieces[type.toUpperCase()]);
    for (let i = 0; i < initialPieces[type] - blackPieces[type]; i++) capturedBlack.push(unicodePieces[type]);
  });
  const diff = whiteScore - blackScore;
  if (playerColor === 'w') {
    document.getElementById('botCaptured').innerHTML = capturedWhite.join(''); document.getElementById('playerCaptured').innerHTML = capturedBlack.join('');
    document.getElementById('botAdv').textContent = diff < 0 ? `+${Math.abs(diff)}` : ''; document.getElementById('playerAdv').textContent = diff > 0 ? `+${diff}` : '';
  } else {
    document.getElementById('botCaptured').innerHTML = capturedBlack.join(''); document.getElementById('playerCaptured').innerHTML = capturedWhite.join('');
    document.getElementById('botAdv').textContent = diff > 0 ? `+${diff}` : ''; document.getElementById('playerAdv').textContent = diff < 0 ? `+${Math.abs(diff)}` : '';
  }
  document.getElementById('topName').textContent = "Бот";
  document.getElementById('bottomName').textContent = "Ты";
}

function highlightLegalMoves(game, source) {
  clearHighlights();
  if (!game || !source) return;
  game.moves({ square: source, verbose: true }).forEach(move => {
    const el = document.querySelector(`.square-${move.to}`);
    if (el) el.classList.add(move.flags.includes('c') || move.flags.includes('e') ? 'capture-hint' : 'move-hint');
  });
}
function clearHighlights() { document.querySelectorAll('.move-hint, .capture-hint').forEach(el => el.classList.remove('move-hint', 'capture-hint')); }

function getSimulatedFen(baseFen, queue) {
  let sim = new Chess(baseFen);
  if (sim.turn() !== playerColor) { let p = sim.fen().split(' '); p[1] = playerColor; p[3] = '-'; sim.load(p.join(' ')); }
  for (let pm of queue) {
    try {
      sim.move({ from: pm.from, to: pm.to, promotion: 'q' });
      if (sim.turn() !== playerColor) { let p = sim.fen().split(' '); p[1] = playerColor; p[3] = '-'; sim.load(p.join(' ')); }
    } catch(e) { break; }
  }
  return sim.fen();
}

function drawPremoveHighlights() {
  document.querySelectorAll('.premove-from, .premove-to').forEach(el => el.classList.remove('premove-from', 'premove-to'));
  premoveQueue.forEach(pm => {
    const fromEl = document.querySelector(`.square-${pm.from}`), toEl = document.querySelector(`.square-${pm.to}`);
    if (fromEl) fromEl.classList.add('premove-from'); if (toEl) toEl.classList.add('premove-to');
  });
}

function updateBoardVisuals() {
  const simFen = (premoveQueue.length > 0 && !game.game_over()) ? getSimulatedFen(game.fen(), premoveQueue) : game.fen();
  board.position(simFen, false);
  setTimeout(drawPremoveHighlights, 10); 
}

function onDragStart(source, piece) {
  if (!gameActive || game.game_over()) return false;
  if ((playerColor === 'w' && piece.search(/^b/) !== -1) || (playerColor === 'b' && piece.search(/^w/) !== -1)) return false;
  clearUserDrawings('botBoard');
  if (game.turn() === playerColor && !isBotThinking) {
    if (game.moves({ square: source, verbose: true }).length === 0) return false;
    highlightLegalMoves(game, source);
  } else {
    const simFen = getSimulatedFen(game.fen(), premoveQueue);
    const simGame = new Chess(simFen);
    if (simGame.moves({ square: source, verbose: true }).length === 0) return false;
    highlightLegalMoves(simGame, source);
  }
  return true;
}

function onDrop(source, target) {
  if (!gameActive || game.game_over()) return 'snapback';
  if (game.turn() !== playerColor || isBotThinking) {
    let simFen = getSimulatedFen(game.fen(), premoveQueue); let simGame = new Chess(simFen); let dummyMove = null;
    try { dummyMove = simGame.move({ from: source, to: target, promotion: 'q' }); } catch (e) {}
    if (dummyMove) { 
      premoveQueue.push({ from: source, to: target }); 
      updateStatus("Премув добавлен. Ожидание бота...", "thinking"); 
      updateBoardVisuals(); // <--- ВОТ ОНА, МАГИЯ
      return 'snapback'; 
    }
    else { playSound('error'); return 'snapback'; }
  }
  premoveQueue = []; 
  let move = null;
  try { move = game.move({ from: source, to: target, promotion: 'q' }); } catch (e) { playSound('error'); return 'snapback'; }
  if (!move) { playSound('error'); return 'snapback'; }
  playSound(move.flags.includes('c') || move.flags.includes('e') ? 'capture' : 'move');
  updateBoardVisuals(); updateMaterial();
  if (checkGameOver()) return;
  switchTurn(); makeBotMove();
}

function executePremoves() {
  if (premoveQueue.length === 0 || game.game_over() || !gameActive || game.turn() !== playerColor) return;
  while (premoveQueue.length > 0 && game.turn() === playerColor) {
    let pm = premoveQueue[0]; let move = null;
    try { move = game.move({ from: pm.from, to: pm.to, promotion: 'q' }); } catch (e) {}
    if (move) {
      premoveQueue.shift(); playSound(move.flags.includes('c') || move.flags.includes('e') ? 'capture' : 'move');
      if (checkGameOver()) { updateBoardVisuals(); updateMaterial(); return; }
    } else { premoveQueue = []; break; }
  }
  updateBoardVisuals(); updateMaterial();
  if (game.turn() !== playerColor && !isBotThinking) { switchTurn(); makeBotMove(); }
}

async function makeBotMove() {
  if (game.game_over() || !gameActive || game.turn() === playerColor) return;
  isBotThinking = true; updateStatus("Бот думает...", "thinking");
  try {
    const res = await fetch('/api/bot_move', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ fen: game.fen(), level: parseInt(botLevelEl.value), mode: timeControlMode === 'unlimited' ? 'unlimited' : (timeControlMode === '1+0' ? 'bullet' : 'blitz') })
    });
    const data = await res.json();
    if (data.move) {
      try {
        const applied = game.move({ from: data.move.slice(0, 2), to: data.move.slice(2, 4), promotion: 'q' });
        if (applied) { playSound(applied.flags.includes('c') || applied.flags.includes('e') ? 'capture' : 'move'); updateBoardVisuals(); updateMaterial(); }
      } catch (e) {}
    }
  } catch (e) {
    const moves = game.moves(); if (moves.length > 0) { game.move(moves[0]); updateBoardVisuals(); updateMaterial(); }
  } finally {
    isBotThinking = false;
    if (!checkGameOver()) { updateStatus("Твой ход."); switchTurn(); executePremoves(); }
  }
}

function showGameOverModal(result, isWin) {
  const modal = document.getElementById('gameOverModal'); const title = document.getElementById('modalResult');
  if (result === 'checkmate') { title.textContent = isWin ? 'Мат! Ты победил!' : 'Мат! Бот победил'; title.className = isWin ? 'win' : 'loss'; }
  else if (result === 'timeout') { title.textContent = isWin ? 'Победа по времени!' : 'Ты проиграл по времени'; title.className = isWin ? 'win' : 'loss'; }
  else if (result === 'resign') { title.textContent = isWin ? 'Бот сдался! Ты победил!' : 'Ты сдался.'; title.className = isWin ? 'win' : 'loss'; }
  else { title.textContent = 'Ничья'; title.className = 'draw'; }
  modal.classList.add('active');
}

function checkGameOver() {
  if (game.in_checkmate() || game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
    const isWin = game.in_checkmate() && game.turn() !== playerColor;
    updateStatus(game.in_checkmate() ? (isWin ? "Мат! Ты победил!" : "Мат! Победил бот.") : "Ничья!", "gameover");
    playSound('end'); premoveQueue = []; gameActive = false; stopClock(); updateBoardVisuals(); updateMaterial();
    setTimeout(() => showGameOverModal(game.in_checkmate() ? 'checkmate' : 'draw', isWin), 300);
    return true;
  }
  if (game.in_check()) updateStatus(game.turn() === playerColor ? "Тебе шах!" : "Боту шах!");
  return false;
}

function startNewGame() {
  game = new Chess(); isBotThinking = false; premoveQueue = []; clearUserDrawings('botBoard');
  const sideChoice = sideSelectEl.value;
  playerColor = sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice;
  board.orientation(playerColor === 'w' ? 'white' : 'black');
  
  timeControlMode = timeControlEl.value;
  if (timeControlMode !== 'unlimited') {
    const parts = timeControlMode.split('+'); baseTime = parseInt(parts[0]) * 60; increment = parseInt(parts[1]);
    whiteTime = baseTime; blackTime = baseTime;
  } else { whiteTime = Infinity; blackTime = Infinity; }

  gameActive = true; updateBoardVisuals(); updateMaterial(); updateClocksUI();
  document.getElementById('evalBarWhite').style.height = '50%';
  document.getElementById('gameOverModal').classList.remove('active');
  if (playerColor === 'w') { updateStatus("Твой ход. Выбери фигуру."); startClock(); }
  else { updateStatus("Бот начинает первым...", "thinking"); startClock(); makeBotMove(); }
}

document.getElementById('newGameBtn').onclick = startNewGame;
document.getElementById('modalRematchBtn').onclick = startNewGame;
document.getElementById('modalCloseBtn').onclick = () => document.getElementById('gameOverModal').classList.remove('active');
document.getElementById('resignBtn').onclick = () => { if (!gameActive) return; gameActive = false; stopClock(); showGameOverModal('resign', false); };
document.getElementById('drawBtn').onclick = () => { if (!gameActive) return; gameActive = false; stopClock(); showGameOverModal('draw', false); };
document.getElementById('downloadPgnBtn').onclick = () => { downloadPGN(game.pgn(), `chess_game_${new Date().toISOString().slice(0,10)}.pgn`); };

board = Chessboard('botBoard', { draggable: true, position: 'start', moveSpeed: 0, onDragStart, onDrop, pieceTheme: '/img/pieces/{piece}.png', onSnapEnd: () => { clearHighlights(); updateBoardVisuals(); } });
initRightClickDrawing('botBoard');
window.addEventListener('resize', () => board.resize());
updateClocksUI();