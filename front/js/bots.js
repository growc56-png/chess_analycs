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
let currentGameSaveState = 'idle';
let savedGamesOffset = 0;
const SAVED_GAMES_PAGE_SIZE = 10;

const statusEl = document.getElementById('gameStatus');
const botLevelEl = document.getElementById('botLevel');
const sideSelectEl = document.getElementById('sideSelect');
const timeControlEl = document.getElementById('timeControl');
const playerClockEl = document.getElementById('playerClock');
const botClockEl = document.getElementById('botClock');

// Все доски сайта используют один общий модуль стрелок и маркеров.
function initRightClickDrawing(boardId) {
  return window.ChessBoardDrawing ? window.ChessBoardDrawing.init(boardId) : false;
}
function clearBoardArrows(boardId) {
  if (window.ChessBoardDrawing) window.ChessBoardDrawing.clear(boardId);
}

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

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMoveHistory() {
  const historyEl = document.getElementById('moveHistory');
  if (!historyEl || !game) return;

  const moves = game.history({ verbose: true });
  const countEl = document.getElementById('movesCount');
  if (countEl) {
    const fullMoves = Math.ceil(moves.length / 2);
    countEl.textContent = fullMoves + (fullMoves === 1 ? ' ход' : (fullMoves >= 2 && fullMoves <= 4 ? ' хода' : ' ходов'));
  }

  if (!moves.length) {
    historyEl.innerHTML = '<div class="empty-state">Ходы появятся здесь после начала партии.</div>';
    return;
  }

  const rows = [];
  for (let index = 0; index < moves.length; index += 2) {
    const moveNumber = Math.floor(index / 2) + 1;
    const whiteMove = moves[index] ? escapeHtml(moves[index].san) : '…';
    const blackMove = moves[index + 1] ? escapeHtml(moves[index + 1].san) : '';
    const whiteCurrent = index === moves.length - 1 ? ' current' : '';
    const blackCurrent = index + 1 === moves.length - 1 ? ' current' : '';
    rows.push(
      '<div class="move-history-row">' +
        '<span class="move-history-number">' + moveNumber + '.</span>' +
        '<span class="move-history-san' + whiteCurrent + '">' + whiteMove + '</span>' +
        '<span class="move-history-san' + blackCurrent + '">' + blackMove + '</span>' +
      '</div>'
    );
  }
  historyEl.innerHTML = rows.join('');
  historyEl.scrollTop = historyEl.scrollHeight;
}

function updateTurnIndicator() {
  const indicator = document.getElementById('turnIndicator');
  if (!indicator) return;
  if (!gameActive) {
    indicator.textContent = '● Партия завершена';
  } else if (isBotThinking) {
    indicator.textContent = '● Ход бота';
  } else if (premoveQueue.length) {
    indicator.textContent = '● Premove ожидает';
  } else {
    indicator.textContent = game.turn() === playerColor ? '● Твой ход' : '● Ход бота';
  }
}

function getPgnResult(result) {
  if (result === 'win') return '1-0';
  if (result === 'loss') return '0-1';
  return '1/2-1/2';
}

function buildSavedGamePgn(result) {
  const date = new Date();
  const pgnDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('.');
  const token = getPgnResult(result);
  const botLevel = parseInt(botLevelEl.value, 10) || 1;
  const whiteName = playerColor === 'w' ? 'Player' : 'Stockfish level ' + botLevel;
  const blackName = playerColor === 'b' ? 'Player' : 'Stockfish level ' + botLevel;
  const pgnTimeControl = timeControlMode === 'unlimited' ? '-' : String(baseTime) + '+' + String(increment);
  const moveText = game.pgn().replace(/\s*\*$/, '').trim();
  const headers = [
    '[Event "Chess Trainer - Bot Game"]',
    '[Site "Chess Trainer"]',
    '[Date "' + pgnDate + '"]',
    '[White "' + whiteName + '"]',
    '[Black "' + blackName + '"]',
    '[Result "' + token + '"]',
    '[TimeControl "' + pgnTimeControl + '"]'
  ];
  return headers.join('\n') + '\n\n' + (moveText ? moveText + ' ' : '') + token + '\n';
}

function setGameSaveNotice(message, state) {
  const notice = document.getElementById('gameSaveNotice');
  if (!notice) return;
  notice.className = 'game-save-notice' + (state ? ' ' + state : '');
  notice.textContent = message;
}

