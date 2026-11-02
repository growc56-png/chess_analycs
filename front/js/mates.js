
const MATES = [
  { id: "kq", name: "Король и ферзь", fen: "8/8/8/4k3/8/8/6K1/7Q w - - 0 1", desc: "Мат ферзём и королём за 30 секунд." },
  { id: "kr", name: "Король и ладья", fen: "8/8/8/4k3/8/8/6K1/7R w - - 0 1", desc: "Мат ладьёй и королём («лесенкой»)." },
  { id: "kbb", name: "Король и два слона", fen: "8/8/8/4k3/8/3B4/6K1/2B5 w - - 0 1", desc: "Мат двумя слонами." },
  { id: "kbn", name: "Король, конь и слон", fen: "8/8/8/4k3/8/3N4/6K1/2B5 w - - 0 1", desc: "Сложный мат: конь и слон." }
];

let TIME_LIMIT = 30.0;
const BOT_LEVEL = 6;

let board = null;
let game = new Chess();
let virtualGame = new Chess();

let currentMate = null;
let gameActive = false;

let premoveQueue = [];
let botRequestActive = false;
let positionVersion = 0;

let timerId = null;
let timerActive = false;
let timeLeft = TIME_LIMIT;
let lastTickAt = 0;

let mateRecords = {};

function loadRecords() {
  fetch('/api/mates/records')
    .then(res => res.json())
    .then(data => {
      mateRecords = data.records || {};
      renderMates();
    })
    .catch(() => renderMates());
}

function renderMates() {
  const list = document.getElementById('mateList');

  list.innerHTML = MATES.map(m => {
    const record = mateRecords[m.id]
      ? `<span class="record-time">${mateRecords[m.id].toFixed(1)}s</span>`
      : '';

    return `<div class="list-item" data-id="${m.id}">
      <span>${m.name}</span>${record}
    </div>`;
  }).join('');

  list.querySelectorAll('.list-item').forEach(el => {
    el.onclick = () => {
      const mate = MATES.find(m => m.id === el.dataset.id);
      if (mate) selectMate(mate);
    };
  });

  if (MATES.length && !currentMate) {
    selectMate(MATES[0]);
  }
}

// Создаёт виртуальную позицию, в которой снова ход белых.
// Это позволяет планировать несколько белых ходов подряд,
// не меняя настоящую партию.
function forceWhiteTurn(chessGame) {
  const fields = chessGame.fen().split(' ');

  if (fields[1] === 'b') {
    fields[1] = 'w';

    // Чёрный ход пропускается в виртуальной позиции.
    fields[3] = '-';
  }

  return new Chess(fields.join(' '));
}

// Перестраивает виртуальную доску:
// настоящая позиция + все запланированные белые ходы.
function rebuildVirtualBoard() {
  virtualGame = new Chess(game.fen());

  if (virtualGame.turn() === 'b') {
    virtualGame = forceWhiteTurn(virtualGame);
  }

  const validQueue = [];

  for (let i = 0; i < premoveQueue.length; i++) {
    if (virtualGame.turn() === 'b') {
      virtualGame = forceWhiteTurn(virtualGame);
    }

    const planned = premoveQueue[i];

    let move = null;

    try {
      move = virtualGame.move({
        from: planned.from,
        to: planned.to,
        promotion: planned.promotion || 'q'
      });
    } catch (error) {
      move = null;
    }

    if (!move) {
      // Если ход больше невозможен, удаляем его
      // и все последующие запланированные ходы.
      break;
    }

    validQueue.push(planned);

    virtualGame = forceWhiteTurn(virtualGame);
  }

  premoveQueue = validQueue;
}

// Обновляет красные квадраты на доске.
function updatePremoveHighlights() {
  document.querySelectorAll('.premove-from, .premove-to').forEach(el => {
    el.classList.remove('premove-from', 'premove-to');
  });

  premoveQueue.forEach(move => {
    const fromSquare = document.querySelector(
      `.square-${move.from}`
    );

    const toSquare = document.querySelector(
      `.square-${move.to}`
    );

    if (fromSquare) {
      fromSquare.classList.add('premove-from');
    }

    if (toSquare) {
      toSquare.classList.add('premove-to');
    }
  });
}

