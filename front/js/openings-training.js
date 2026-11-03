/* Тренажёр дебютов: теория -> повторение линии -> партия против Stockfish. */
(() => {
  'use strict';

  const PIECE_THEME = '/img/pieces/{piece}.png';
  const state = {
    openings: [], opening: null, side: 'white', catalogSide: 'white', level: 'medium',
    game: null, board: null, mode: 'idle', moveIndex: 0,
    botThinking: false, runId: 0, loadToken: 0, lastError: '',
    detailCache: new Map()
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
    const filtered = state.openings.filter(item => item.side === state.catalogSide);
    if (!filtered.length) {
      host.innerHTML = '<div class="opening-catalog-empty">Для этой стороны пока нет добавленных дебютов.</div>';
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
              <small>${Number(item.move_count ?? item.moves?.length ?? 0)} полуходов</small>
            </button>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  function setCatalogSide(side) {
    if (!['white', 'black'].includes(side)) return;
    state.catalogSide = side;
    document.querySelectorAll('[data-opening-category]').forEach(button => {
      const active = button.dataset.openingCategory === side;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const next = state.openings.find(item => item.side === side);
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
    const moves = Array.isArray(state.opening.moves) ? state.opening.moves : [];
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

  function updateBoard() {
    if (!state.board || !state.game) return;
    state.board.position(state.game.fen(), false);
    state.board.orientation(state.side);
    const boardElement = byId('openingTrainerBoard');
    if (boardElement) boardElement.dataset.orientation = state.side;
  }

  function resetGame() {
    state.game = new Chess();
    state.moveIndex = 0;
    updateBoard();
    renderMoveChips();
  }

  function updateProgress() {
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
    const isPractice = mode === 'practice' || mode === 'engine';
    byId('openingTrainerIdle').hidden = true;
    byId('openingStartBlock').hidden = mode !== 'idle';
    byId('openingStudyStartBtn').hidden = mode !== 'idle';
    byId('openingTrainerStudy').hidden = !isStudy;
    byId('openingTrainerPlay').hidden = !isPractice;
    byId('openingTrainerBoardPanel').hidden = false;
    byId('openingTrainerMovesPanel').hidden = false;
    byId('openingTrainerModeLabel').textContent = mode === 'study' ? 'ИЗУЧЕНИЕ ТЕОРИИ' :
      mode === 'practice' ? 'ПОВТОРЕНИЕ ДЕБЮТА' : mode === 'engine' ? 'ПАРТИЯ ПРОТИВ БОТА' : 'ВЫБЕРИ ДЕБЮТ';
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
    state.runId++;
    state.botThinking = false;
    state.opening = summary;
    state.catalogSide = summary.side === 'black' ? 'black' : 'white';
    byId('openingTrainerSelect').value = String(summary.id);
    describeOpening();
    resetGame();
    setMode('idle');
    refreshBoardClickToMove();
    renderCatalogList();
    document.querySelectorAll('[data-opening-category]').forEach(button => {
      const active = button.dataset.openingCategory === state.catalogSide;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const startButton = byId('openingStudyStartBtn');
    if (startButton) startButton.disabled = true;
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
      setMessage('Линия загружена. Выбери свою сторону и начни изучение.', 'success');
    } catch (error) {
      if (token !== state.loadToken) return;
      if (startButton) startButton.disabled = true;
      setMessage(`Не удалось загрузить этот дебют: ${error.message}`, 'error');
    }
  }

  function refreshBoardClickToMove() {
    if (!window.initBoardClickToMove) return;
    window.initBoardClickToMove(
      'openingTrainerBoard',
      () => state.game,
      handleUserDrop,
      {
        canSelect: piece => Boolean(
          ['practice', 'engine'].includes(state.mode) &&
          !state.botThinking &&
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
        if (!['practice', 'engine'].includes(state.mode) || state.botThinking || state.game.game_over()) return false;
        const turn = state.game.turn();
        if (turn !== userColor()) return false;
        if ((turn === 'w' && piece.startsWith('b')) || (turn === 'b' && piece.startsWith('w'))) return false;
        return true;
      },
      onDrop: handleUserDrop,
      onSnapEnd: () => updateBoard()
    });
    installRightClickArrows('openingTrainerBoard');
    refreshBoardClickToMove();
    const boardElement = byId('openingTrainerBoard');
    if (boardElement) boardElement.dataset.orientation = state.side;
  }

  function startStudy() {
    if (!state.opening || !Array.isArray(state.opening.moves) || !state.opening.moves.length) return;
    state.runId++;
    state.botThinking = false;
    resetGame();
    setMode('study');
    refreshBoardClickToMove();
    byId('openingStudyStep').textContent = 'Позиция перед первым ходом';
    byId('openingStudyPrev').disabled = true;
    byId('openingStudyNext').disabled = false;
    byId('openingStartPractice').hidden = true;
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
    setMessage(finished ? 'Теория просмотрена. Теперь попробуй повторить дебют без подсказок.' : 'Посмотри, как изменилось положение фигур, и переходи к следующему ходу.', 'success');
  }

  function studyPrev() {
    if (state.mode !== 'study' || state.moveIndex <= 0) return;
    state.game.undo();
    state.moveIndex--;
    updateBoard();
    updateProgress();
    byId('openingStudyStep').textContent = state.moveIndex ? `Возврат к ходу ${state.moveIndex}` : 'Позиция перед первым ходом';
    byId('openingStudyPrev').disabled = state.moveIndex === 0;
    byId('openingStudyNext').disabled = false;
    byId('openingStartPractice').hidden = true;
    setMessage('Можешь ещё раз просмотреть этот фрагмент теории.', 'info');
  }

  function startPractice() {
    if (!state.opening || !Array.isArray(state.opening.moves) || !state.opening.moves.length) return;
    state.runId++;
    const run = state.runId;
    state.botThinking = false;
    resetGame();
    setMode('practice');
    refreshBoardClickToMove();
    byId('openingPracticeStatus').textContent = 'Повторение: играй свою часть линии без подсказок.';
    setMessage('Повтори изученную последовательность. Если ошибёшься, позиция останется прежней.', 'info');
    updateProgress();
    maybePlayBookMove(run);
  }

  function maybePlayBookMove(run) {
    if (run !== state.runId || state.mode !== 'practice' || state.botThinking) return;
    if (state.moveIndex >= state.opening.moves.length) {
      enterEngineMode(run);
      return;
    }
    if (state.game.turn() === userColor()) {
      byId('openingPracticeStatus').textContent = 'Твой ход. Вспомни продолжение из теории.';
      return;
    }
    const san = state.opening.moves[state.moveIndex];
    state.botThinking = true;
    byId('openingPracticeStatus').textContent = 'Бот отвечает по изученной линии…';
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
      updateBoard();
      updateProgress();
      if (state.moveIndex >= state.opening.moves.length) enterEngineMode(run);
      else maybePlayBookMove(run);
    }, 360);
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
    byId('openingPracticeStatus').textContent = 'Stockfish выбирает ход…';
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
      if (run === state.runId) state.botThinking = false;
    }
  }

  function handleUserDrop(source, target) {
    if (!['practice', 'engine'].includes(state.mode) || state.botThinking || state.game.turn() !== userColor()) return 'snapback';
    const expected = state.mode === 'practice' ? lineMoveAt(state.moveIndex) : null;
    let move = null;
    try { move = state.game.move({from: source, to: target, promotion: 'q'}); } catch (_) {}
    if (!move) return 'snapback';

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
        if (state.moveIndex >= state.opening.moves.length) enterEngineMode(run);
        else maybePlayBookMove(run);
      }, 220);
    } else {
      updateProgress();
      byId('openingPracticeStatus').textContent = 'Ход сделан. Бот отвечает…';
      const run = state.runId;
      setTimeout(() => playEngineMove(run), 220);
    }
    return undefined;
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
    byId('openingStartPractice').addEventListener('click', startPractice);
    byId('openingPracticeRestart').addEventListener('click', startPractice);
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

      renderOpeningOptions();
      state.catalogSide = state.openings.some(item => item.side === 'white') ? 'white' : 'black';
      const first = state.openings.find(item => item.side === state.catalogSide) || state.openings[0];
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