async function saveCurrentGame(result, termination) {
  if (currentGameSaveState === 'saved' || currentGameSaveState === 'saving') return;
  if (!game || game.history().length === 0) {
    setGameSaveNotice('Партия без ходов не добавлена в историю.', 'muted');
    return;
  }

  currentGameSaveState = 'saving';
  setGameSaveNotice('Сохраняю партию в историю…', 'saving');
  const body = {
    pgn: buildSavedGamePgn(result),
    player_color: playerColor,
    bot_level: parseInt(botLevelEl.value, 10) || 1,
    time_control: timeControlMode,
    result: result,
    termination: termination || 'unknown',
    moves_count: game.history().length,
    final_fen: game.fen()
  };

  try {
    const response = await fetch('/api/bot-games/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || 'Сервер не сохранил партию (' + response.status + ').');
    }
    currentGameSaveState = 'saved';
    setGameSaveNotice('Партия сохранена в истории.', 'success');
    await loadSavedGames(0);
  } catch (error) {
    currentGameSaveState = 'failed';
    const notice = document.getElementById('gameSaveNotice');
    if (notice) {
      notice.className = 'game-save-notice error';
      notice.innerHTML = '<span>' + escapeHtml(error.message) + '</span> <button type="button" id="retryGameSaveBtn">Повторить</button>';
      document.getElementById('retryGameSaveBtn')?.addEventListener('click', () => {
        currentGameSaveState = 'idle';
        saveCurrentGame(result, termination);
      });
    }
  }
}

function resultLabel(result) {
  if (result === 'win') return 'Победа';
  if (result === 'loss') return 'Поражение';
  return 'Ничья';
}

async function loadSavedGames(offset) {
  const list = document.getElementById('savedGamesList');
  if (!list) return;
  const nextOffset = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;
  list.innerHTML = '<div class="empty-state">Загружаю историю партий…</div>';

  try {
    const response = await fetch('/api/bot-games/?limit=' + SAVED_GAMES_PAGE_SIZE + '&offset=' + nextOffset, {
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || 'Не удалось загрузить историю (' + response.status + ').');
    }

    savedGamesOffset = nextOffset;
    const games = Array.isArray(data.games) ? data.games : [];
    const stats = data.stats || {};
    const setStat = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(Number(value || 0));
    };
    setStat('gamesTotal', data.total || 0);
    setStat('gamesWins', stats.wins || 0);
    setStat('gamesDraws', stats.draws || 0);
    setStat('gamesLosses', stats.losses || 0);

    const pageLabel = document.getElementById('gamesPageLabel');
    const page = Math.floor(savedGamesOffset / SAVED_GAMES_PAGE_SIZE) + 1;
    const pages = Math.max(1, Math.ceil(Number(data.total || 0) / SAVED_GAMES_PAGE_SIZE));
    if (pageLabel) pageLabel.textContent = 'Страница ' + page + ' из ' + pages;
    const prev = document.getElementById('gamesPrevBtn');
    const next = document.getElementById('gamesNextBtn');
    if (prev) prev.disabled = savedGamesOffset <= 0;
    if (next) next.disabled = savedGamesOffset + SAVED_GAMES_PAGE_SIZE >= Number(data.total || 0);

    if (!games.length) {
      list.innerHTML = '<div class="empty-state">Здесь пока нет сохранённых партий. Заверши игру с ботом — она появится здесь автоматически.</div>';
      return;
    }

    list.innerHTML = games.map(item => {
      const color = item.player_color === 'w' ? 'Белыми' : 'Чёрными';
      const control = item.time_control === 'unlimited' ? 'Без времени' : escapeHtml(item.time_control);
      const dateText = item.created_at ? new Date(item.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : 'Дата неизвестна';
      const count = Math.ceil(Number(item.moves_count || 0) / 2);
      return '<article class="saved-game-item">' +
        '<div class="saved-game-heading">' +
          '<strong class="saved-game-result ' + escapeHtml(item.result) + '">' + resultLabel(item.result) + '</strong>' +
          '<span>' + escapeHtml(dateText) + '</span>' +
        '</div>' +
        '<div class="saved-game-meta">Бот · уровень ' + escapeHtml(item.bot_level) + ' · ' + color + ' · ' + control + ' · ' + count + ' ходов</div>' +
        '<button type="button" class="saved-game-open" data-game-id="' + escapeHtml(item.id) + '">Открыть партию</button>' +
      '</article>';
    }).join('');
  } catch (error) {
    list.innerHTML = '<div class="empty-state error-text">' + escapeHtml(error.message) + '</div>';
  }
}

