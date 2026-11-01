let board = null;
let game = new Chess();
let isBotThinking = false;
let premoveQueue = []; 
let playerColor = 'w';
let selectedSquare = null;
let ignoreBoardClickUntil = 0;

let timeControlMode = "unlimited";
let baseTime = 0, increment = 0, whiteTime = 0, blackTime = 0;
let clockInterval = null, turnStartTime = 0, gameActive = false;

const statusEl = document.getElementById('gameStatus');
const botLevelEl = document.getElementById('botLevel');
const sideSelectEl = document.getElementById('sideSelect');
const timeControlEl = document.getElementById('timeControl');
const playerClockEl = document.getElementById('playerClock');
const botClockEl = document.getElementById('botClock');

// Рисование стрелок ПКМ. Контекстное меню браузера блокируется на доске,
// а правый клик не передаётся обработчику перемещения фигур.
function initRightClickDrawing(boardId) {
  const boardEl = document.getElementById(boardId);
  if (!boardEl || boardEl.dataset.arrowsReady === '1') return;
  boardEl.dataset.arrowsReady = '1';

  // Доска перерисовывает собственное содержимое при каждом ходе,
  // поэтому SVG размещаем в стабильной внешней обёртке, а не внутри #botBoard.
  const stage = boardEl.closest('.board-stage') || boardEl.parentElement;
  if (!stage) return;
  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = `userDraw_${boardId}`;
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('preserveAspectRatio', 'none');
  Object.assign(svg.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    zIndex: '40', pointerEvents: 'none', overflow: 'visible'
  });
  stage.appendChild(svg);

  let drawing = false, start = null, preview = null;
  const point = event => {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (event.clientX - rect.left) / rect.width * 8;
    const y = (event.clientY - rect.top) / rect.height * 8;
    if (x < 0 || x > 8 || y < 0 || y > 8) return null;
    return { x: Math.min(7.95, Math.max(.05, x)), y: Math.min(7.95, Math.max(.05, y)) };
  };
  const key = (a, b) => `${Math.round(a.x * 2)}:${Math.round(a.y * 2)}>${Math.round(b.x * 2)}:${Math.round(b.y * 2)}`;
  const paint = (a, b, group) => {
    const color = '#f97316';
    if (Math.hypot(a.x - b.x, a.y - b.y) < .18) {
      // Chess.com-style mark: outlined circle with a centered dot.
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('cx', a.x); ring.setAttribute('cy', a.y);
      ring.setAttribute('r', '.34'); ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', color); ring.setAttribute('stroke-width', '.13');
      ring.setAttribute('opacity', '.9'); group.appendChild(ring);
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
      dot.setAttribute('r', '.075'); dot.setAttribute('fill', color);
      group.appendChild(dot);
      return;
    }
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x - .13 * Math.cos(angle));
    line.setAttribute('y2', b.y - .13 * Math.sin(angle));
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '.16');
    line.setAttribute('stroke-linecap', 'round'); line.setAttribute('opacity', '.85');
    group.appendChild(line);
    const size = .34, spread = .48;
    const head = document.createElementNS(ns, 'polygon');
    head.setAttribute('points', `${b.x},${b.y} ${b.x-size*Math.cos(angle-spread)},${b.y-size*Math.sin(angle-spread)} ${b.x-size*Math.cos(angle+spread)},${b.y-size*Math.sin(angle+spread)}`);
    head.setAttribute('fill', color); head.setAttribute('opacity', '.9');
    group.appendChild(head);
  };

  boardEl.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
  }, true);

  boardEl.addEventListener('mousedown', event => {
    if (event.button !== 2) return;
    const p = point(event);
    if (!p) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    start = p; drawing = true;
    preview = document.createElementNS(ns, 'g');
    preview.setAttribute('opacity', '.55');
    svg.appendChild(preview);
    paint(start, start, preview);
  }, true);

  document.addEventListener('mousemove', event => {
    if (!drawing) return;
    event.preventDefault();
    const end = point(event);
    if (!end || !preview) return;
    preview.innerHTML = '';
    paint(start, end, preview);
  }, true);

  document.addEventListener('mouseup', event => {
    if (!drawing || event.button !== 2) return;
    event.preventDefault(); event.stopPropagation();
    const finish = point(event) || start;
    if (preview) preview.remove();
    preview = null;
    const id = key(start, finish);
    const old = [...svg.querySelectorAll('g[data-arrow-key]')].find(g => g.dataset.arrowKey === id);
    if (old) old.remove();
    else {
      const group = document.createElementNS(ns, 'g');
      group.dataset.arrowKey = id;
      paint(start, finish, group);
      svg.appendChild(group);
    }
    drawing = false; start = null;
  }, true);

  // ЛКМ убирает пользовательские пометки; обработчик выбора/хода фигуры
  // продолжает работать в обычном порядке.
  boardEl.addEventListener('click', event => {
    if (event.button === 0) clearBoardArrows(boardId);
  }, true);

  window.addEventListener('blur', () => {
    drawing = false; start = null;
    if (preview) preview.remove();
    preview = null;
  });
}
function clearBoardArrows(boardId) { const svg=document.getElementById(`userDraw_${boardId}`); if(svg)svg.innerHTML=''; }
function installBotBoardStyles() {
  if(document.getElementById('bot-board-interaction-styles'))return;
  const style=document.createElement('style');style.id='bot-board-interaction-styles';
  style.textContent=`#botBoard .square-55d63.premove-from{box-shadow:inset 0 0 0 4px rgba(249,115,22,.88)!important}#botBoard .square-55d63.premove-to{box-shadow:inset 0 0 0 4px rgba(16,185,129,.92)!important}#botBoard .square-55d63.bot-selected-square{box-shadow:inset 0 0 0 4px rgba(250,204,21,.95)!important}`;
  document.head.appendChild(style);
}


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