// Показывает виртуальную позицию, а не только настоящую.
function renderBoard() {
  if (!board) return;

  rebuildVirtualBoard();

  board.position(virtualGame.fen(), false);

  updatePremoveHighlights();
}

function selectMate(mate) {
  currentMate = mate;
  game = new Chess(mate.fen);
  virtualGame = new Chess(mate.fen);

  premoveQueue = [];
  botRequestActive = false;
  positionVersion++;

  document.querySelectorAll('#mateList .list-item').forEach(el => {
    el.classList.remove('active');
  });

  const activeItem = document.querySelector(
    `#mateList .list-item[data-id="${mate.id}"]`
  );

  if (activeItem) activeItem.classList.add('active');

  if (!board) {
    board = Chessboard('mateBoard', {
      position: mate.fen,
      draggable: true,
      pieceTheme: '/img/pieces/{piece}.png',

      // Анимации отключены.
      appearSpeed: 0,
      moveSpeed: 0,
      snapbackSpeed: 0,
      snapSpeed: 0,

      onDragStart: onMateDragStart,
      onDrop: handleDrop,

      onSnapEnd: () => {
        renderBoard();
        clearHighlights();
      }
    });

    initRightClickDrawing('mateBoard');
  } else {
    renderBoard();
  }

  if (window.initBoardClickToMove) {
    window.initBoardClickToMove(
      'mateBoard',
      () => (
        game.turn() === 'b' || botRequestActive || premoveQueue.length > 0
      ) ? virtualGame : game,
      handleDrop,
      { canSelect: piece => Boolean(gameActive && piece && piece.color === 'w') }
    );
  }

  stopTimer();

  timeLeft = TIME_LIMIT;
  gameActive = false;

  updateTimerDisplay();

  document.getElementById('mateDesc').textContent = mate.desc;
  document.getElementById('mainBtn').textContent = '▶ Старт';
  document.getElementById('mainBtn').classList.add('primary');
  document.getElementById('timeInput').disabled = false;

  setFeedback('Нажми «Старт», чтобы начать', 'info');

  document.getElementById('mateModal').classList.remove('active');
}

function highlightLegalMoves(chessGame, source) {
  clearHighlights();

  chessGame.moves({
    square: source,
    verbose: true
  }).forEach(move => {
    const square = document.querySelector(`.square-${move.to}`);

    if (square) {
      square.classList.add(
        move.flags.includes('c') || move.flags.includes('e')
          ? 'capture-hint'
          : 'move-hint'
      );
    }
  });
}

function clearHighlights() {
  document.querySelectorAll('.move-hint, .capture-hint').forEach(el => {
    el.classList.remove('move-hint', 'capture-hint');
  });
}

function onMateDragStart(source, piece) {
  if (!gameActive) {
    return false;
  }

  if (!piece || !piece.startsWith('w')) {
    return false;
  }

  // Если бот думает или уже есть запланированные ходы,
  // используем виртуальную позицию.
  const planningMode =
    game.turn() === 'b' ||
    botRequestActive ||
    premoveQueue.length > 0;

  const activeGame = planningMode ? virtualGame : game;

  if (activeGame.moves({ square: source }).length === 0) {
    return false;
  }

  highlightLegalMoves(activeGame, source);

  return true;
}

function handleDrop(source, target) {
  clearHighlights();

  if (!gameActive || source === target) {
    return 'snapback';
  }

  const planningMode =
    game.turn() === 'b' ||
    botRequestActive ||
    premoveQueue.length > 0;

  // ПРЕМУВ: работаем с виртуальной доской.
  if (planningMode) {
    if (virtualGame.turn() === 'b') {
      virtualGame = forceWhiteTurn(virtualGame);
    }

    let plannedMove = null;

    try {
      plannedMove = virtualGame.move({
        from: source,
        to: target,
        promotion: 'q'
      });
    } catch (error) {
      plannedMove = null;
    }

    if (!plannedMove) {
      return 'snapback';
    }

    premoveQueue.push({
      from: source,
      to: target,
      promotion: 'q'
    });

    // После каждого премува обновляем виртуальную позицию.
    // Фигура остаётся на новой клетке, можно планировать дальше.
    renderBoard();

    return;
  }

  // ОБЫЧНЫЙ ХОД БЕЛЫХ.
  let move = null;

  try {
    move = game.move({
      from: source,
      to: target,
      promotion: 'q'
    });
  } catch (error) {
    move = null;
  }

  if (!move) {
    playSound('error');
    return 'snapback';
  }

  renderBoard();

  playSound(
    move.flags.includes('c') || move.flags.includes('e')
      ? 'capture'
      : 'move'
  );

  if (checkMateOrDraw()) {
    return;
  }

  pauseTimer();

  setTimeout(() => {
    makeBlackMove();
  }, 100);
}