async function openSavedGame(gameId) {
  const details = document.getElementById('savedGameDetails');
  if (!details) return;
  details.classList.remove('hidden');
  details.innerHTML = '<div class="empty-state">Загружаю партию…</div>';
  try {
    const response = await fetch('/api/bot-games/' + encodeURIComponent(gameId), { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.game) throw new Error(data.detail || 'Не удалось открыть партию.');
    const saved = data.game;
    details.dataset.pgn = saved.pgn || '';
    details.dataset.filename = 'bot-game-' + saved.id + '.pgn';
    details.innerHTML =
      '<div class="saved-game-details-heading"><strong>' + resultLabel(saved.result) + ' · бот, уровень ' + escapeHtml(saved.bot_level) + '</strong>' +
      '<button type="button" data-action="close-details" aria-label="Закрыть">×</button></div>' +
      '<div class="saved-game-meta">' + escapeHtml(saved.created_at ? new Date(saved.created_at).toLocaleString('ru-RU') : '') + ' · ' + escapeHtml(saved.moves_count) + ' полуходов</div>' +
      '<pre class="saved-game-pgn">' + escapeHtml(saved.pgn || 'PGN отсутствует') + '</pre>' +
      '<button type="button" class="saved-game-download" data-action="download-pgn">Скачать PGN</button>';
  } catch (error) {
    details.innerHTML = '<div class="empty-state error-text">' + escapeHtml(error.message) + '</div>';
  }
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
  playSound('end');
  saveCurrentGame(isPlayerTimeout ? 'loss' : 'win', 'timeout');
  updateTurnIndicator();
  showGameOverModal('timeout', !isPlayerTimeout);
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
  renderMoveHistory();
  updateTurnIndicator();
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
  const description = document.getElementById('resultDescription');
  if (description) description.textContent = 'Сыграно полных ходов: ' + Math.ceil(game.history().length / 2) + '. Партия добавляется в историю.';
  modal.classList.add('active');
}

function checkGameOver() {
  if (game.in_checkmate() || game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
    const isMate = game.in_checkmate();
    const isWin = isMate && game.turn() !== playerColor;
    let termination = 'draw';
    if (isMate) termination = 'checkmate';
    else if (game.in_stalemate()) termination = 'stalemate';
    else if (game.in_threefold_repetition()) termination = 'threefold_repetition';
    else if (game.insufficient_material && game.insufficient_material()) termination = 'insufficient_material';

    updateStatus(isMate ? (isWin ? "Мат! Ты победил!" : "Мат! Победил бот.") : "Ничья!", "gameover");
    playSound('end');
    premoveQueue = [];
    gameActive = false;
    stopClock();
    saveCurrentGame(isMate ? (isWin ? 'win' : 'loss') : 'draw', termination);
    updateBoardVisuals();
    updateMaterial();
    setTimeout(() => showGameOverModal(isMate ? 'checkmate' : 'draw', isWin), 300);
    return true;
  }
  if (game.in_check()) updateStatus(game.turn() === playerColor ? "Тебе шах!" : "Боту шах!");
  return false;
}

function startNewGame() {
  stopClock();
  game = new Chess(); isBotThinking = false; premoveQueue = []; selectedSquare = null;
  currentGameSaveState = 'idle';
  setGameSaveNotice('', '');
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
  const botDescription = document.getElementById('botDescription');
  if (botDescription) botDescription.textContent = 'Уровень ' + (parseInt(botLevelEl.value, 10) || 1);
  const evalBar = document.getElementById('evalBarWhite');
  if (evalBar) evalBar.style.height = '50%';
  document.getElementById('gameOverModal').classList.remove('active');
  if (playerColor === 'w') { updateStatus("Твой ход. Выбери фигуру."); startClock(); }
  else { updateStatus("Бот начинает первым...", "thinking"); startClock(); makeBotMove(); }
}

['newGameBtn', 'settingsNewGameBtn', 'restartGameBtn', 'modalRematchBtn'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', event => {
    event.preventDefault();
    startNewGame();
  });
});
document.getElementById('modalCloseBtn').onclick = () => document.getElementById('gameOverModal').classList.remove('active');
document.getElementById('resignBtn').onclick = () => {
  if (!gameActive) return;
  gameActive = false; stopClock(); premoveQueue = [];
  saveCurrentGame('loss', 'resign');
  updateBoardVisuals();
  showGameOverModal('resign', false);
};
document.getElementById('drawBtn').onclick = () => {
  if (!gameActive) return;
  gameActive = false; stopClock(); premoveQueue = [];
  saveCurrentGame('draw', 'draw_agreement');
  updateBoardVisuals();
  showGameOverModal('draw', false);
};
document.getElementById('downloadPgnBtn').onclick = () => {
  const token = game.in_checkmate() ? (game.turn() === playerColor ? '0-1' : '1-0') : '*';
  const pgn = game.pgn();
  downloadPGN(pgn, 'chess_game_' + new Date().toISOString().slice(0,10) + '.pgn');
};

document.getElementById('refreshGamesBtn')?.addEventListener('click', () => loadSavedGames(0));
document.getElementById('gamesPrevBtn')?.addEventListener('click', () => loadSavedGames(Math.max(0, savedGamesOffset - SAVED_GAMES_PAGE_SIZE)));
document.getElementById('gamesNextBtn')?.addEventListener('click', () => loadSavedGames(savedGamesOffset + SAVED_GAMES_PAGE_SIZE));
document.getElementById('savedGamesList')?.addEventListener('click', event => {
  const button = event.target.closest('[data-game-id]');
  if (button) openSavedGame(button.dataset.gameId);
});
document.getElementById('savedGameDetails')?.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const details = document.getElementById('savedGameDetails');
  if (action === 'close-details') {
    details.classList.add('hidden');
    details.innerHTML = '';
  } else if (action === 'download-pgn' && details.dataset.pgn) {
    downloadPGN(details.dataset.pgn, details.dataset.filename || 'bot-game.pgn');
  }
});

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
renderMoveHistory();
loadSavedGames(0);
