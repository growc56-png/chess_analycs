(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const BAD_CLASSES = new Set(['blunder', 'mistake', 'inaccuracy', 'miss']);
  const CLASS_LABELS = {
    blunder: 'Зевок',
    mistake: 'Ошибка',
    inaccuracy: 'Неточность',
    miss: 'Промах'
  };
  const MOTIFS = {
    fork: { label: 'Вилка', filter: 'fork' },
    pin: { label: 'Связка', filter: 'pin' },
    check: { label: 'Шах', filter: 'check' },
    mate: { label: 'Мат', filter: 'mate' },
    mate_in_2: { label: 'Мат в 2', filter: 'mate' },
    discovered_check: { label: 'Вскрытый шах', filter: 'check' },
    capture: { label: 'Взятие', filter: 'capture' }
  };

  let sourceGames = [];
  let opportunities = [];
  let currentFilter = 'all';
  let activeIndex = -1;
  let activeGame = null;
  let errorBoard = null;
  let isAnalyzing = false;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setStatus(message, type) {
    const el = $('errorsStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'coach-status' + (type ? ' ' + type : '');
  }

  function setProgress(percent, message) {
    $('errorsProgress').hidden = false;
    $('errorsProgressFill').style.width = Math.max(0, Math.min(100, percent)) + '%';
    $('errorsProgressText').textContent = Math.round(percent) + '%';
    if (message) setStatus(message);
  }

  function readPgnHeader(pgn, key, fallback) {
    const marker = '[' + key + ' "';
    const line = String(pgn || '').split(/\r?\n/).find(item => item.toLowerCase().startsWith(marker.toLowerCase()));
    if (!line) return fallback || '';
    const match = line.match(/^\[[^\s]+\s+"((?:\\.|[^"])*)"/);
    return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : (fallback || '');
  }

  function splitPgnGames(raw) {
    const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
    if (!text) return [];
    return text.split(/(?=^\[Event\s+")/m).map(item => item.trim()).filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function buildGame(pgn, extra) {
    const white = extra && extra.white ? extra.white : readPgnHeader(pgn, 'White', 'Белые');
    const black = extra && extra.black ? extra.black : readPgnHeader(pgn, 'Black', 'Чёрные');
    return Object.assign({
      pgn,
      white,
      black,
      date: readPgnHeader(pgn, 'Date', 'Дата неизвестна'),
      result: readPgnHeader(pgn, 'Result', '*'),
      event: readPgnHeader(pgn, 'Event', 'Партия'),
      endTime: 0
    }, extra || {});
  }

  async function fetchLastTen() {
    const source = $('errorsSource').value;
    const username = $('errorsUsername').value.trim();
    if (!username) throw new Error('Введи свой ник на выбранной платформе.');

    if (source === 'chesscom') {
      const response = await fetch('/api/chesscom/' + encodeURIComponent(username) + '/games?limit=10');
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Не удалось загрузить Chess.com.');
      const games = (data.games || [])
        .filter(game => game && game.pgn)
        .sort((a, b) => Number(b.end_time || 0) - Number(a.end_time || 0))
        .slice(0, 10)
        .map((game, index) => buildGame(game.pgn, {
          id: 'chesscom-' + index,
          source: 'Chess.com',
          username: data.username || username,
          white: game.white && game.white.username ? game.white.username : readPgnHeader(game.pgn, 'White', 'Белые'),
          black: game.black && game.black.username ? game.black.username : readPgnHeader(game.pgn, 'Black', 'Чёрные'),
          endTime: Number(game.end_time || 0),
          date: game.end_time ? new Date(game.end_time * 1000).toLocaleDateString('ru-RU') : readPgnHeader(game.pgn, 'Date', 'Дата неизвестна'),
          event: game.time_class || readPgnHeader(game.pgn, 'Event', 'Партия')
        }));
      return { username: data.username || username, games };
    }

    const response = await fetch(
      'https://lichess.org/api/games/user/' + encodeURIComponent(username) + '?max=10&clocks=true',
      { headers: { Accept: 'application/x-chess-pgn' } }
    );
    if (!response.ok) {
      if (response.status === 404) throw new Error('Пользователь Lichess не найден.');
      if (response.status === 429) throw new Error('Lichess временно ограничил запросы. Попробуй позже.');
      throw new Error('Lichess вернул ошибку ' + response.status + '.');
    }
    const raw = await response.text();
    const games = splitPgnGames(raw).slice(0, 10).map((pgn, index) => buildGame(pgn, {
      id: 'lichess-' + index,
      source: 'Lichess',
      username,
      date: readPgnHeader(pgn, 'Date', 'Дата неизвестна')
    }));
    return { username, games };
  }

  function getPlayerColor(game, selectedSide) {
    if (selectedSide === 'white') return 'white';
    if (selectedSide === 'black') return 'black';
    const username = String(game.username || '').trim().toLowerCase();
    const white = String(game.white || '').trim().toLowerCase();
    const black = String(game.black || '').trim().toLowerCase();
    if (username && white === username) return 'white';
    if (username && black === username) return 'black';
    // Chess.com sometimes uses a canonical username with different capitalization.
    if (username && white.includes(username)) return 'white';
    if (username && black.includes(username)) return 'black';
    return null;
  }

  async function analyzeGame(pgn, gameIndex, gameTotal) {
    const startResponse = await fetch('/api/analyze/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pgn })
    });
    const startData = await startResponse.json();
    if (!startResponse.ok) throw new Error(startData.detail || 'Не удалось запустить Stockfish.');
    if (!startData.job_id) throw new Error('Сервер не вернул ID задачи анализа.');

    for (let attempt = 0; attempt < 3600; attempt++) {
      await sleep(1000);
      const response = await fetch('/api/analyze/status/' + encodeURIComponent(startData.job_id));
      const status = await response.json();
      if (!response.ok) throw new Error(status.detail || 'Не удалось получить статус анализа.');
      const percent = Number(status.percent || 0);
      const overall = ((gameIndex + percent / 100) / gameTotal) * 100;
      setProgress(overall, 'Stockfish: партия ' + (gameIndex + 1) + ' из ' + gameTotal + ' · ' + Math.round(percent) + '%');
      if (status.status === 'completed') return status.result;
      if (status.status === 'failed') throw new Error(status.error || 'Stockfish не смог разобрать партию.');
    }
    throw new Error('Анализ партии превысил лимит ожидания. Попробуй повторить позже.');
  }

  function motifList(move) {
    const raw = Array.isArray(move.best_move_motifs) ? move.best_move_motifs : [];
    const motifs = raw.filter(key => MOTIFS[key]);
    if (!motifs.length && move.best_move_uci) {
      const alternatives = Array.isArray(move.acceptable_moves) ? move.acceptable_moves : [];
      const best = alternatives.find(item => item.uci === move.best_move_uci);
      if (best && Array.isArray(best.motifs)) best.motifs.forEach(key => {
        if (MOTIFS[key] && !motifs.includes(key)) motifs.push(key);
      });
    }
    return motifs.length ? motifs : ['improvement'];
  }

  function normalizeOpportunity(game, move, index, color) {
    const accepted = Array.isArray(move.acceptable_moves_uci) ? move.acceptable_moves_uci : [];
    if (accepted.includes(move.uci)) return null;
    if (!BAD_CLASSES.has(String(move.classification || ''))) return null;
    if (!move.before_fen || !move.best_move_uci) return null;

    const alternatives = Array.isArray(move.acceptable_moves) ? move.acceptable_moves : [];
    const bestCandidate = alternatives.find(item => item.uci === move.best_move_uci);
    const bestLine = bestCandidate && Array.isArray(bestCandidate.line_san)
      ? bestCandidate.line_san
      : (Array.isArray(move.best_line_san) ? move.best_line_san : []);
    return {
      id: game.id + ':' + index,
      gameLabel: game.white + ' — ' + game.black,
      date: game.date,
      event: game.event,
      color,
      moveNum: move.move_num,
      playedSan: move.san,
      classification: move.classification,
      cpLoss: Number(move.cp_loss || 0),
      beforeFen: move.before_fen,
      bestMoveUci: move.best_move_uci,
      bestMoveSan: move.best_move_san || move.best_move_uci,
      bestLineSan: bestLine.slice(0, 4),
      bestMoveMotifs: motifList(move),
      acceptableMovesUci: accepted.length ? accepted : [move.best_move_uci],
      acceptableMovesSan: alternatives.map(item => item.san).filter(Boolean),
      solved: false,
      revealed: false
    };
  }

  async function runLastTenAnalysis() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    $('errorsAnalyzeBtn').disabled = true;
    $('errorsProgress').hidden = false;
    $('errorsProgressFill').style.width = '0%';
    $('errorsProgressText').textContent = '0%';
    opportunities = [];
    activeIndex = -1;
    renderOpportunities();

    try {
      setStatus('Загружаю последние десять партий…');
      const imported = await fetchLastTen();
      sourceGames = imported.games;
      if (!sourceGames.length) throw new Error('Не найдено десяти доступных партий. Убедись, что профиль публичный.');
      const selectedSide = $('errorsColor').value;
      const completed = [];
      let allOwnMoves = 0;

      for (let index = 0; index < sourceGames.length; index++) {
        const game = sourceGames[index];
        setProgress((index / sourceGames.length) * 100, 'Подготовка партии ' + (index + 1) + ' из ' + sourceGames.length + '…');
        const analysis = await analyzeGame(game.pgn, index, sourceGames.length);
        const playerColor = getPlayerColor(game, selectedSide);
        if (!playerColor) {
          throw new Error('Не удалось автоматически определить твой цвет в партии ' + (index + 1) + '. Выбери «Белыми» или «Чёрными» и запусти анализ снова.');
        }
        const ownMoves = (analysis.moves || []).filter(move => move.mover === playerColor);
        allOwnMoves += ownMoves.length;

        ownMoves.forEach((move, moveIndex) => {
          const opportunity = normalizeOpportunity(game, move, moveIndex, playerColor);
          if (opportunity) opportunities.push(opportunity);
        });
        completed.push({ game, analysis, playerColor });
      }

      const severity = { blunder: 4, mistake: 3, miss: 2, inaccuracy: 1 };
      opportunities.sort((a, b) =>
        (severity[b.classification] - severity[a.classification]) || (b.cpLoss - a.cpLoss)
      );

      $('errorsMetricGames').textContent = String(completed.length);
      $('errorsMetricMoves').textContent = String(allOwnMoves);
      $('errorsMetricBlunders').textContent = String(opportunities.filter(item => ['blunder', 'mistake'].includes(item.classification)).length);
      $('errorsMetricTactics').textContent = String(opportunities.filter(item => item.bestMoveMotifs.some(motif => motif !== 'improvement')).length);
      $('errorsSummary').textContent = buildSummary(completed, allOwnMoves);
      renderOpportunities();
      setProgress(100, 'Готово: разобрано ' + completed.length + ' партий. Найдено моментов для улучшения: ' + opportunities.length + '.');
      setStatus('Анализ завершён. Выбери тактическую тему или открой любой найденный момент.', 'success');
    } catch (error) {
      setStatus('Не удалось завершить анализ: ' + error.message, 'error');
      setProgress(0, 'Анализ остановлен.');
    } finally {
      isAnalyzing = false;
      $('errorsAnalyzeBtn').disabled = false;
    }
  }

  function buildSummary(completed, ownMoves) {
    if (!opportunities.length) {
      return 'В разобранных партиях не найдено ходов, которые Stockfish классифицировал как серьёзные ошибки. Это хороший знак. Продолжай играть и возвращайся к анализу после новых партий.';
    }
    const counts = {};
    opportunities.forEach(item => {
      item.bestMoveMotifs.forEach(motif => {
        counts[motif] = (counts[motif] || 0) + 1;
      });
    });
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = ordered[0] ? (MOTIFS[ordered[0][0]] || {}).label : 'тактические возможности';
    const blunders = opportunities.filter(item => item.classification === 'blunder').length;
    const mistakes = opportunities.filter(item => item.classification === 'mistake').length;
    return 'В ' + completed.length + ' партиях проверено ' + ownMoves + ' твоих ходов. Найдено ' + opportunities.length +
      ' моментов для улучшения: ' + blunders + ' зевков и ' + mistakes + ' ошибок. Чаще всего Stockfish находил тему «' +
      top + '». В списке справа выбери позицию и попробуй найти лучший ход самостоятельно.';
  }

  function filteredOpportunities() {
    if (currentFilter === 'all') return opportunities;
    return opportunities.filter(item => item.bestMoveMotifs.some(motif => {
      const info = MOTIFS[motif];
      return info && info.filter === currentFilter;
    }));
  }

  function renderFilters() {
    const container = $('errorsFilters');
    const counts = {
      all: opportunities.length,
      fork: 0,
      pin: 0,
      check: 0,
      mate: 0,
      capture: 0
    };
    opportunities.forEach(item => item.bestMoveMotifs.forEach(motif => {
      const info = MOTIFS[motif];
      if (info && Object.prototype.hasOwnProperty.call(counts, info.filter)) counts[info.filter] += 1;
    }));

    container.querySelectorAll('button[data-motif]').forEach(button => {
      const key = button.dataset.motif;
      button.classList.toggle('active', key === currentFilter);
      const labels = {
        all: 'Все',
        fork: 'Вилки',
        pin: 'Связки',
        check: 'Шахи',
        mate: 'Маты',
        capture: 'Взятия'
      };
      const baseText = labels[key] || 'Тема';
      const count = counts[key] || 0;
      button.textContent = baseText + (key === 'all' || count ? ' · ' + count : '');
    });
  }

  function renderOpportunities() {
    renderFilters();
    const list = $('errorsOpportunitiesList');
    const shown = filteredOpportunities();
    $('errorsListCount').textContent = String(shown.length);
    if (!shown.length) {
      list.innerHTML = opportunities.length
        ? '<div class="coach-empty">В этой теме ошибок не найдено. Выбери «Все» или проанализируй другие партии.</div>'
        : '<div class="coach-empty">После анализа здесь появятся ошибки и лучшие продолжения Stockfish.</div>';
      return;
    }

    list.innerHTML = shown.map(item => {
      const globalIndex = opportunities.indexOf(item);
      const tags = item.bestMoveMotifs.map(motif => {
        const label = MOTIFS[motif] ? MOTIFS[motif].label : 'Тактическая идея';
        return '<span class="errors-motif-tag">' + escapeHtml(label) + '</span>';
      }).join('');
      return '<button type="button" class="errors-opportunity' + (globalIndex === activeIndex ? ' active' : '') +
        '" data-opportunity-index="' + globalIndex + '">' +
        '<span class="errors-opportunity-top"><strong>' + escapeHtml(item.date) + ' · ход ' + item.moveNum + '</strong><em>' + escapeHtml(CLASS_LABELS[item.classification] || 'Ошибка') + '</em></span>' +
        '<span class="errors-opportunity-game">' + escapeHtml(item.gameLabel) + '</span>' +
        '<span class="errors-opportunity-moves">Ты сыграл <b>' + escapeHtml(item.playedSan) + '</b> · лучший ход <b>' + escapeHtml(item.bestMoveSan) + '</b></span>' +
        '<span class="errors-opportunity-tags">' + (tags || '<span class="errors-motif-tag">Улучшение позиции</span>') + '</span>' +
        '</button>';
    }).join('');

    list.querySelectorAll('button[data-opportunity-index]').forEach(button => {
      button.addEventListener('click', () => openOpportunity(Number(button.dataset.opportunityIndex)));
    });

    if (activeIndex < 0 || !shown.some(item => opportunities.indexOf(item) === activeIndex)) {
      openOpportunity(opportunities.indexOf(shown[0]));
    } else {
      list.querySelectorAll('button[data-opportunity-index]').forEach(button => {
        button.classList.toggle('active', Number(button.dataset.opportunityIndex) === activeIndex);
      });
    }
  }

  function setDrillFeedback(message, type) {
    const el = $('errorsDrillFeedback');
    el.textContent = message;
    el.className = 'coach-drill-feedback' + (type ? ' ' + type : '');
  }

  function openOpportunity(index) {
    const item = opportunities[index];
    if (!item) return;
    activeIndex = index;
    activeGame = new Chess(item.beforeFen);
    const color = activeGame.turn();

    $('errorsDrillTitle').textContent = item.gameLabel + ' · ход ' + item.moveNum;
    $('errorsDrillSide').textContent = color === 'w' ? 'Ход белых' : 'Ход чёрных';
    $('errorsShowLine').disabled = false;
    $('errorsResetDrill').disabled = false;

    const config = {
      position: item.beforeFen,
      draggable: true,
      pieceTheme: '/img/pieces/{piece}.png',
      onDragStart: (source, piece) => {
        if (!activeGame || !piece || piece[0] !== activeGame.turn()) return false;
        return activeGame.moves({ square: source }).length > 0;
      },
      onDrop: (source, target) => handleOpportunityMove(source, target),
      onSnapEnd: () => {
        if (activeGame && errorBoard) errorBoard.position(activeGame.fen());
      }
    };

    if (!errorBoard) errorBoard = Chessboard('errorsBoard', config);
    else errorBoard.position(item.beforeFen, false);
    if (typeof errorBoard.orientation === 'function') errorBoard.orientation(color === 'w' ? 'white' : 'black');
    errorBoard.resize();

    if (window.initBoardClickToMove) {
      window.initBoardClickToMove('errorsBoard', () => activeGame, handleOpportunityMove);
    }
    setDrillFeedback(
      item.solved
        ? 'Этот момент уже решён. Можешь повторить комбинацию ещё раз.'
        : 'Найди лучший ход в позиции. Решение и короткое продолжение будут показаны после твоего ответа.',
      ''
    );
    $('errorsOpportunitiesList').querySelectorAll('button[data-opportunity-index]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.opportunityIndex) === index);
    });
  }

  function handleOpportunityMove(source, target) {
    const item = opportunities[activeIndex];
    if (!item || !activeGame || source === target) return 'snapback';
    let move = null;
    try {
      move = activeGame.move({ from: source, to: target, promotion: 'q' });
    } catch (error) {
      move = null;
    }
    if (!move) return 'snapback';

    const uci = move.from + move.to + (move.promotion || '');
    const acceptable = Array.isArray(item.acceptableMovesUci) && item.acceptableMovesUci.length
      ? item.acceptableMovesUci
      : [item.bestMoveUci];

    if (acceptable.includes(uci)) {
      item.solved = true;
      errorBoard.position(activeGame.fen());
      const line = item.bestLineSan.length ? ' Короткий вариант: ' + item.bestLineSan.slice(0, 4).join(' ') + '.' : '';
      setDrillFeedback('Верно! Лучший ход: ' + (item.bestMoveSan || uci) + '.' + line + ' Здесь можно было реализовать тактическую возможность.', 'success');
      renderOpportunities();
      return;
    }

    activeGame.undo();
    setDrillFeedback('Этот ход не входит в лучшие варианты Stockfish. Попробуй найти тактическую идею ещё раз.', 'error');
    return 'snapback';
  }

  function revealShortLine() {
    const item = opportunities[activeIndex];
    if (!item) return;
    activeGame = new Chess(item.beforeFen);
    const move = activeGame.move({
      from: item.bestMoveUci.slice(0, 2),
      to: item.bestMoveUci.slice(2, 4),
      promotion: item.bestMoveUci[4] || 'q'
    });
    if (!move) {
      setDrillFeedback('Не удалось восстановить лучший ход. Перезапусти анализ этой партии.', 'error');
      return;
    }
    errorBoard.position(activeGame.fen());
    item.revealed = true;
    const line = item.bestLineSan.length ? item.bestLineSan.slice(0, 4).join(' ') : item.bestMoveSan;
    setDrillFeedback('Ход Stockfish: ' + item.bestMoveSan + '. Короткое продолжение (до двух ходов): ' + line + '.', 'success');
  }

  function resetOpportunity() {
    const item = opportunities[activeIndex];
    if (!item) return;
    activeGame = new Chess(item.beforeFen);
    errorBoard.position(item.beforeFen, false);
    setDrillFeedback('Позиция сброшена. Найди лучший ход самостоятельно.', '');
  }

  function init() {
    if (!$('tab-errors') || $('tab-errors').dataset.ready === '1') return;
    $('tab-errors').dataset.ready = '1';

    $('errorsAnalyzeBtn').addEventListener('click', runLastTenAnalysis);
    $('errorsShowLine').addEventListener('click', revealShortLine);
    $('errorsResetDrill').addEventListener('click', resetOpportunity);
    $('errorsFilters').querySelectorAll('button[data-motif]').forEach(button => {
      button.addEventListener('click', () => {
        currentFilter = button.dataset.motif;
        renderOpportunities();
      });
    });
    document.querySelector('.tab-btn[data-tab="errors"]')?.addEventListener('click', () => {
      setTimeout(() => errorBoard && errorBoard.resize(), 100);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();