function clearHighlights() {
  document.querySelectorAll('.move-hint,.capture-hint,.bot-selected-square').forEach(el=>el.classList.remove('move-hint','capture-hint','bot-selected-square'));
}
function highlightLegalMoves(position,source) {
  clearHighlights(); if(!position||!source)return;
  const src=document.querySelector(`#botBoard .square-${source}`);if(src)src.classList.add('bot-selected-square');
  position.moves({square:source,verbose:true}).forEach(move=>{
    const el=document.querySelector(`#botBoard .square-${move.to}`);
    if(el)el.classList.add(move.flags.includes('c')||move.flags.includes('e')?'capture-hint':'move-hint');
  });
}
function getPremoveGame() {
  const fields=game.fen().split(' ');fields[1]=playerColor;fields[3]='-';
  try{return new Chess(fields.join(' '));}catch(_){return new Chess(game.fen());}
}
function getSimulatedFen(baseFen,queue) {
  const fields=baseFen.split(' ');fields[1]=playerColor;fields[3]='-';
  const sim=new Chess(fields.join(' '));
  for(const pm of(queue||[])){const move=sim.move({from:pm.from,to:pm.to,promotion:pm.promotion||'q'});if(!move)break;}
  return sim.fen();
}
function drawPremoveHighlights() {
  document.querySelectorAll('.premove-from,.premove-to').forEach(el=>el.classList.remove('premove-from','premove-to'));
  if(!premoveQueue.length)return;
  const pm=premoveQueue[0],fromEl=document.querySelector(`#botBoard .square-${pm.from}`),toEl=document.querySelector(`#botBoard .square-${pm.to}`);
  if(fromEl)fromEl.classList.add('premove-from');if(toEl)toEl.classList.add('premove-to');
}
function updateBoardVisuals() {
  if(!board)return;
  board.position(game.fen(),false);
  clearHighlights();
  if(selectedSquare)highlightLegalMoves(game.turn()===playerColor?game:getPremoveGame(),selectedSquare);
  requestAnimationFrame(drawPremoveHighlights);
}
function validationPosition(){return game.turn()===playerColor&&!isBotThinking?game:getPremoveGame();}
function isPlayerPiece(square){const piece=game.get(square);return !!piece&&piece.color===playerColor;}
function playUserMoveOrQueue(source,target) {
  if(!gameActive||game.game_over())return 'snapback';
  const isPremove=game.turn()!==playerColor||isBotThinking;
  if(isPremove){
    const sim=getPremoveGame();let planned=null;
    try{planned=sim.move({from:source,to:target,promotion:'q'});}catch(_){}
    if(!planned){playSound('error');return 'snapback';}
    premoveQueue=[{from:source,to:target,promotion:'q'}];selectedSquare=null;clearHighlights();updateBoardVisuals();
    updateStatus(`Премув ${source} → ${target} поставлен. Выполнится после хода бота, если останется легальным.`,'thinking');
    return 'snapback';
  }
  let move=null;try{move=game.move({from:source,to:target,promotion:'q'});}catch(_){}
  if(!move){playSound('error');return 'snapback';}
  premoveQueue=[];selectedSquare=null;clearHighlights();
  playSound(move.flags.includes('c')||move.flags.includes('e')?'capture':'move');
  updateBoardVisuals();updateMaterial();if(checkGameOver())return undefined;
  switchTurn();makeBotMove();return undefined;
}
function onDragStart(source,piece) {
  if(!gameActive||game.game_over())return false;
  if((piece[0]||'').toLowerCase()!==playerColor)return false;
  const position=validationPosition();if(!position.moves({square:source,verbose:true}).length)return false;
  selectedSquare=source;highlightLegalMoves(position,source);return true;
}
function onDrop(source,target){ignoreBoardClickUntil=Date.now()+350;return playUserMoveOrQueue(source,target);}
function handleBoardClick(event) {
  if(Date.now()<ignoreBoardClickUntil||!gameActive||game.game_over())return;
  const cell=event.target.closest('#botBoard .square-55d63');if(!cell)return;
  const square=[...cell.classList].map(name=>name.match(/^square-([a-h][1-8])$/)?.[1]).find(Boolean);if(!square)return;
  if(selectedSquare){
    if(square===selectedSquare){selectedSquare=null;clearHighlights();drawPremoveHighlights();return;}
    if(isPlayerPiece(square)){
      const next=validationPosition();if(next.moves({square,verbose:true}).length){selectedSquare=square;highlightLegalMoves(next,square);return;}
    }
    const from=selectedSquare;selectedSquare=null;const result=playUserMoveOrQueue(from,square);if(result==='snapback')updateBoardVisuals();return;
  }
  if(!isPlayerPiece(square))return;
  const position=validationPosition();if(!position.moves({square,verbose:true}).length)return;
  selectedSquare=square;highlightLegalMoves(position,square);
}
function onSnapEnd(){ignoreBoardClickUntil=Date.now()+180;updateBoardVisuals();}
function executePremoves() {
  if(!premoveQueue.length||game.game_over()||!gameActive||game.turn()!==playerColor)return;
  const pm=premoveQueue.shift();let move=null;
  try{move=game.move({from:pm.from,to:pm.to,promotion:pm.promotion||'q'});}catch(_){}
  if(!move){premoveQueue=[];updateBoardVisuals();updateStatus('Премув отменён: ответ бота изменил позицию, ход больше не легален.','error');return;}
  playSound(move.flags.includes('c')||move.flags.includes('e')?'capture':'move');selectedSquare=null;
  updateBoardVisuals();updateMaterial();if(checkGameOver())return;
  switchTurn();updateStatus(`Премув выполнен: ${move.san}. Бот отвечает…`,'thinking');
  setTimeout(()=>makeBotMove(),140);
}

