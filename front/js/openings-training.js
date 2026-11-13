/* Тренажёр дебютов: теория -> повторение линии -> партия против Stockfish. */
(() => {
  'use strict';

  const PIECE_THEME = '/img/pieces/{piece}.png';
  const state = {
    openings: [], opening: null, side: 'white', catalogSide: 'white', catalogFirstMove: 'e4', level: 'medium',
    game: null, board: null, mode: 'idle', moveIndex: 0,
    botThinking: false, runId: 0, loadToken: 0, lastError: '',
    premoveQueue: [], virtualGame: null, deviationTraining: false,
    detailCache: new Map(), openingBotVariants: [], openingBotFamily: '', openingBotSaved: false
  };

  const $ = (id) => document.getElementById(id);
  const byId = (id) => $(id);
  const userColor = () => state.side === 'white' ? 'w' : 'b';
  const colorName = (color) => color === 'w' ? 'белые' : 'чёрные';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);


  // Стрелки рисуются общим модулем, как и на остальных досках сайта.
  function installRightClickArrows(boardId) {
    if (window.initRightClickDrawing) return window.initRightClickDrawing(boardId);
    return false;
  }

  function startsWithCatalogMove(opening) {
    return Array.isArray(opening?.moves) && opening.moves[0] === state.catalogFirstMove;
  }

  function setCatalogFirstMove(move) {
    if (!['e4', 'd4'].includes(move)) return;
    state.catalogFirstMove = move;
    document.querySelectorAll('[data-opening-first-move]').forEach(button => {
      const active = button.dataset.openingFirstMove === move;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const next = state.openings.find(item => item.side === state.catalogSide && startsWithCatalogMove(item));
    if (next) {
      byId('openingTrainerSelect').value = String(next.id);
      selectOpening(next.id);
    } else {
      renderCatalogList();
    }
  }

  function validateLine(opening) {
    if (!window.Chess || !Array.isArray(opening.moves) || !opening.moves.length) return false;
    const probe = new Chess();
    for (const san of opening.moves) {
      try {
        if (!probe.move(san)) return false;
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  function lineMoveAt(index) {
    const probe = new Chess(state.game.fen());
    try {
      const move = probe.move(state.opening.moves[index]);
      if (!move) return null;
      return move;
    } catch (_) {
      return null;
    }
  }

  function toUci(move) {
    return move ? `${move.from}${move.to}${move.promotion || ''}` : '';
  }

  function setMessage(message, kind = 'info') {
    const el = byId('openingTrainerMessage');
    if (!el) return;
    el.className = `opening-trainer-message ${kind}`;
    el.textContent = message;
  }

  function renderOpeningOptions() {
    const select = byId('openingTrainerSelect');
    if (select) {
      const groups = new Map();
      state.openings.forEach(opening => {
        if (!groups.has(opening.family || 'Другие')) groups.set(opening.family || 'Другие', []);
        groups.get(opening.family || 'Другие').push(opening);
      });
      select.innerHTML = [...groups.entries()].map(([family, items]) =>
        `<optgroup label="${escapeHtml(family)}">${items.map(item =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
        ).join('')}</optgroup>`
      ).join('');
    }
    renderCatalogList();
  }

  function renderCatalogList() {
    const host = byId('openingCatalogList');
    if (!host) return;
    const filtered = state.openings.filter(item => item.side === state.catalogSide && startsWithCatalogMove(item));
    if (!filtered.length) {
      host.innerHTML = `<div class="opening-catalog-empty">Для хода 1.${state.catalogFirstMove} пока нет вариантов для этой стороны.</div>`;
      return;
    }
    const groups = new Map();
    filtered.forEach(item => {
      const family = item.family || 'Другие дебюты';
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(item);
    });
    host.innerHTML = [...groups.entries()].map(([family, items]) => `
      <section class="opening-catalog-group">
        <h3>${escapeHtml(family)}</h3>
        <div class="opening-catalog-items">
          ${items.map(item => `
            <button type="button" class="opening-catalog-item ${state.opening && String(state.opening.id) === String(item.id) ? 'active' : ''}"
              data-opening-id="${escapeHtml(item.id)}">
              <span>${escapeHtml(item.name || 'Основная линия')}</span>
              <small>${item.personal ? 'МОЙ ВАРИАНТ' : Number(item.move_count ?? item.moves?.length ?? 0) + ' полуходов'}</small>
            </button>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  function setCatalogSide(side) {
    if (!['white', 'black'].includes(side)) return;
    state.catalogSide = side;
    document.querySelectorAll('[data-opening-first-move]').forEach(button => {
      const active = button.dataset.openingFirstMove === state.catalogFirstMove;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-opening-category]').forEach(button => {
      const active = button.dataset.openingCategory === side;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const next = state.openings.find(item => item.side === side && startsWithCatalogMove(item));
    if (next) {
      byId('openingTrainerSelect').value = String(next.id);
      selectOpening(next.id);
    } else {
      renderCatalogList();
    }
  }

  function chooseCatalogOpening(id) {
    const opening = state.openings.find(item => String(item.id) === String(id));
    if (!opening) return;
    state.catalogSide = opening.side === 'black' ? 'black' : 'white';
    if (Array.isArray(opening.moves) && ['e4', 'd4'].includes(opening.moves[0])) state.catalogFirstMove = opening.moves[0];
    document.querySelectorAll('[data-opening-category]').forEach(button => {
      const active = button.dataset.openingCategory === state.catalogSide;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    byId('openingTrainerSelect').value = String(opening.id);
    selectOpening(opening.id);
  }

  function describeOpening() {
    const o = state.opening;
    if (!o) return;
    byId('openingTrainerTitle').textContent = `${o.family || 'Дебют'} · ${o.name}`;
    byId('openingTrainerDescription').textContent = o.description || 'Изучи порядок развития фигур и борьбу за центр.';
    byId('openingPlanWhite').textContent = o.plans_white || 'Развивай фигуры и борись за центр.';
    byId('openingPlanBlack').textContent = o.plans_black || 'Развивай фигуры и борись за центр.';
  }

  function renderMoveChips() {
    const host = byId('openingTrainerMoves');
    if (!host || !state.opening) return;
    const moves = state.mode === 'opening-bot' && state.game ? state.game.history() : (Array.isArray(state.opening.moves) ? state.opening.moves : []);
    const game = new Chess();
    const chunks = [];
    moves.forEach((san, index) => {
      const moveNumber = Math.floor(index / 2) + 1;
      const move = (() => { try { return game.move(san); } catch (_) { return null; } })();
      const side = index % 2 === 0 ? 'white' : 'black';
      chunks.push(`<span class="opening-move-chip ${side} ${index < state.moveIndex ? 'played' : ''} ${index === state.moveIndex - 1 ? 'last' : ''}">${side === 'white' ? `<b>${moveNumber}.</b>` : ''}${escapeHtml(move?.san || san)}</span>`);
    });
    host.innerHTML = chunks.join('');
  }

  function getPremoveBaseGame() {
    // Точно как в матах: мысленно передаём очередь хода игроку,
    // не меняя реальные фигуры до ответа соперника.
    return new Chess(state.game.fen());
  }

  function rebuildOpeningPremoveState() {
    if (!state.game || !window.ChessPremove) {
      state.virtualGame = state.game ? new Chess(state.game.fen()) : null;
      state.premoveQueue = [];
      return;
    }
    const base = getPremoveBaseGame();
    const result = window.ChessPremove.rebuild(base, userColor(), state.premoveQueue);
    state.premoveQueue = result.queue;
    state.virtualGame = result.virtualGame;
  }

  function updateOpeningPremoveHighlights() {
    const board = byId('openingTrainerBoard');
    if (!board) return;
    board.querySelectorAll('.premove-from, .premove-to').forEach(el => {
      el.classList.remove('premove-from', 'premove-to');
    });
    state.premoveQueue.forEach(move => {
      board.querySelector('.square-' + move.from)?.classList.add('premove-from');
      board.querySelector('.square-' + move.to)?.classList.add('premove-to');
    });
  }

  function renderPracticeBoard() {
    if (!state.board || !state.game) return;
    rebuildOpeningPremoveState();
    const visible = state.virtualGame || state.game;
    state.board.position(visible.fen(), false);
    state.board.orientation(state.side);
    const boardElement = byId('openingTrainerBoard');
    if (boardElement) boardElement.dataset.orientation = state.side;
    updateOpeningPremoveHighlights();
  }

  function isOpeningPlanningTurn() {
    return Boolean(
      state.botThinking ||
      (state.game && state.game.turn() !== userColor()) ||
      state.premoveQueue.length
    );
  }

  function updateBoard() {
    if (!state.board || !state.game) return;
    if (['practice', 'engine', 'opening-bot'].includes(state.mode)) renderPracticeBoard();
    else {
      state.board.position(state.game.fen(), false);
      state.board.orientation(state.side);
    }
    const boardElement = byId('openingTrainerBoard');
    if (boardElement) boardElement.dataset.orientation = state.side;
  }

  function resetGame() {
    clearPostTheoryGuide();
    if (byId('openingBotResult')) byId('openingBotResult').hidden = true;
    state.premoveQueue = [];
    state.virtualGame = null;
    state.deviationTraining = false;
    const advice = byId('openingDeviationAdvice');
    if (advice) advice.hidden = true;
    state.game = new Chess();
    state.moveIndex = 0;
    updateBoard();
    renderMoveChips();
  }

  function updateProgress() {
    if (state.mode === 'opening-bot') {
      const played = state.game ? state.game.history().length : 0;
      byId('openingTrainerProgressFill').style.width = '0%';
      byId('openingTrainerProgressText').textContent = played + ' полуходов сыграно';
      byId('openingTrainerProgressTextBottom').textContent = 'партия';
      renderMoveChips();
      return;
    }
    const total = state.opening?.moves?.length || 0;
    const done = Math.min(state.moveIndex, total);
    const percent = total ? Math.round(done / total * 100) : 0;
    byId('openingTrainerProgressFill').style.width = `${percent}%`;
    byId('openingTrainerProgressText').textContent = `${done} из ${total} ходов`;
    byId('openingTrainerProgressTextBottom').textContent = `${percent}%`;
    renderMoveChips();
  }

  function setMode(mode) {
    state.mode = mode;
    const isStudy = mode === 'study';
    const isPractice = mode === 'practice' || mode === 'engine' || mode === 'opening-bot';
    byId('openingTrainerIdle').hidden = true;
    byId('openingStartBlock').hidden = mode !== 'idle';
    byId('openingStudyStartBtn').hidden = mode !== 'idle';
    byId('openingTrainerStudy').hidden = !isStudy;
    byId('openingTrainerPlay').hidden = !isPractice;
    byId('openingTrainerBoardPanel').hidden = false;
    byId('openingTrainerMovesPanel').hidden = false;
    byId('openingTrainerModeLabel').textContent = mode === 'study' ? 'ИЗУЧЕНИЕ ТЕОРИИ' :
      mode === 'practice' ? 'ПОВТОРЕНИЕ ДЕБЮТА' : mode === 'engine' || mode === 'opening-bot' ? 'ПАРТИЯ ПРОТИВ ДЕБЮТНОГО БОТА' : 'ВЫБЕРИ ДЕБЮТ';
    if (state.board) updateBoard();
  }

  async function getOpeningDetails(summary) {
    const cacheKey = String(summary.id);
    if (state.detailCache.has(cacheKey)) return state.detailCache.get(cacheKey);

    const response = await fetch(`/api/openings/${encodeURIComponent(cacheKey)}`, {
      headers: { 'Accept': 'application/json' }, cache: 'force-cache'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} при загрузке линии`);
    const payload = await response.json();
    const detail = payload.opening || payload;
    if (!validateLine(detail)) throw new Error('В выбранной линии есть некорректный или нелегальный ход');
    state.detailCache.set(cacheKey, detail);
    return detail;
  }

  async function selectOpening(explicitId) {
    const selectedId = String(explicitId ?? byId('openingTrainerSelect').value ?? '');
    const summary = state.openings.find(o => String(o.id) === selectedId) || state.openings[0] || null;
    if (!summary) return;

    const token = ++state.loadToken;
    byId('openingBotResult').hidden = true;
    state.runId++;
    state.botThinking = false;
    state.opening = summary;
    state.catalogSide = summary.side === 'black' ? 'black' : 'white';
    if (Array.isArray(summary.moves) && ['e4', 'd4'].includes(summary.moves[0])) state.catalogFirstMove = summary.moves[0];
    byId('openingTrainerSelect').value = String(summary.id);
    describeOpening();
    resetGame();
    clearPostTheoryGuide();
    setMode('idle');
    refreshBoardClickToMove();
    renderCatalogList();
    document.querySelectorAll('[data-opening-category]').forEach(button => {
      const active = button.dataset.openingCategory === state.catalogSide;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const startButton = byId('openingStudyStartBtn');
    const deviationButton = byId('openingDeviationStart');
    const botButton = byId('openingBotStartBtn');
    if (botButton) botButton.disabled = true;
    if (startButton) startButton.disabled = true;
    if (deviationButton) deviationButton.disabled = true;
    byId('openingTrainerMoves').innerHTML = '<div class="opening-catalog-empty">Подготавливаю линию выбранного дебюта…</div>';
    setMessage('Загружаю только выбранную дебютную линию…', 'info');

    try {
      const detail = await getOpeningDetails(summary);
      if (token !== state.loadToken) return;
      if (!validateLine(detail)) throw new Error('В выбранной линии есть нелегальный ход. Выбери другой вариант или исправь запись в chess_content.py.');
      state.opening = detail;
      describeOpening();
      resetGame();
      refreshBoardClickToMove();
      updateProgress();
      renderCatalogList();
      if (startButton) startButton.disabled = false;
      if (deviationButton) deviationButton.disabled = false;
      if (botButton) botButton.disabled = false;
      setMessage('Линия загружена. Выбери свою сторону и начни изучение.', 'success');
    } catch (error) {
      if (token !== state.loadToken) return;
      if (startButton) startButton.disabled = true;
      if (deviationButton) deviationButton.disabled = true;
      if (botButton) botButton.disabled = true;
      setMessage(`Не удалось загрузить этот дебют: ${error.message}`, 'error');
    }
  }

  function refreshBoardClickToMove() {
    if (!window.initBoardClickToMove) return;
    window.initBoardClickToMove(
      'openingTrainerBoard',
      () => {
        if (['practice', 'engine', 'opening-bot'].includes(state.mode) && isOpeningPlanningTurn()) {
          rebuildOpeningPremoveState();
          return state.virtualGame || state.game;
        }
        return state.game;
      },
      handleUserDrop,
      {
        canSelect: piece => Boolean(
          ['practice', 'engine', 'opening-bot'].includes(state.mode) &&
          !state.game.game_over() &&
          piece &&
          piece.color === userColor()
        )
      }
    );
  }

  function initializeBoard() {
    if (state.board || !window.Chessboard) return;
    state.board = Chessboard('openingTrainerBoard', {
      position: 'start', orientation: 'white', draggable: true, pieceTheme: PIECE_THEME,
      onDragStart: (source, piece) => {
        if (!['practice', 'engine', 'opening-bot'].includes(state.mode) || state.game.game_over()) return false;
        rebuildOpeningPremoveState();
        const activeGame = isOpeningPlanningTurn() ? state.virtualGame : state.game;
        if (!piece || piece[0] !== userColor() || !activeGame) return false;
        return activeGame.moves({ square: source }).length > 0;
      },
      onDrop: handleUserDrop,
      onSnapEnd: () => updateBoard()
    });
    installRightClickArrows('openingTrainerBoard');
    refreshBoardClickToMove();
    const boardElement = byId('openingTrainerBoard');
    if (boardElement) boardElement.dataset.orientation = state.side;
  }

  const POST_THEORY_COLORS = {
    p: '#e7b93f', n: '#42a5f5', b: '#42c98a',
    r: '#f28c45', q: '#bd83f5'
  };
  const PIECE_NAMES = { p: 'Пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь' };

  function clearPostTheoryGuide() {
    byId('openingPostTheoryGuide').hidden = true;
    if (window.ChessBoardDrawing?.clear) window.ChessBoardDrawing.clear('openingTrainerBoard');
  }

  function buildPostTheoryIdeas() {
    if (!state.game) return [];
    const game = new Chess(state.game.fen());
    const color = userColor();
    const fen = game.fen().split(' ');
    fen[1] = color;
    game.load(fen.join(' '));
    const board = game.board();
    const pieces = [];
    board.forEach((row, rankIndex) => row.forEach((piece, fileIndex) => {
      if (piece && piece.color === color && piece.type !== 'k') {
        pieces.push({ ...piece, square: 'abcdefgh'[fileIndex] + (8 - rankIndex) });
      }
    }));
    const centerScore = square => {
      const file = square.charCodeAt(0) - 97;
      const rank = Number(square[1]) - 1;
      return 7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
    };
    const ideas = [];
    const usedTypes = new Set();

    // One clear candidate per piece type, chosen only from legal moves.
    // These are positional prompts, not engine-certified best moves.
    for (const piece of pieces) {
      if (usedTypes.has(piece.type)) continue;
      const moves = game.moves({ square: piece.square, verbose: true })
        .filter(move => !move.captured && !move.promotion && !String(move.flags).includes('e'));
      if (!moves.length) continue;
      const scored = moves.map(move => {
        const fromScore = centerScore(move.from);
        const toScore = centerScore(move.to);
        let score = toScore - fromScore * 0.12;
        if (piece.type === 'p') score += (color === 'w' ? 1 : -1) * (Number(move.to[1]) - Number(move.from[1])) * 0.55;
        if (piece.type === 'n') score += toScore * 0.65;
        if (piece.type === 'b') score += toScore * 0.35;
        if (piece.type === 'r') {
          const file = move.to[0];
          const ownPawnsOnFile = pieces.filter(p => p.type === 'p' && p.square[0] === file).length;
          score += ownPawnsOnFile === 0 ? 1.2 : ownPawnsOnFile === 1 ? 0.5 : 0;
        }
        if (move.san.includes('+') || move.san.includes('#')) score += 0.25;
        return { move, score };
      }).sort((a, b) => b.score - a.score);
      const chosen = scored[0]?.move;
      if (!chosen) continue;
      usedTypes.add(piece.type);
      ideas.push({
        from: chosen.from, to: chosen.to,
        color: POST_THEORY_COLORS[piece.type],
        name: PIECE_NAMES[piece.type],
        san: chosen.san
      });
    }
    return ideas;
  }

  function showPostTheoryGuide() {
    const panel = byId('openingPostTheoryGuide');
    if (!panel || !state.opening || !state.game) return;
    const ideas = buildPostTheoryIdeas();
    const plan = state.side === 'white' ? state.opening.plans_white : state.opening.plans_black;
    byId('openingPostTheoryPlan').textContent = plan || 'Сохраняй контроль над центром и улучшай положение наименее активной фигуры.';
    byId('openingPostTheoryMoves').innerHTML = ideas.length
      ? ideas.map(item => `<li><span class="opening-piece-dot" style="--piece-idea-color:${item.color}"></span><strong>${escapeHtml(item.name)}:</strong> ${escapeHtml(item.san)} <small>(${escapeHtml(item.from)} → ${escapeHtml(item.to)})</small></li>`).join('')
      : '<li>Сначала найди безопасное развитие фигур и защити короля.</li>';
    panel.hidden = false;
    window.ChessBoardDrawing?.setArrows?.('openingTrainerBoard', ideas);
  }

  function startStudy() {
    if (!state.opening || !Array.isArray(state.opening.moves) || !state.opening.moves.length) return;
    state.runId++;
    state.botThinking = false;
    resetGame();
    clearPostTheoryGuide();
    setMode('study');
    refreshBoardClickToMove();
    byId('openingStudyStep').textContent = 'Позиция перед первым ходом';
    byId('openingStudyPrev').disabled = true;
    byId('openingStudyNext').disabled = false;
    byId('openingStartPractice').hidden = true;
    byId('openingStartDeviation').hidden = true;
    setMessage('Просматривай линию ход за ходом. Обрати внимание на планы обеих сторон.', 'info');
    updateProgress();
  }

  function studyNext() {
    if (state.mode !== 'study' || state.moveIndex >= state.opening.moves.length) return;
    const san = state.opening.moves[state.moveIndex];
    let move = null;
    try { move = state.game.move(san); } catch (_) {}
    if (!move) {
      setMessage(`В линии обнаружен некорректный ход: ${san}.`, 'error');
      return;
    }
    state.moveIndex++;
    updateBoard();
    updateProgress();
    byId('openingStudyStep').textContent = `${state.moveIndex}. ${move.color === 'w' ? 'Белые' : 'Чёрные'} сыграли ${move.san}`;
    byId('openingStudyPrev').disabled = false;
    const finished = state.moveIndex >= state.opening.moves.length;
    byId('openingStudyNext').disabled = finished;
    byId('openingStartPractice').hidden = !finished;
    byId('openingStartDeviation').hidden = !finished;
    if (finished) showPostTheoryGuide();
    setMessage(finished ? 'Теория пройдена. Стрелки показывают возможные маршруты фигур, а ниже — план продолжения.' : 'Посмотри, как изменилось положение фигур, и переходи к следующему ходу.', 'success');
  }

  function studyPrev() {
    if (state.mode !== 'study' || state.moveIndex <= 0) return;
    state.game.undo();
    state.moveIndex--;
    updateBoard();
    clearPostTheoryGuide();
    updateProgress();
    byId('openingStudyStep').textContent = state.moveIndex ? `Возврат к ходу ${state.moveIndex}` : 'Позиция перед первым ходом';
    byId('openingStudyPrev').disabled = state.moveIndex === 0;
    byId('openingStudyNext').disabled = false;
    byId('openingStartPractice').hidden = true;
    byId('openingStartDeviation').hidden = true;
    setMessage('Можешь ещё раз просмотреть этот фрагмент теории.', 'info');
  }

  function startPractice(withDeviations = false) {
    if (!state.opening || !Array.isArray(state.opening.moves) || !state.opening.moves.length) return;
    state.runId++;
    const run = state.runId;
    state.botThinking = false;
    resetGame();
    clearPostTheoryGuide();
    state.deviationTraining = Boolean(withDeviations);
    setMode('practice');
    refreshBoardClickToMove();
    byId('openingPracticeStatus').textContent = state.deviationTraining
      ? 'Тренировка отклонений: соперник сыграет не по теории. Найди сильный ответ.'
      : 'Повторение: играй свою часть линии без подсказок.';
    setMessage(state.deviationTraining
      ? 'Сначала играй свои ходы по репертуару. Затем Stockfish намеренно выберет сильный ход вне изученной линии.'
      : 'Повтори изученную последовательность. Если ошибёшься, позиция останется прежней.', 'info');
    updateProgress();
    maybePlayBookMove(run);
  }

  function maybePlayBookMove(run) {
    if (run !== state.runId || state.mode !== 'practice' || state.botThinking) return;
    if (state.game.turn() === userColor()) {
      if (state.moveIndex >= state.opening.moves.length) {
        enterEngineMode(run);
        return;
      }
      byId('openingPracticeStatus').textContent = 'Твой ход. Вспомни продолжение из теории.';
      return;
    }
    if (state.deviationTraining) {
      playDeviationMove(run);
      return;
    }
    if (state.moveIndex >= state.opening.moves.length) {
      enterEngineMode(run);
      return;
    }
    const san = state.opening.moves[state.moveIndex];
    state.botThinking = true;
    renderPracticeBoard();
    byId('openingPracticeStatus').textContent = 'Бот отвечает по изученной линии… Можно заранее поставить ход.';
    setTimeout(() => {
      if (run !== state.runId || state.mode !== 'practice') return;
      let move = null;
      try { move = state.game.move(san); } catch (_) {}
      state.botThinking = false;
      if (!move) {
        setMessage(`Бот не смог выполнить ход из линии: ${san}. Проверь запись дебюта.`, 'error');
        return;
      }
      state.moveIndex++;
      state.botThinking = false;
      updateBoard();
      updateProgress();
      if (state.game.turn() === userColor() && state.premoveQueue.length) {
        // Если линия уже закончилась ходом соперника, переходим к игре
        // против движка и выполняем очередь как обычный легальный премув.
        if (state.moveIndex >= state.opening.moves.length) enterEngineMode(run);
        executeOpeningPremove(run);
      } else if (state.moveIndex >= state.opening.moves.length) {
        enterEngineMode(run);
      } else {
        maybePlayBookMove(run);
      }
    }, 360);
  }

  function formatDeviationEvaluation(data) {
    const factor = userColor() === 'w' ? 1 : -1;
    if (data && data.is_mate) {
      const mateForUser = Number(data.mate_in || 0) * factor;
      return mateForUser > 0
        ? 'Stockfish видит мат в твою пользу' + (Math.abs(mateForUser) ? ' в ' + Math.abs(mateForUser) : '')
        : 'Stockfish видит форсированный мат в пользу соперника';
    }
    const whiteEval = Number(data && data.eval);
    if (!Number.isFinite(whiteEval)) return 'Оценка Stockfish получена';
    const playerEval = whiteEval * factor;
    return 'Оценка для тебя: ' + (playerEval > 0 ? '+' : '') + playerEval.toFixed(2);
  }

  function renderDeviationAdvice(opponentMove, expectedSan, data) {
    const card = byId('openingDeviationAdvice');
    if (!card) return;
    const lines = Array.isArray(data && data.top_moves)
      ? data.top_moves.filter(line => line && line.uci && line.san)
      : [];
    const opponentEl = byId('openingDeviationOpponentMove');
    const bestEl = byId('openingDeviationBest');
    const lineEl = byId('openingDeviationLine');
    const evalEl = byId('openingDeviationEval');
    const planEl = byId('openingDeviationPlan');
    const optionsEl = byId('openingDeviationOptions');

    if (opponentEl) {
      opponentEl.textContent = 'Вместо ' + (expectedSan || 'продолжения по теории')
        + ' соперник сыграл ' + opponentMove.san + '. Это уже другая позиция — не пытайся механически повторять дебют.';
    }
    if (evalEl) evalEl.textContent = formatDeviationEvaluation(data || {});
    if (bestEl) bestEl.textContent = lines.length
      ? 'Лучший ответ: ' + lines[0].san
      : 'Лучший ответ пока не получен. Оцени шахи, взятия и угрозы.';
    if (lineEl) lineEl.textContent = lines.length && lines[0].pv
      ? 'Основной вариант Stockfish: ' + lines[0].pv
      : 'Сделай естественный развивающий ход и проверь его после партии.';
    if (planEl) {
      const plan = state.opening && state.opening[userColor() === 'w' ? 'plans_white' : 'plans_black'];
      planEl.textContent = 'Твой общий план: ' + (plan || 'развивай фигуры, борись за центр и сначала проверь угрозу последнего хода соперника.');
    }
    if (optionsEl) {
      optionsEl.replaceChildren();
      lines.slice(0, 3).forEach((line, index) => {
        const item = document.createElement('li');
        item.textContent = (index + 1) + '. ' + line.san + (line.pv ? ' — ' + line.pv : '');
        optionsEl.appendChild(item);
      });
    }
    card.hidden = false;
  }

  async function playDeviationMove(run) {
    if (run !== state.runId || state.mode !== 'practice' || state.botThinking) return;

    const positionFen = state.game.fen();
    const expected = lineMoveAt(state.moveIndex);
    const expectedSan = state.opening.moves[state.moveIndex] || '';
    const expectedUci = toUci(expected);
    state.botThinking = true;
    renderPracticeBoard();
    byId('openingPracticeStatus').textContent = 'Stockfish готовит отклонение от теории…';
    setMessage('Соперник выбирает сильный ход, который не входит в изученную линию.', 'info');

    let chosen = null;
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({fen: positionFen})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Ошибка движка');
      if (run !== state.runId || state.mode !== 'practice') return;

      const candidates = Array.isArray(data.top_moves)
        ? data.top_moves.filter(line => line && line.uci && line.uci.length >= 4)
        : [];
      chosen = candidates.find(line => line.uci !== expectedUci) || null;
      if (!chosen) throw new Error('Stockfish не нашёл подходящего альтернативного хода');
    } catch (error) {
      if (run !== state.runId || state.mode !== 'practice') return;
      state.botThinking = false;
      state.deviationTraining = false;
      updateBoard();
      setMessage('Не удалось смоделировать отклонение: ' + error.message + '. Продолжим по основной линии.', 'error');
      byId('openingPracticeStatus').textContent = 'Продолжение по теории.';
      maybePlayBookMove(run);
      return;
    }

    const opponentMove = state.game.move({
      from: chosen.uci.slice(0, 2),
      to: chosen.uci.slice(2, 4),
      promotion: chosen.uci[4] || 'q'
    });
    if (!opponentMove) {
      state.botThinking = false;
      state.deviationTraining = false;
      updateBoard();
      setMessage('Альтернативный ход Stockfish оказался нелегальным. Продолжим по основной линии.', 'error');
      maybePlayBookMove(run);
      return;
    }

    state.botThinking = false;
    state.deviationTraining = false;
    state.premoveQueue = [];
    state.virtualGame = null;
    state.mode = 'engine';
    byId('openingTrainerModeLabel').textContent = 'ИГРА ПОСЛЕ ОТКЛОНЕНИЯ';
    byId('openingPracticeStatus').textContent = 'Соперник отклонился от теории. Найди лучший ответ на доске.';
    updateBoard();
    setMessage('Отклонение соперника: ' + opponentMove.san + '. Теперь важно найти правильный план.', 'info');

    const adviceFen = state.game.fen();
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({fen: adviceFen})
      });
      const advice = await response.json();
      if (!response.ok) throw new Error(advice.detail || 'Ошибка анализа');
      if (run !== state.runId || state.mode !== 'engine' || state.game.fen() !== adviceFen) return;
      renderDeviationAdvice(opponentMove, expectedSan, advice);
      const best = Array.isArray(advice.top_moves) && advice.top_moves[0];
      setMessage(best && best.san
        ? 'Соперник отклонился. Stockfish советует ' + best.san + ' — попробуй найти этот ход самостоятельно.'
        : 'Соперник отклонился. Твой ход — оцени новую позицию.', 'success');
    } catch (error) {
      if (run === state.runId && state.mode === 'engine' && state.game.fen() === adviceFen) {
        renderDeviationAdvice(opponentMove, expectedSan, {});
        setMessage('Отклонение найдено, но подсказку Stockfish получить не удалось: ' + error.message, 'error');
      }
    }
  }

  function enterEngineMode(run) {
    if (run !== state.runId) return;
    state.mode = 'engine';
    byId('openingTrainerModeLabel').textContent = 'ПАРТИЯ ПРОТИВ БОТА';
    byId('openingPracticeStatus').textContent = 'Дебютная линия завершена. Продолжай партию против Stockfish.';
    setMessage('Отлично! Основная линия пройдена. Теперь бот играет самостоятельно.', 'success');
    if (!state.game.game_over() && state.game.turn() !== userColor()) playEngineMove(run);
  }

  async function playEngineMove(run) {
    if (run !== state.runId || state.mode !== 'engine' || state.botThinking || state.game.game_over()) return;
    if (state.game.turn() === userColor()) return;
    state.botThinking = true;
    renderPracticeBoard();
    byId('openingPracticeStatus').textContent = 'Stockfish выбирает ход… Можно заранее поставить ход.';
    const positionFen = state.game.fen();
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({fen: positionFen})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Ошибка движка');
      if (run !== state.runId || state.mode !== 'engine') return;
      const candidates = Array.isArray(data.top_moves) ? data.top_moves.filter(m => m && m.uci && m.uci.length >= 4) : [];
      if (!candidates.length) throw new Error('Движок не вернул допустимый ход');
      let pick = 0;
      if (state.level === 'easy' && candidates.length > 1) pick = Math.floor(Math.random() * candidates.length);
      if (state.level === 'medium' && candidates.length > 1) pick = Math.floor(Math.random() * Math.min(2, candidates.length));
      const uci = candidates[pick].uci;
      const move = state.game.move({from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q'});
      if (!move) throw new Error('Движок вернул нелегальный ход');
      updateBoard();
      const result = state.game.game_over();
      byId('openingPracticeStatus').textContent = result ? 'Партия завершена.' : 'Твой ход. Продолжай партию.';
      if (result) setMessage(`Партия завершена: ${state.game.in_checkmate() ? 'мат' : state.game.in_draw() ? 'ничья' : 'игра окончена'}.`, 'success');
      else setMessage(`Бот сыграл ${move.san}. Твой ход.`, 'info');
    } catch (error) {
      if (run === state.runId) {
        setMessage(`Не удалось получить ход Stockfish: ${error.message}. Проверь доступность /api/evaluate и попробуй продолжить.`, 'error');
        byId('openingPracticeStatus').textContent = 'Ожидается ход бота.';
      }
    } finally {
      if (run === state.runId) {
        state.botThinking = false;
        updateBoard();
        if (!state.game.game_over() && state.game.turn() === userColor() && state.premoveQueue.length) {
          executeOpeningPremove(run);
        }
      }
    }
  }

  function executeOpeningPremove(run) {
    if (run !== state.runId || !['practice', 'engine', 'opening-bot'].includes(state.mode) || !state.premoveQueue.length) {
      updateBoard();
      return;
    }

    const rebuilt = window.ChessPremove.rebuild(state.game, userColor(), state.premoveQueue);
    state.premoveQueue = rebuilt.queue;
    if (state.mode === 'practice' && state.moveIndex < state.opening.moves.length) {
      const expected = lineMoveAt(state.moveIndex);
      const planned = state.premoveQueue[0];
      if (!expected || !planned || toUci(expected) !== planned.from + planned.to + (planned.promotion || '')) {
        state.premoveQueue = [];
        renderPracticeBoard();
        setMessage('Премув отменён: этот ход не совпадает с изучаемой линией. Сделай правильный ход самостоятельно.', 'error');
        byId('openingPracticeStatus').textContent = 'Твой ход. Премув не засчитан.';
        return;
      }
    }

    const executed = window.ChessPremove.execute(state.game, userColor(), state.premoveQueue);
    state.premoveQueue = executed.queue;
    if (!executed.move) {
      state.premoveQueue = [];
      renderPracticeBoard();
      setMessage('Премув отменён: после ответа соперника ход больше не легален.', 'error');
      byId('openingPracticeStatus').textContent = 'Твой ход. Выбери другой ход.';
      return;
    }

    if (state.mode === 'practice') {
      state.moveIndex++;
      updateProgress();
    }
    renderPracticeBoard();
    const gameOver = state.game.game_over();
    if (gameOver) {
      state.premoveQueue = [];
      updateBoard();
      if (state.mode === 'opening-bot') finishOpeningBotGame();
      else {
        setMessage('Партия завершена: ' + (state.game.in_checkmate() ? 'мат' : 'ничья') + '.', 'success');
        byId('openingPracticeStatus').textContent = 'Партия завершена.';
      }
      return;
    }

    setMessage('Премув выполнен: ' + executed.move.san + '.', 'success');
    byId('openingPracticeStatus').textContent = 'Премув выполнен. Бот отвечает…';
    if (state.mode === 'practice' && state.moveIndex >= state.opening.moves.length && !state.deviationTraining) {
      enterEngineMode(run);
    } else if (state.mode === 'practice') {
      setTimeout(() => maybePlayBookMove(run), 160);
    } else if (state.mode === 'opening-bot') {
      setTimeout(() => playOpeningBotMove(run), 160);
    } else {
      setTimeout(() => playEngineMove(run), 160);
    }
  }

  function handleUserDrop(source, target) {
    if (!['practice', 'engine', 'opening-bot'].includes(state.mode) || state.game.game_over()) return 'snapback';
    const planningMode = isOpeningPlanningTurn();
    if (planningMode) {
      const base = getPremoveBaseGame();
      const planned = window.ChessPremove.add(base, userColor(), state.premoveQueue, {
        from: source, to: target, promotion: 'q'
      });
      if (!planned.ok) return 'snapback';
      state.premoveQueue = planned.queue;
      state.virtualGame = planned.virtualGame;
      renderPracticeBoard();
      setMessage('Премув ' + source + ' → ' + target + ' поставлен. Выполнится после ответа соперника, если останется легальным.', 'info');
      byId('openingPracticeStatus').textContent = 'Премув ожидает ответа соперника.';
      return;
    }

    if (state.game.turn() !== userColor()) return 'snapback';
    const expected = state.mode === 'practice' ? lineMoveAt(state.moveIndex) : null;
    let move = null;
    try { move = state.game.move({from: source, to: target, promotion: 'q'}); } catch (_) {}
    if (!move) return 'snapback';
    const oldAdvice = byId('openingDeviationAdvice');
    if (oldAdvice) oldAdvice.hidden = true;

    if (state.mode === 'practice') {
      if (!expected || toUci(move) !== toUci(expected)) {
        state.game.undo();
        setMessage('Это не тот ход из изученной линии. Попробуй вспомнить продолжение.', 'error');
        byId('openingPracticeStatus').textContent = 'Ход не засчитан — попробуй ещё раз.';
        return 'snapback';
      }
      state.moveIndex++;
      updateProgress();
      setMessage(`Верно: ${move.san}.`, 'success');
      byId('openingPracticeStatus').textContent = 'Ход засчитан. Бот отвечает…';
      const run = state.runId;
      setTimeout(() => {
        if (run !== state.runId) return;
        if (state.moveIndex >= state.opening.moves.length && !state.deviationTraining) enterEngineMode(run);
        else maybePlayBookMove(run);
      }, 220);
    } else if (state.mode === 'opening-bot') {
      updateProgress();
      if (state.game.game_over()) finishOpeningBotGame();
      else {
        byId('openingPracticeStatus').textContent = 'Ход сделан. Бот ищет продолжение выбранного дебюта…';
        const run = state.runId;
        setTimeout(() => playOpeningBotMove(run), 220);
      }
    } else {
      updateProgress();
      byId('openingPracticeStatus').textContent = 'Ход сделан. Бот отвечает…';
      const run = state.runId;
      setTimeout(() => playEngineMove(run), 220);
    }
    return undefined;
  }

  function readPersonalOpeningLines() {
    try {
      const saved = JSON.parse(localStorage.getItem('chessTrainerPersonalOpeningLines') || '[]');
      return Array.isArray(saved) ? saved.filter(item =>
        item && item.id && item.family && Array.isArray(item.moves) && item.moves.length && validateLine(item)
      ) : [];
    } catch (_) { return []; }
  }

  function finishOpeningBotGame() {
    if (state.mode !== 'opening-bot' || !state.game || !state.game.game_over()) return;
    state.botThinking = false;
    state.premoveQueue = [];
    updateBoard();
    const won = state.game.in_checkmate() && state.game.turn() !== userColor();
    const drawn = state.game.is_draw ? state.game.is_draw() : state.game.in_draw();
    byId('openingBotResult').hidden = false;
    byId('openingBotSaveTheory').hidden = !won;
    byId('openingBotResultTitle').textContent = won ? 'Победа! Отличная партия.' : drawn ? 'Ничья' : 'Партия завершена';
    byId('openingBotResultText').textContent = won
      ? 'Сохрани все ходы обоих игроков как собственный вариант дебюта и добавь к нему свои заметки.'
      : 'Сыграй ещё раз. Сохранение собственной теории будет доступно после победы.';
    byId('openingPracticeStatus').textContent = 'Партия завершена.';
    setMessage(won
      ? 'Ты выиграл у дебютного бота. Теперь можешь сохранить эту партию в свои варианты.'
      : drawn ? 'Ничья. Попробуй другую вариацию выбранного дебюта.' : 'Партия завершена. Попробуй ещё раз и найди более сильный план.',
      won ? 'success' : 'info');
  }

  async function startOpeningBotGame() {
    if (!state.opening) return;
    state.runId++;
    const run = state.runId;
    state.botThinking = false;
    resetGame();
    state.openingBotFamily = state.opening.family || state.opening.name;
    state.openingBotSaved = false;
    const siblings = state.openings.filter(item =>
      (item.family || item.name) === state.openingBotFamily && item.side === state.opening.side
    );
    const variants = [];
    for (const summary of siblings) {
      try {
        const detail = await getOpeningDetails(summary);
        if (validateLine(detail)) variants.push(detail);
      } catch (_) {}
    }
    if (run !== state.runId) return;
    state.openingBotVariants = variants.length ? variants : [state.opening];
    state.deviationTraining = false;
    setMode('opening-bot');
    refreshBoardClickToMove();
    byId('openingBotResult').hidden = true;
    byId('openingBotSaveTheory').disabled = false;
    byId('openingBotSaveTheory').textContent = 'Сохранить партию в мои варианты';
    byId('openingBotTheoryNotes').value = '';
    byId('openingPracticeStatus').textContent = 'Играй выбранный дебют. Бот будет выбирать разные теоретические продолжения.';
    setMessage('Выбран дебют «' + state.openingBotFamily + '». Доступно линий: ' + state.openingBotVariants.length +
      '. Бот будет менять варианты, а если ты выйдешь из репертуара — продолжит по позиции.', 'success');
    updateProgress();
    if (state.game.turn() !== userColor()) playOpeningBotMove(run);
  }

  async function playOpeningBotMove(run) {
    if (run !== state.runId || state.mode !== 'opening-bot' || state.botThinking || state.game.game_over()) return;
    if (state.game.turn() === userColor()) return;
    state.botThinking = true;
    renderPracticeBoard();
    byId('openingPracticeStatus').textContent = 'Бот выбирает продолжение дебюта…';
    const history = state.game.history();
    const bookCandidates = [];
    state.openingBotVariants.forEach(variant => {
      const line = Array.isArray(variant.moves) ? variant.moves : [];
      if (line.length > history.length && history.every((san, index) => line[index] === san)) {
        bookCandidates.push(line[history.length]);
      }
    });
    const uniqueBookMoves = [...new Set(bookCandidates)];
    let move = null;
    try {
      if (uniqueBookMoves.length) {
        const san = uniqueBookMoves[Math.floor(Math.random() * uniqueBookMoves.length)];
        move = state.game.move(san);
      } else {
        const response = await fetch('/api/evaluate', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({fen: state.game.fen()})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Ошибка движка');
        const candidates = Array.isArray(data.top_moves) ? data.top_moves.filter(item => item && item.uci && item.uci.length >= 4) : [];
        if (!candidates.length) throw new Error('Stockfish не вернул ход');
        const pick = state.level === 'easy'
          ? Math.floor(Math.random() * candidates.length)
          : state.level === 'medium'
            ? Math.floor(Math.random() * Math.min(3, candidates.length))
            : 0;
        const uci = candidates[pick].uci;
        move = state.game.move({from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q'});
      }
      if (!move) throw new Error('Не удалось применить ход бота');
      updateBoard();
      updateProgress();
      if (state.game.game_over()) finishOpeningBotGame();
      else {
        byId('openingPracticeStatus').textContent = 'Бот сыграл ' + move.san + '. Твой ход.';
        setMessage(uniqueBookMoves.length
          ? 'Бот продолжает выбранный дебют: ' + move.san + '.'
          : 'Позиция вышла за пределы сохранённых линий. Бот продолжает играть по Stockfish.', 'info');
      }
    } catch (error) {
      setMessage('Не удалось сделать ход бота: ' + error.message, 'error');
      byId('openingPracticeStatus').textContent = 'Не удалось получить ход. Попробуй ещё раз.';
    } finally {
      if (run === state.runId) {
        state.botThinking = false;
        updateBoard();
        if (state.game.game_over()) finishOpeningBotGame();
        else if (state.premoveQueue.length && state.game.turn() === userColor()) executeOpeningPremove(run);
      }
    }
  }

  function saveOpeningBotTheory() {
    if (state.mode !== 'opening-bot' || !state.game || !state.game.game_over() || state.openingBotSaved) return;
    const won = state.game.in_checkmate() && state.game.turn() !== userColor();
    if (!won) return;
    const moves = state.game.history();
    if (!moves.length || !validateLine({moves})) {
      setMessage('Не удалось сохранить линию: проверь запись ходов.', 'error');
      return;
    }
    const saved = readPersonalOpeningLines();
    const id = 'my_opening_' + Date.now();
    const notes = (byId('openingBotTheoryNotes').value || '').trim();
    const line = {
      id, side: state.side, family: state.openingBotFamily || state.opening.family || 'Мои варианты',
      name: 'Моя партия · ' + new Date().toLocaleDateString('ru-RU'), moves,
      description: notes || 'Сохранённая партия против бота.', plans_white: state.side === 'white' ? notes : '',
      plans_black: state.side === 'black' ? notes : '', personal: true, pgn: state.game.pgn()
    };
    saved.push(line);
    try { localStorage.setItem('chessTrainerPersonalOpeningLines', JSON.stringify(saved)); }
    catch (_) {
      setMessage('Браузер не позволил сохранить вариант. Освободи место в хранилище и попробуй снова.', 'error');
      return;
    }
    state.openingBotSaved = true;
    state.openings.push(line);
    state.detailCache.set(String(id), line);
    renderOpeningOptions();
    setMessage('Партия сохранена в «Мои варианты» внутри каталога дебютов. Ходы обоих игроков и заметки записаны.', 'success');
    byId('openingBotSaveTheory').textContent = '✓ Сохранено в мои варианты';
    byId('openingBotSaveTheory').disabled = true;
  }

  function resetTraining() {
    state.runId++;
    state.botThinking = false;
    resetGame();
    setMode('idle');
    refreshBoardClickToMove();
    setMessage('Тренировка сброшена. Начни с изучения теории.', 'info');
  }

  function bindEvents() {
    byId('openingTrainerSelect').addEventListener('change', () => selectOpening());
    document.querySelectorAll('[data-opening-category]').forEach(button => {
      button.addEventListener('click', () => setCatalogSide(button.dataset.openingCategory));
    });
    document.querySelectorAll('[data-opening-first-move]').forEach(button => {
      button.addEventListener('click', () => setCatalogFirstMove(button.dataset.openingFirstMove));
    });
    const catalog = byId('openingCatalogList');
    catalog.addEventListener('click', event => {
      const item = event.target.closest('[data-opening-id]');
      if (item) chooseCatalogOpening(item.dataset.openingId);
    });
    document.querySelectorAll('[data-opening-side]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-opening-side]').forEach(b => {
          const active = b === button;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        state.side = button.dataset.openingSide;
        if (state.board) state.board.orientation(state.side);
        if (state.mode !== 'idle') resetTraining();
        else setMessage(`Выбрана сторона: ${colorName(userColor())}.`, 'info');
      });
    });
    byId('openingTrainerLevel').addEventListener('change', e => { state.level = e.target.value; });
    byId('openingStudyStartBtn').addEventListener('click', startStudy);
    byId('openingStudyPrev').addEventListener('click', studyPrev);
    byId('openingStudyNext').addEventListener('click', studyNext);
    byId('openingStartPractice').addEventListener('click', () => startPractice(false));
    byId('openingStartDeviation').addEventListener('click', () => startPractice(true));
    byId('openingDeviationStart').addEventListener('click', () => startPractice(true));
    byId('openingBotStartBtn').addEventListener('click', startOpeningBotGame);
    byId('openingBotSaveTheory').addEventListener('click', saveOpeningBotTheory);
    byId('openingPracticeRestart').addEventListener('click', () => startPractice(false));
    byId('openingTrainerReset').addEventListener('click', resetTraining);
  }

  async function init() {
    initializeBoard();
    bindEvents();
    try {
      // Локальный каталог — быстрый и надёжный источник. Он позволяет показать
      // все дебюты даже если API временно недоступно или маршрут ещё не подключён.
      const bundled = Array.isArray(window.CHESS_OPENINGS_DATA) ? window.CHESS_OPENINGS_DATA : [];
      if (bundled.length) {
        state.openings = bundled.filter(item => item && item.id && item.side && item.name);
        state.openings.forEach(item => state.detailCache.set(String(item.id), item));
      } else {
        let payload = null;
        try {
          const response = await fetch('/api/openings/catalog', {
            headers: { 'Accept': 'application/json' }, cache: 'no-store'
          });
          if (response.ok) payload = await response.json();
        } catch (_) {}
        if (!payload) {
          const response = await fetch('/api/openings', {
            headers: { 'Accept': 'application/json' }, cache: 'no-store'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          payload = await response.json();
        }
        const items = Array.isArray(payload) ? payload : (payload.openings || []);
        state.openings = items.filter(item => item && item.id && item.side && item.name);
        // Если сервер вернул полные данные, используем их без второго запроса.
        state.openings.forEach(item => {
          if (Array.isArray(item.moves)) state.detailCache.set(String(item.id), item);
        });
      }
      if (!state.openings.length) throw new Error('Список дебютов пуст. Проверь openings-data.js и /api/openings.');

      readPersonalOpeningLines().forEach(item => { state.openings.push(item); state.detailCache.set(String(item.id), item); });
      renderOpeningOptions();
      state.catalogSide = state.openings.some(item => item.side === 'white') ? 'white' : 'black';
      state.catalogFirstMove = 'e4';
      const first = state.openings.find(item => item.side === state.catalogSide && startsWithCatalogMove(item)) || state.openings.find(item => item.side === state.catalogSide) || state.openings[0];
      state.side = state.catalogSide;
      document.querySelectorAll('[data-opening-side]').forEach(button => {
        const active = button.dataset.openingSide === state.side;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      renderCatalogList();
      setMode('idle');
      resetGame();
      updateBoard();
      setTimeout(() => state.board?.resize(), 80);
      setMessage(`Каталог готов: ${state.openings.length} дебютов. Выбери вариант справа.`, 'success');
      await selectOpening(first.id);
    } catch (error) {
      setMessage(`Не удалось загрузить дебюты: ${error.message}`, 'error');
      const host = byId('openingCatalogList');
      if (host) host.innerHTML = `<div class="opening-catalog-empty">${escapeHtml(error.message)}<br>Проверь, что openings-data.js находится в front/js/.</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('resize', () => { if (state.board) state.board.resize(); });
})();