async function makeBlackMove() {
  if (
    !gameActive ||
    game.game_over() ||
    game.turn() !== 'b' ||
    botRequestActive
  ) {
    return;
  }

  botRequestActive = true;

  const requestVersion = positionVersion;
  const requestFen = game.fen();

  try {
    const res = await fetch('/api/bot_move', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fen: requestFen,
        level: BOT_LEVEL
      })
    });

    const data = await res.json();

    if (requestVersion !== positionVersion || !gameActive) {
      return;
    }

    if (data.move) {
      const applied = game.move({
        from: data.move.slice(0, 2),
        to: data.move.slice(2, 4),
        promotion: 'q'
      });

      if (applied) {
        playSound(
          applied.flags.includes('c') || applied.flags.includes('e')
            ? 'capture'
            : 'move'
        );
      }
    }
  } catch (error) {
    if (requestVersion === positionVersion && gameActive) {
      const moves = game.moves();

      if (moves.length > 0) {
        game.move(moves[0]);
      }
    }
  } finally {
    if (requestVersion !== positionVersion) {
      return;
    }

    botRequestActive = false;

    if (!gameActive) return;

    renderBoard();

    if (checkMateOrDraw()) {
      return;
    }

    resumeTimer();

    // После ответа бота выполняем следующий запланированный ход.
    executePremove();
  }
}

function executePremove() {
  if (
    premoveQueue.length === 0 ||
    !gameActive ||
    game.game_over() ||
    game.turn() !== 'w'
  ) {
    renderBoard();
    return;
  }

  const plannedMove = premoveQueue.shift();

  let move = null;

  try {
    move = game.move({
      from: plannedMove.from,
      to: plannedMove.to,
      promotion: plannedMove.promotion || 'q'
    });
  } catch (error) {
    move = null;
  }

  if (!move) {
    // Ход стал невозможен после ответа бота.
    // Удаляем оставшиеся премувы без штрафа.
    premoveQueue = [];

    renderBoard();
    return;
  }

  // Успешный премув: снимаем 0,1 секунды.
  timeLeft = Math.max(0, timeLeft - 0.1);
  updateTimerDisplay();

  // Если время закончилось — завершаем игру.
  if (timeLeft <= 0) {
    resumeTimer();
    tickTimer();
    return;
  }

  renderBoard();

  playSound(
    move.flags.includes('c') || move.flags.includes('e')
      ? 'capture'
      : 'move'
  );

  if (checkMateOrDraw()) {
    return;
  }

  pauseTimer();

  setTimeout(() => {
    makeBlackMove();
  }, 100);
}

function checkMateOrDraw() {
  if (game.in_checkmate()) {
    stopTimer();
    gameActive = false;
    premoveQueue = [];

    playSound('end');

    const isWin = game.turn() === 'b';

    setFeedback(
      isWin
        ? `✅ Мат! Осталось ${timeLeft.toFixed(1)} с.`
        : '❌ Тебя заматовали.',
      isWin ? 'ok' : 'err'
    );

    document.getElementById('mainBtn').textContent = '↺ Заново';
    document.getElementById('timeInput').disabled = false;

    renderBoard();

    if (isWin) {
      fetch('/api/mates/records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mate_id: currentMate.id,
          time: TIME_LIMIT - timeLeft
        })
      })
        .then(() => fetch('/api/mates/records'))
        .then(res => res.json())
        .then(data => {
          mateRecords = data.records || {};
          renderMates();
        });
    }

    setTimeout(() => {
      document.getElementById('modalMateResult').textContent =
        isWin ? 'Мат! Ты победил!' : 'Мат! Ты проиграл';

      document.getElementById('modalMateResult').className =
        isWin ? 'win' : 'loss';

      document.getElementById('mateModal').classList.add('active');
    }, 300);

    return true;
  }

  if (
    game.in_draw() ||
    game.in_stalemate() ||
    game.in_threefold_repetition() ||
    game.insufficient_material()
  ) {
    stopTimer();
    gameActive = false;
    premoveQueue = [];

    playSound('end');

    setFeedback('❌ Ничья (пат). Попробуй ещё раз.', 'err');

    document.getElementById('mainBtn').textContent = '↺ Заново';
    document.getElementById('timeInput').disabled = false;

    renderBoard();

    setTimeout(() => {
      document.getElementById('modalMateResult').textContent = 'Ничья';
      document.getElementById('modalMateResult').className = '';
      document.getElementById('mateModal').classList.add('active');
    }, 300);

    return true;
  }

  return false;
}