async function makeBotMove() {
  if(game.game_over()||!gameActive||game.turn()===playerColor||isBotThinking)return;
  isBotThinking=true;updateStatus(premoveQueue.length?'Бот думает. Премув ожидает ответа…':'Бот думает…','thinking');
  try{
    const res=await fetch('/api/bot_move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fen:game.fen(),level:parseInt(botLevelEl.value,10),mode:timeControlMode==='unlimited'?'unlimited':(timeControlMode==='1+0'?'bullet':'blitz')})});
    const data=await res.json();if(!res.ok)throw new Error(data.detail||'Ошибка движка');
    if(!data.move)throw new Error('Бот не вернул ход');
    const applied=game.move({from:data.move.slice(0,2),to:data.move.slice(2,4),promotion:data.move[4]||'q'});
    if(!applied)throw new Error('Бот вернул нелегальный ход');
    playSound(applied.flags.includes('c')||applied.flags.includes('e')?'capture':'move');updateBoardVisuals();updateMaterial();
  }catch(error){
    const moves=game.moves({verbose:true});
    if(moves.length){const first=moves[0];const applied=game.move({from:first.from,to:first.to,promotion:first.promotion||'q'});if(applied){playSound(applied.flags.includes('c')?'capture':'move');updateBoardVisuals();updateMaterial();}}
    else updateStatus(`Ошибка хода бота: ${error.message}`,'error');
  }finally{
    isBotThinking=false;
    if(gameActive&&!checkGameOver()){
      switchTurn();
      if(premoveQueue.length)executePremoves();
      else updateStatus('Твой ход. Можно выбрать фигуру или заранее поставить премув.');
    }
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
  stopClock();
  game = new Chess(); isBotThinking = false; premoveQueue = []; selectedSquare = null;
  clearBoardArrows('botBoard'); clearHighlights();
  if (board) board.position('start', false);
  const sideChoice = sideSelectEl.value;
  playerColor = sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice;
  board.orientation(playerColor === 'w' ? 'white' : 'black');
  const boardElement = document.getElementById('botBoard');
  if (boardElement) boardElement.dataset.orientation = playerColor === 'w' ? 'white' : 'black';
  
  timeControlMode = timeControlEl.value;
  if (timeControlMode !== 'unlimited') {
    const parts = timeControlMode.split('+'); baseTime = parseInt(parts[0]) * 60; increment = parseInt(parts[1]);
    whiteTime = baseTime; blackTime = baseTime;
  } else { whiteTime = Infinity; blackTime = Infinity; }

  gameActive = true; updateBoardVisuals(); updateMaterial(); updateClocksUI();
  const evalBar = document.getElementById('evalBarWhite');\n  if (evalBar) evalBar.style.height = '50%';
  document.getElementById('gameOverModal').classList.remove('active');
  if (playerColor === 'w') { updateStatus("Твой ход. Выбери фигуру."); startClock(); }
  else { updateStatus("Бот начинает первым...", "thinking"); startClock(); makeBotMove(); }
}

document.getElementById('newGameBtn')?.addEventListener('click', event => { event.preventDefault(); startNewGame(); });
document.getElementById('modalRematchBtn')?.addEventListener('click', event => { event.preventDefault(); startNewGame(); });
document.getElementById('modalCloseBtn').onclick = () => document.getElementById('gameOverModal').classList.remove('active');
document.getElementById('resignBtn').onclick = () => { if (!gameActive) return; gameActive = false; stopClock(); showGameOverModal('resign', false); };
document.getElementById('drawBtn').onclick = () => { if (!gameActive) return; gameActive = false; stopClock(); showGameOverModal('draw', false); };
document.getElementById('downloadPgnBtn').onclick = () => { downloadPGN(game.pgn(), `chess_game_${new Date().toISOString().slice(0,10)}.pgn`); };

board = Chessboard('botBoard', {
  draggable: true, position: 'start', moveSpeed: 0,
  onDragStart, onDrop, pieceTheme: '/img/pieces/{piece}.png', onSnapEnd
});
const botBoardElement = document.getElementById('botBoard');
if (botBoardElement) botBoardElement.addEventListener('click', handleBoardClick);
initRightClickDrawing('botBoard');
installBotBoardStyles();
window.addEventListener('resize', () => board && board.resize());
updateClocksUI();
