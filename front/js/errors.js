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
    discovered_check: { label: 'Вскрытый шах', filter: 'discovered_check' },
    mate: { label: 'Мат', filter: 'mate' },
    mate_in_2: { label: 'Мат в 2', filter: 'mate' }
  };
  const TACTICAL_MOTIFS = new Set(['fork', 'pin', 'discovered_check', 'mate', 'mate_in_2']);

  function hasTacticalMotif(item) {
    return Boolean(item && Array.isArray(item.bestMoveMotifs)
      && item.bestMoveMotifs.some(motif => TACTICAL_MOTIFS.has(motif)));
  }

  let sourceGames = [];
  let opportunities = [];
  let currentFilter = 'all';
  let activeIndex = -1;
  let activeGame = null;
  let errorBoard = null;
  let isAnalyzing = false;
  const SAVED_ANALYSIS_DRILLS_KEY = 'chessTrainer.errors.analysisDrills.v1';

  function readSavedAnalysisDrills() {
    try {
      const raw = localStorage.getItem(SAVED_ANALYSIS_DRILLS_KEY);
      const items = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) return [];
      const tacticalItems = items.filter(hasTacticalMotif);
      if (tacticalItems.length !== items.length) {
        localStorage.setItem(SAVED_ANALYSIS_DRILLS_KEY, JSON.stringify(tacticalItems));
      }
      return tacticalItems;
    } catch (error) {
      console.warn('Не удалось прочитать сохранённые тактические задания:', error);
      return [];
    }
  }

  function persistAnalysisDrill(item) {
    if (!item || item.source !== 'analysis') return;
    try {
      const items = readSavedAnalysisDrills();
      const index = items.findIndex(saved => saved && saved.id === item.id);
      if (index >= 0) items[index] = item;
      else items.push(item);
      localStorage.setItem(SAVED_ANALYSIS_DRILLS_KEY, JSON.stringify(items.slice(-120)));
    } catch (error) {
      console.warn('Не удалось сохранить прогресс тактического задания:', error);
    }
  }

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

  async function fetchLastFive() {
    const source = $('errorsSource').value;
    const username = $('errorsUsername').value.trim();
    if (!username) throw new Error('Введи свой ник на выбранной платформе.');

    if (source === 'chesscom') {
      const response = await fetch('/api/chesscom/' + encodeURIComponent(username) + '/games?limit=5');
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Не удалось загрузить Chess.com.');
      const games = (data.games || [])
        .filter(game => game && game.pgn)
        .sort((a, b) => Number(b.end_time || 0) - Number(a.end_time || 0))
        .slice(0, 5)
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
      'https://lichess.org/api/games/user/' + encodeURIComponent(username) + '?max=5&clocks=true',
      { headers: { Accept: 'application/x-chess-pgn' } }
    );
    if (!response.ok) {
      if (response.status === 404) throw new Error('Пользователь Lichess не найден.');
      if (response.status === 429) throw new Error('Lichess временно ограничил запросы. Попробуй позже.');
      throw new Error('Lichess вернул ошибку ' + response.status + '.');
    }
    const raw = await response.text();
    const games = splitPgnGames(raw).slice(0, 5).map((pgn, index) => buildGame(pgn, {
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
      if (status.status === 'completed') {
        return status.result;
      }
      if (status.status === 'failed') throw new Error(status.error || 'Stockfish не смог разобрать партию.');
    }
    throw new Error('Анализ партии превысил лимит ожидания. Попробуй повторить позже.');
  }

  function motifList(move) {
    const raw = Array.isArray(move.best_move_motifs) ? move.best_move_motifs : [];
    const motifs = raw.filter(key => TACTICAL_MOTIFS.has(key));
    if (!motifs.length && move.best_move_uci) {
      const alternatives = Array.isArray(move.acceptable_moves) ? move.acceptable_moves : [];
      const best = alternatives.find(item => item.uci === move.best_move_uci);
      if (best && Array.isArray(best.motifs)) best.motifs.forEach(key => {
        if (TACTICAL_MOTIFS.has(key) && !motifs.includes(key)) motifs.push(key);
      });
    }
    return [...new Set(motifs)];
  }

  function normalizeOpportunity(game, move, index, color) {
    const accepted = Array.isArray(move.acceptable_moves_uci) ? move.acceptable_moves_uci : [];
    if (accepted.includes(move.uci)) return null;
    if (!BAD_CLASSES.has(String(move.classification || ''))) return null;
    if (move.missed_tactic !== true) return null;
    if (!move.before_fen || !move.best_move_uci) return null;
    const bestMoveMotifs = motifList(move);
    if (!bestMoveMotifs.length) return null;

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
      bestMoveMotifs,
      acceptableMovesUci: accepted.length ? accepted : [move.best_move_uci],
      acceptableMovesSan: alternatives.map(item => item.san).filter(Boolean),
      solved: false,
      revealed: false
    };
  }

  function importAnalysisDrills(event) {
    const incoming = event && event.detail && Array.isArray(event.detail.opportunities)
      ? event.detail.opportunities
      : [];
    const saved = readSavedAnalysisDrills();
    const savedIds = new Set(saved.map(item => item && item.id).filter(Boolean));
    const added = incoming
      .filter(item => item && item.id && hasTacticalMotif(item) && !savedIds.has(item.id))
      .map(item => ({ ...item, source: 'analysis', solved: Boolean(item.solved), revealed: Boolean(item.revealed) }));
    const mergedSaved = [...saved, ...added].slice(-120);
    try {
      localStorage.setItem(SAVED_ANALYSIS_DRILLS_KEY, JSON.stringify(mergedSaved));
    } catch (error) {
      console.warn('Не удалось сохранить новые задания в браузере:', error);
    }
    const byId = new Map();
    opportunities.forEach(item => { if (item && item.id) byId.set(item.id, item); });
    mergedSaved.forEach(item => { if (item && item.id) byId.set(item.id, item); });
    opportunities = Array.from(byId.values()).filter(hasTacticalMotif);
    const severity = { blunder: 4, mistake: 3, miss: 2, inaccuracy: 1 };
    opportunities.sort((a, b) =>
      (severity[b.classification] - severity[a.classification]) || (Number(b.cpLoss || 0) - Number(a.cpLoss || 0))
    );
    activeIndex = added.length ? opportunities.findIndex(item => item.id === added[0].id) : -1;
    $('errorsMetricTactics').textContent = String(opportunities.length);
    $('errorsMetricBlunders').textContent = String(opportunities.filter(item => ['blunder', 'mistake'].includes(item.classification)).length);
    $('errorsSummary').textContent = added.length
      ? 'Из текущего анализа сохранено ' + added.length + ' позиций. Решай их здесь, а прогресс останется в этом браузере.'
      : 'Эти позиции уже были добавлены раньше. Они сохранены в твоём тактическом наборе.';
    renderOpportunities();
    setStatus(added.length
      ? 'Добавлено в тактическую тренировку: ' + added.length + ' позиций.'
      : 'Эти задания уже есть в сохранённом наборе.', 'success');
  }

  async function runLastFiveAnalysis() {
    if (isAnalyzing) return;
    isAnalyzing = true;
    $('errorsAnalyzeBtn').disabled = true;
    $('errorsProgress').hidden = false;
    $('errorsProgressFill').style.width = '0%';
    $('errorsProgressText').textContent = '0%';
    opportunities = readSavedAnalysisDrills();
    activeIndex = -1;
    renderOpportunities();

    try {
      setStatus('Загружаю последние пять партий…');
      const imported = await fetchLastFive();
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
        if (typeof window.saveMyEndgameFromPgn === 'function') {
          window.saveMyEndgameFromPgn(game.pgn, game.url || game.site || '', analysis, playerColor);
        }
        const ownMoves = (analysis.moves || []).filter(move => move.mover === playerColor);
        allOwnMoves += ownMoves.length;

        const gameFound = [];
        ownMoves.forEach((move, moveIndex) => {
          const opportunity = normalizeOpportunity(game, move, moveIndex, playerColor);
          if (opportunity) { opportunities.push(opportunity); gameFound.push(opportunity); }
        });
        if (gameFound.length) {
          window.dispatchEvent(new CustomEvent('chessTrainer:add-analysis-drills', { detail: { opportunities: gameFound } }));
          setProgress(((index + 1) / sourceGames.length) * 100,
            'Партия ' + (index + 1) + ' из ' + sourceGames.length + ' · задачи добавлены сразу');
        }
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
      return 'В этих партиях не найдено пропущенных вилок, связок, вскрытых шахов или матовых идей. Обычные неточности и взятия без тактического мотива здесь не показываются.';
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
      ' пропущенных тактических возможностей (' + blunders + ' зевков и ' + mistakes + ' ошибок с тактической идеей). ' +
      'Чаще всего Stockfish находил тему «' + top + '». Обычные неточности и взятия без комбинации в этот список не попадают.';
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
      discovered_check: 0,
      mate: 0
    };
    opportunities.forEach(item => {
      const filtersForItem = new Set(item.bestMoveMotifs
        .map(motif => MOTIFS[motif] && MOTIFS[motif].filter)
        .filter(Boolean));
      filtersForItem.forEach(filter => {
        if (Object.prototype.hasOwnProperty.call(counts, filter)) counts[filter] += 1;
      });
    });

    container.querySelectorAll('button[data-motif]').forEach(button => {
      const key = button.dataset.motif;
      button.classList.toggle('active', key === currentFilter);
      const labels = {
        all: 'Все тактики',
        fork: 'Вилки',
        pin: 'Связки',
        discovered_check: 'Вскрытые шахи',
        mate: 'Матовые идеи'
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
        ? '<div class="coach-empty">В этой теме тактических идей не найдено. Выбери «Все тактики» или проанализируй другие партии.</div>'
        : '<div class="coach-empty">После анализа здесь появятся пропущенные вилки, связки, вскрытые шахи и матовые идеи.</div>';
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
    if (window.initRightClickDrawing) window.initRightClickDrawing('errorsBoard');
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
      persistAnalysisDrill(item);
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
    persistAnalysisDrill(item);
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

  // Continuous puzzle training stream.
  let generatedTaskBoard = null, generatedTaskGame = null, generatedTask = null;
  let generatedTaskSolutionIndex = 0, generatedTaskBusy = false, generatedTaskSolved = false;
  let generatedTaskCount = 0, generatedTaskGoal = 0, generatedTaskStarted = false;
  const TASKS_SOLVED_KEY = 'chessTrainer.generatedTasksSolved.v1';

  function taskStatus(message, type) {
    const el = $('generatedTaskStatus');
    if (!el) return;
    el.textContent = message;
    el.style.color = type === 'success' ? '#18865b' : type === 'error' ? '#c74343' : '';
  }

  function taskBoardFen() {
    const payload = generatedTask;
    if (!payload || !payload.game || !payload.game.pgn || !payload.puzzle) throw new Error('Не удалось получить позицию задачи.');
    const replay = new Chess();
    if (!replay.load_pgn(payload.game.pgn)) throw new Error('Не получилось восстановить позицию из PGN.');
    const moves = replay.history({ verbose: true });
    const initialPly = Number(payload.puzzle.initialPly);
    if (!Number.isInteger(initialPly) || initialPly < 0 || initialPly > moves.length) throw new Error('Некорректная позиция задачи.');
    replay.reset();
    for (let i = 0; i < initialPly; i++) {
      const m = moves[i];
      if (!replay.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' })) throw new Error('Ошибка восстановления позиции.');
    }
    return replay.fen();
  }

  function updateGeneratedTaskCounter() {
    const counter = $('generatedTaskCounter');
    if (!counter) return;
    const solved = generatedTaskCount;
    const goalText = generatedTaskGoal ? ' из ' + generatedTaskGoal : '';
    const remainingText = generatedTaskGoal ? ' · осталось ' + Math.max(0, generatedTaskGoal - solved) : ' · бесконечный режим';
    counter.textContent = 'Решено: ' + solved + goalText + remainingText;
  }

  function finishGeneratedTask() {
    generatedTaskSolved = true;
    generatedTaskBusy = false;
    generatedTaskCount++;
    try {
      const solved = JSON.parse(localStorage.getItem(TASKS_SOLVED_KEY) || '[]');
      if (!solved.includes(generatedTask.puzzle.id)) {
        solved.push(generatedTask.puzzle.id);
        localStorage.setItem(TASKS_SOLVED_KEY, JSON.stringify(solved.slice(-5000)));
      }
    } catch (_) {}
    updateGeneratedTaskCounter();
    if (generatedTaskGoal && generatedTaskCount >= generatedTaskGoal) {
      taskStatus('Серия из ' + generatedTaskGoal + ' задач завершена! Можешь выбрать новую серию или продолжить бесконечно.', 'success');
      $('generatedTaskNext').textContent = 'Продолжить';
      return;
    }
    taskStatus('Верно! Следующая задача сейчас загрузится автоматически.', 'success');
    setTimeout(() => loadGeneratedTask(true), 650);
  }

  function taskMove(source, target) {
    if (!generatedTaskGame || generatedTaskBusy || generatedTaskSolved) return 'snapback';
    let move;
    try { move = generatedTaskGame.move({ from: source, to: target, promotion: 'q' }); } catch (_) { move = null; }
    if (!move) return 'snapback';
    const uci = move.from + move.to + (move.promotion || '');
    const solution = generatedTask.puzzle.solution || [];
    if (uci !== solution[generatedTaskSolutionIndex]) {
      generatedTaskGame.undo();
      taskStatus('Не тот ход. Подумай, как лучше решить позицию — иногда это защита, жертва или контрудар.', 'error');
      return 'snapback';
    }
    generatedTaskSolutionIndex++;
    generatedTaskBoard.position(generatedTaskGame.fen());
    generatedTaskBusy = true;
    if (generatedTaskSolutionIndex >= solution.length) {
      finishGeneratedTask();
      return;
    }
    const replyUci = solution[generatedTaskSolutionIndex];
    setTimeout(() => {
      if (!generatedTaskGame || generatedTaskSolved) return;
      const reply = generatedTaskGame.move({ from: replyUci.slice(0,2), to: replyUci.slice(2,4), promotion: replyUci[4] || 'q' });
      if (!reply) {
        generatedTaskBusy = false;
        taskStatus('Не удалось проиграть ответ из решения. Загружаю другую задачу…', 'error');
        setTimeout(() => loadGeneratedTask(true), 700);
        return;
      }
      generatedTaskSolutionIndex++;
      generatedTaskBoard.position(generatedTaskGame.fen());
      generatedTaskBusy = false;
      if (generatedTaskSolutionIndex >= solution.length) finishGeneratedTask();
      else taskStatus('Хорошо! Найди следующий ход комбинации.');
    }, 420);
  }

  async function loadGeneratedTask(automatic) {
    if (generatedTaskBusy) return;
    const button = $('generatedTaskNext');
    if (button) button.disabled = true;
    taskStatus('Загружаю следующую задачу…');
    try {
      const theme = $('generatedTaskTheme').value;
      const url = 'https://lichess.org/api/puzzle/next' + (theme ? '?angle=' + encodeURIComponent(theme) : '');
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 429 ? 'Слишком много запросов подряд, попробуй позже.' : 'Ошибка загрузки (' + response.status + ').');
      const data = await response.json();
      if (!data || !data.puzzle || !Array.isArray(data.puzzle.solution) || !data.puzzle.solution.length) throw new Error('Не удалось получить решение.');
      generatedTask = data;
      generatedTaskSolutionIndex = 0;
      generatedTaskBusy = false;
      generatedTaskSolved = false;
      generatedTaskGame = new Chess(taskBoardFen());
      const orientation = generatedTaskGame.turn() === 'w' ? 'white' : 'black';
      const config = {
        position: generatedTaskGame.fen(), draggable: true, pieceTheme: '/img/pieces/{piece}.png',
        onDragStart: (from, piece) => !generatedTaskBusy && !generatedTaskSolved && generatedTaskGame && piece[0] === generatedTaskGame.turn() && generatedTaskGame.moves({ square: from }).length > 0,
        onDrop: taskMove,
        onSnapEnd: () => generatedTaskBoard && generatedTaskGame && generatedTaskBoard.position(generatedTaskGame.fen())
      };
      if (!generatedTaskBoard) generatedTaskBoard = Chessboard('generatedTaskBoard', config);
      else generatedTaskBoard.position(generatedTaskGame.fen(), false);
      if (window.initRightClickDrawing) window.initRightClickDrawing('generatedTaskBoard');
      if (generatedTaskBoard.orientation) generatedTaskBoard.orientation(orientation);
      generatedTaskBoard.resize();
      if (window.initBoardClickToMove) window.initBoardClickToMove('generatedTaskBoard', () => generatedTaskGame, taskMove);
      $('generatedTaskRating').textContent = 'Рейтинг задачи: ' + (data.puzzle.rating || '—');
      taskStatus('Задача готова — ходи. Можно решать без остановки.', '');
      if (button) button.textContent = 'Следующая задача';
    } catch (error) {
      taskStatus('Не удалось загрузить: ' + error.message + ' · нажми «Следующая задача» или проверь интернет.', 'error');
    } finally {
      if (button) button.disabled = false;
      updateGeneratedTaskCounter();
    }
  }

  function generatedTaskHint() {
    if (!generatedTask || generatedTaskSolved) return;
    const uci = generatedTask.puzzle.solution[generatedTaskSolutionIndex];
    taskStatus('Подсказка: первый ход начинается с ' + uci.slice(0, 2) + '.', '');
  }

  function generatedTaskReveal() {
    if (!generatedTask || !generatedTaskGame || generatedTaskSolved) return;
    const replay = new Chess(generatedTaskGame.fen());
    const moves = generatedTask.puzzle.solution || [];
    for (let i = generatedTaskSolutionIndex; i < moves.length; i++) {
      const u = moves[i];
      replay.move({ from: u.slice(0,2), to: u.slice(2,4), promotion: u[4] || 'q' });
    }
    generatedTaskBoard.position(replay.fen());
    generatedTaskSolved = true;
    taskStatus('Показано решение — задача не засчитана. Нажми «Следующая задача».', '');
  }

  function startGeneratedTaskSeries() {
    const selected = $('generatedTaskAmount').value;
    generatedTaskGoal = selected === 'endless' ? 0 : Number(selected);
    generatedTaskCount = 0;
    generatedTaskStarted = true;
    $('generatedTaskNext').textContent = 'Следующая задача';
    updateGeneratedTaskCounter();
    loadGeneratedTask(false);
  }

  function initGeneratedTasks() {
    if (!$('tab-errors') || $('generatedTaskBoard')) return;
    const panel = document.createElement('section');
    panel.className = 'coach-panel generated-tasks-panel';
    panel.style.cssText = 'margin-bottom:18px;padding:18px;';
    panel.innerHTML = '<div class="coach-panel-heading"><div><div class="coach-label">ТРЕНИРОВКА ТАКТИКИ</div><h3>Задачи</h3><p>Открыл раздел — первая задача уже готова. Решай, и следующая появится автоматически.</p></div></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0"><label for="generatedTaskAmount">Серия:</label><select id="generatedTaskAmount" style="padding:10px;border-radius:10px"><option value="endless" selected>Бесконечно</option><option value="50">50 задач</option><option value="100">100 задач</option></select>' +
      '<select id="generatedTaskTheme" style="padding:10px;border-radius:10px"><option value="">Все темы</option><option value="fork">Вилки</option><option value="pin">Связки</option><option value="mateIn1">Мат в 1</option><option value="mateIn2">Мат в 2</option><option value="mateIn3">Мат в 3</option><option value="sacrifice">Жертвы</option><option value="doubleAttack">Двойная атака</option><option value="discoveredAttack">Вскрытая атака</option></select>' +
      '<button type="button" class="action-btn coach-primary-btn" id="generatedTaskNext">Начать задачи</button><button type="button" class="action-btn" id="generatedTaskHint">Подсказка</button><button type="button" class="action-btn" id="generatedTaskReveal">Показать решение</button></div>' +
      '<div id="generatedTaskRating" style="font-weight:600;margin-bottom:6px">Задача появится сразу</div><div id="generatedTaskCounter" style="opacity:.7;font-size:.9em;margin-bottom:8px"></div>' +
      '<div class="coach-board-shell" style="max-width:620px;margin:auto"><div id="generatedTaskBoard" style="width:100%;"></div></div>' +
      '<div id="generatedTaskStatus" class="coach-drill-feedback" role="status" style="margin-top:10px">Подготавливаю первую задачу…</div>';
    const importPanel = document.querySelector('#tab-errors .errors-import-panel');
    if (importPanel) importPanel.parentNode.insertBefore(panel, importPanel);
    $('generatedTaskNext').addEventListener('click', () => {
      const selected = $('generatedTaskAmount').value;
      const selectedGoal = selected === 'endless' ? 0 : Number(selected);
      if (!generatedTaskStarted || selectedGoal !== generatedTaskGoal || (generatedTaskGoal && generatedTaskCount >= generatedTaskGoal)) startGeneratedTaskSeries();
      else loadGeneratedTask(false);
    });
    $('generatedTaskHint').addEventListener('click', generatedTaskHint);
    $('generatedTaskReveal').addEventListener('click', generatedTaskReveal);
    // Load the first puzzle immediately when the user opens the Tasks tab.
    document.querySelector('.tab-btn[data-tab="errors"]')?.addEventListener('click', () => {
      if (!generatedTaskStarted) startGeneratedTaskSeries();
    });
  }

  function init() {
    if (!$('tab-errors') || $('tab-errors').dataset.ready === '1') return;
    $('tab-errors').dataset.ready = '1';

    initGeneratedTasks();
    $('errorsAnalyzeBtn').addEventListener('click', runLastFiveAnalysis);
    window.addEventListener('chessTrainer:add-analysis-drills', importAnalysisDrills);
    const savedDrills = readSavedAnalysisDrills();
    if (savedDrills.length) {
      opportunities = savedDrills;
      $('errorsMetricTactics').textContent = String(savedDrills.length);
      $('errorsMetricBlunders').textContent = String(savedDrills.filter(item => ['blunder', 'mistake'].includes(item.classification)).length);
      $('errorsSummary').textContent = 'Сохранено тактических позиций: ' + savedDrills.length
        + '. Решённые задания отмечаются, прогресс хранится в этом браузере.';
      setStatus('Загружены сохранённые задания из предыдущих разборов.', 'success');
      renderOpportunities();
    }
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