function startTimer() {
  stopTimer();

  timerActive = true;
  lastTickAt = performance.now();

  updateTimerDisplay();

  timerId = setInterval(tickTimer, 10);
}

function tickTimer() {
  if (!timerActive) return;

  const now = performance.now();

  timeLeft = Math.max(
    0,
    timeLeft - (now - lastTickAt) / 1000
  );

  lastTickAt = now;

  updateTimerDisplay();

  if (timeLeft <= 0) {
    stopTimer();

    gameActive = false;
    premoveQueue = [];

    playSound('end');

    setFeedback('⏰ Время вышло! Ты проиграл.', 'err');

    document.getElementById('mainBtn').textContent = '↺ Заново';
    document.getElementById('timeInput').disabled = false;

    renderBoard();

    setTimeout(() => {
      document.getElementById('modalMateResult').textContent =
        'Время вышло!';

      document.getElementById('modalMateResult').className = 'loss';
      document.getElementById('mateModal').classList.add('active');
    }, 300);
  }
}

function pauseTimer() {
  timerActive = false;
}

function resumeTimer() {
  if (gameActive && timeLeft > 0) {
    timerActive = true;
    lastTickAt = performance.now();
  }
}

function stopTimer() {
  timerActive = false;

  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');

  el.textContent = Math.max(0, timeLeft).toFixed(1);
  el.classList.toggle('low', timeLeft <= 5 && gameActive);
}
function setFeedback(text, cls) {
  const fb = document.getElementById('mateFeedback');

  fb.textContent = text;
  fb.className = 'feedback ' + (cls || '');
}

function startGame() {
  if (!currentMate) return;

  TIME_LIMIT =
    parseFloat(document.getElementById('timeInput').value) || 30.0;

  timeLeft = TIME_LIMIT;

  game = new Chess(currentMate.fen);
  virtualGame = new Chess(currentMate.fen);

  premoveQueue = [];
  botRequestActive = false;
  positionVersion++;

  renderBoard();

  gameActive = true;

  startTimer();

  setFeedback(
    `Мат за ${TIME_LIMIT} секунд! Твой ход.`,
    'info'
  );

  document.getElementById('mainBtn').textContent = '↺ Заново';
  document.getElementById('mainBtn').classList.remove('primary');
  document.getElementById('timeInput').disabled = true;
  document.getElementById('mateModal').classList.remove('active');
}

document.getElementById('mainBtn').onclick = () => {
  if (gameActive) {
    selectMate(currentMate);
  } else {
    startGame();
  }
};

document.getElementById('hintBtn').onclick = () => {
  if (currentMate && gameActive) {
    const activeGame =
      game.turn() === 'b' || premoveQueue.length > 0
        ? virtualGame
        : game;

    playSound('move');
    clearHighlights();

    activeGame.moves({ verbose: true }).forEach(move => {
      const square = document.querySelector(`.square-${move.to}`);

      if (square) {
        square.classList.add(
          move.flags.includes('c') || move.flags.includes('e')
            ? 'capture-hint'
            : 'move-hint'
        );
      }
    });
  }
};

document.getElementById('modalMateRetryBtn').onclick = () => {
  document.getElementById('mateModal').classList.remove('active');
  startGame();
};

document.getElementById('modalMateCloseBtn').onclick = () => {
  document.getElementById('mateModal').classList.remove('active');
};

window.addEventListener('resize', () => {
  if (board) board.resize();
});

loadRecords();
