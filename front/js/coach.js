(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const COACH_REPORT_KEY = 'chessTrainer.personalCoach.report.v1';
  const OPENING_SRS_KEY = 'chessTrainer.openingSrs.v1';
  const COACH_HISTORY_KEY = 'chessTrainer.personalCoach.history.v1';
  const BAD_CLASSES = new Set(['blunder', 'mistake', 'inaccuracy', 'miss']);
  const CLASS_LABELS = { blunder: 'Зевок', mistake: 'Ошибка', inaccuracy: 'Неточность', miss: 'Промах' };
  const PHASE_LABELS = { opening: 'Дебют', middlegame: 'Миттельшпиль', endgame: 'Эндшпиль' };

  let importedGames = [];
  let report = null;
  let drillBoard = null;
  let drillGame = null;
  let activeDrillIndex = -1;
  let openingCatalog = [];
  let openingDeck = [];
  let activeOpeningCard = null;
  let openingGame = null;
  let openingBoard = null;

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn('Не удалось прочитать локальные данные тренера:', error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('Не удалось сохранить локальные данные тренера:', error);
      return false;
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setStatus(message, type) {
    const el = $('coachImportStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'coach-status' + (type ? ' ' + type : '');
  }

  function setProgress(percent, message) {
    const wrapper = $('coachProgress');
    if (!wrapper) return;
    wrapper.hidden = false;
    $('coachProgressFill').style.width = Math.max(0, Math.min(100, percent)) + '%';
    $('coachProgressText').textContent = Math.round(percent) + '%';
    if (message) setStatus(message);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function pgnHeader(pgn, key, fallback) {
    const marker = '[' + key + ' "';
    const line = String(pgn || '').split(/\r?\n/).find(item => item.toLowerCase().startsWith(marker.toLowerCase()));
    if (!line) return fallback || '';
    const match = line.match(/^\[[^\s]+\s+"((?:\\.|[^"])*)"/);
    return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : (fallback || '');
  }

  function splitPgnGames(raw) {
    const source = String(raw || '').replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
    if (!source) return [];
    const chunks = source.split(/(?=^\[Event\s+")/m).map(item => item.trim()).filter(Boolean);
    return chunks.length ? chunks : [source];
  }

  function buildImportedItem(pgn, index, extra) {
    const white = pgnHeader(pgn, 'White', 'Белые');
    const black = pgnHeader(pgn, 'Black', 'Чёрные');
    const item = Object.assign({
      id: 'coach-' + index + '-' + pgn.length + '-' + pgn.slice(0, 12),
      pgn,
      white,
      black,
      result: pgnHeader(pgn, 'Result', '*'),
      dateLabel: pgnHeader(pgn, 'Date', 'Дата неизвестна'),
      event: pgnHeader(pgn, 'Event', 'Партия'),
      source: 'PGN',
      suggestedColor: null,
      username: ''
    }, extra || {});
    item.label = 'Белые: ' + item.white + ' · Чёрные: ' + item.black;
    return item;
  }

  function renderImportedGames() {
    const list = $('coachGamesList');
    if (!list) return;
    list.replaceChildren();

    if (!importedGames.length) {
      $('coachAnalyzeBtn').disabled = true;
      updateSelectionCount();
      return;
    }

    const wanted = Number($('coachGameLimit').value || 3);
    importedGames.forEach((game, index) => {
      const row = document.createElement('label');
      row.className = 'coach-game-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = index < wanted;
      checkbox.dataset.gameIndex = String(index);
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = game.label;
      const meta = document.createElement('small');
      meta.textContent = game.dateLabel + ' · ' + game.result + ' · ' + game.event + ' · ' + game.source;
      copy.append(title, meta);
      row.append(checkbox, copy);
      checkbox.addEventListener('change', () => {
        const selectedCount = document.querySelectorAll('#coachGamesList input[type="checkbox"]:checked').length;
        if (checkbox.checked && selectedCount > 5) {
          checkbox.checked = false;
          setStatus('За один запуск можно выбрать не больше пяти партий.', 'error');
        }
        updateSelectionCount();
      });
      list.appendChild(row);
    });
    updateSelectionCount();
  }

  function updateSelectionCount() {
    const selected = document.querySelectorAll('#coachGamesList input[type="checkbox"]:checked').length;
    const counter = $('coachSelectionCount');
    const button = $('coachAnalyzeBtn');
    if (counter) counter.textContent = 'Выбрано: ' + selected;
    if (button) button.disabled = selected === 0;
  }

  function setImportedGames(games, username, sourceName) {
    importedGames = (games || []).filter(game => game && game.pgn).map((game, index) => {
      const white = game.white && game.white.username ? game.white.username : pgnHeader(game.pgn, 'White', 'Белые');
      const black = game.black && game.black.username ? game.black.username : pgnHeader(game.pgn, 'Black', 'Чёрные');
      const item = buildImportedItem(game.pgn, index, {
        source: sourceName,
        username: username || '',
        white,
        black,
        result: pgnHeader(game.pgn, 'Result', game.result || '*'),
        dateLabel: game.end_time ? new Date(game.end_time * 1000).toLocaleDateString('ru-RU') : pgnHeader(game.pgn, 'Date', 'Дата неизвестна'),
        event: game.time_class || pgnHeader(game.pgn, 'Event', sourceName),
        end_time: game.end_time || 0
      });
      item.label = 'vs ' + (item.white.toLowerCase() === String(username || '').toLowerCase() ? item.black : item.white);
      return item;
    });
    renderImportedGames();
  }

  async function loadChessComGames() {
    const username = $('coachChesscomUsername').value.trim();
    if (!username) {
      setStatus('Введи ник Chess.com.', 'error');
      return;
    }
    const limit = Number($('coachGameLimit').value || 3);
    $('coachLoadChesscom').disabled = true;
    setStatus('Загружаю публичные партии Chess.com…');
    try {
      const response = await fetch('/api/chesscom/' + encodeURIComponent(username) + '/games?limit=' + Math.max(1, Math.min(20, limit * 2)));
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Не удалось загрузить партии.');
      setImportedGames(data.games || [], data.username || username, 'Chess.com');
      setStatus(importedGames.length ? 'Загружено партий: ' + importedGames.length + '. Отметь партии и запусти анализ.' : 'У этого профиля не найдено публичных партий.', importedGames.length ? 'success' : '');
    } catch (error) {
      setStatus('Ошибка загрузки: ' + error.message, 'error');
    } finally {
      $('coachLoadChesscom').disabled = false;
    }
  }

  async function loadLichessGames() {
    const username = $('coachLichessUsername').value.trim();
    if (!username) {
      setStatus('Введи ник Lichess.', 'error');
      return;
    }
    $('coachLoadLichess').disabled = true;
    setStatus('Загружаю партии Lichess…');
    try {
      const response = await fetch('https://lichess.org/api/games/user/' + encodeURIComponent(username) + '?max=10', {
        headers: { Accept: 'application/x-chess-pgn' }
      });
      if (!response.ok) throw new Error(response.status === 404 ? 'Пользователь не найден.' : 'Lichess вернул ошибку ' + response.status + '.');
      const text = await response.text();
      const games = splitPgnGames(text).map(pgn => ({ pgn }));
      setImportedGames(games, username, 'Lichess');
      setStatus(importedGames.length ? 'Загружено партий: ' + importedGames.length + '.' : 'Публичные партии не найдены.', importedGames.length ? 'success' : '');
    } catch (error) {
      setStatus('Ошибка загрузки: ' + error.message, 'error');
    } finally {
      $('coachLoadLichess').disabled = false;
    }
  }

  function loadPgnText() {
    const raw = $('coachPgnText').value.trim();
    const parts = splitPgnGames(raw);
    if (!parts.length) {
      setStatus('Вставь текст PGN или выбери файл.', 'error');
      return;
    }
    importedGames = parts.map((pgn, index) => {
      const item = buildImportedItem(pgn, index, { source: 'PGN' });
      item.label = 'Белые: ' + item.white + ' · Чёрные: ' + item.black;
      return item;
    });
    renderImportedGames();
    setStatus('Найдено партий: ' + importedGames.length + '. Если ник не распознан, выбери свой цвет.', 'success');
  }

  function selectedGames() {
    return Array.from(document.querySelectorAll('#coachGamesList input[type="checkbox"]:checked'))
      .map(input => importedGames[Number(input.dataset.gameIndex)])
      .filter(Boolean)
      .slice(0, 5);
  }

  async function startAndWaitAnalysis(pgn, gameIndex, gameTotal) {
    const startResponse = await fetch('/api/analyze/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pgn })
    });
    const startData = await startResponse.json();
    if (!startResponse.ok) throw new Error(startData.detail || 'Не удалось запустить анализ.');
    if (!startData.job_id) throw new Error('Сервер не вернул ID задачи анализа.');

    for (let attempt = 0; attempt < 900; attempt++) {
      await delay(1000);
      const response = await fetch('/api/analyze/status/' + encodeURIComponent(startData.job_id));
      const status = await response.json();
      if (!response.ok) throw new Error(status.detail || 'Не удалось получить статус анализа.');
      const inner = Number(status.percent || 0);
      const overall = ((gameIndex + inner / 100) / gameTotal) * 100;
      setProgress(overall, 'Анализ партии ' + (gameIndex + 1) + ' из ' + gameTotal + ' · ' + Math.round(inner) + '%');
      if (status.status === 'completed') {
        if (!status.result || !Array.isArray(status.result.moves)) throw new Error('Сервер вернул неполный результат анализа.');
        return status.result;
      }
      if (status.status === 'failed') throw new Error(status.error || 'Анализ завершился с ошибкой.');
    }
    throw new Error('Анализ занял слишком много времени. Попробуй одну партию или более короткую партию.');
  }

  function determinePlayerColor(game, sideMode) {
    if (sideMode === 'white') return 'white';
    if (sideMode === 'black') return 'black';
    const username = String(game.username || '').trim().toLowerCase();
    const white = String(game.white || pgnHeader(game.pgn, 'White', '')).trim().toLowerCase();
    const black = String(game.black || pgnHeader(game.pgn, 'Black', '')).trim().toLowerCase();
    if (username && white === username) return 'white';
    if (username && black === username) return 'black';
    if (game.suggestedColor === 'w') return 'white';
    if (game.suggestedColor === 'b') return 'black';
    return 'white';
  }

  function moveAccuracy(move) {
    const raw = Number(move && move.cp_loss);
    if (Number.isFinite(raw)) return Math.max(0, Math.min(100, 100 - Math.max(0, raw) / 10));
    const fallback = { blunder: 45, miss: 30, mistake: 22, inaccuracy: 10, good: 4, excellent: 1.5, best: 0, forced: 0, book: 0 };
    const classification = move && move.classification;
    return 100 - (Object.prototype.hasOwnProperty.call(fallback, classification) ? fallback[classification] : 8);
  }

  function phaseForMove(move) {
    const number = Number(move.move_num || 1);
    if (number <= 10) return 'opening';
    if (number <= 30) return 'middlegame';
    return 'endgame';
  }

  function resultForReport(game, analysis, playerColor) {
    const ownMoves = (analysis.moves || []).filter(move => move.mover === playerColor);
    const counts = { blunder: 0, mistake: 0, inaccuracy: 0, miss: 0 };
    const phaseErrors = { opening: 0, middlegame: 0, endgame: 0 };
    let accuracyTotal = 0;
    const drills = [];

    ownMoves.forEach(move => {
      accuracyTotal += moveAccuracy(move);
      const classification = String(move.classification || '');
      if (BAD_CLASSES.has(classification)) {
        counts[classification] = (counts[classification] || 0) + 1;
        const phase = phaseForMove(move);
        phaseErrors[phase] += 1;
        if (move.before_fen && move.best_move_uci) {
          drills.push({
            id: game.id + ':' + move.uci,
            gameLabel: game.label,
            moveNum: move.move_num,
            playedSan: move.san,
            playedUci: move.uci,
            bestMoveUci: move.best_move_uci,
            bestMoveSan: move.best_move_san || move.best_move_uci,
            beforeFen: move.before_fen,
            phase,
            classification,
            cpLoss: Number(move.cp_loss || 0),
            solved: false
          });
        }
      }
    });

    return {
      id: game.id,
      label: game.label,
      dateLabel: game.dateLabel,
      source: game.source,
      playerColor,
      result: game.result,
      moveCount: ownMoves.length,
      accuracy: ownMoves.length ? accuracyTotal / ownMoves.length : null,
      counts,
      phaseErrors,
      drills
    };
  }

  async function analyzeSelectedGames() {
    const games = selectedGames();
    if (!games.length) return;
    $('coachAnalyzeBtn').disabled = true;
    $('coachLoadChesscom').disabled = true;
    $('coachLoadLichess').disabled = true;
    $('coachProgress').hidden = false;
    setProgress(0, 'Подготавливаю анализ…');

    const analyses = [];
    const sideMode = $('coachSide').value;
    try {
      for (let index = 0; index < games.length; index++) {
        const game = games[index];
        const analysis = await startAndWaitAnalysis(game.pgn, index, games.length);
        const playerColor = determinePlayerColor(game, sideMode);
        const playerReport = resultForReport(game, analysis, playerColor);
        if (!playerReport.moveCount) throw new Error('Не удалось определить твои ходы в партии ' + (index + 1) + '. Проверь выбранный цвет.');
        analyses.push(playerReport);
      }

      const summary = {
        games: analyses.length,
        moves: analyses.reduce((sum, item) => sum + item.moveCount, 0),
        accuracyTotal: analyses.reduce((sum, item) => sum + (item.accuracy || 0) * item.moveCount, 0),
        errors: { blunder: 0, mistake: 0, inaccuracy: 0, miss: 0 },
        phaseErrors: { opening: 0, middlegame: 0, endgame: 0 },
        drills: []
      };
      analyses.forEach(item => {
        Object.keys(summary.errors).forEach(key => summary.errors[key] += item.counts[key] || 0);
        Object.keys(summary.phaseErrors).forEach(key => summary.phaseErrors[key] += item.phaseErrors[key] || 0);
        summary.drills.push(...item.drills);
      });
      summary.accuracy = summary.moves ? summary.accuracyTotal / summary.moves : 0;
      summary.totalErrors = Object.values(summary.errors).reduce((a, b) => a + b, 0);
      summary.drills.sort((a, b) => {
        const severity = { blunder: 4, miss: 3, mistake: 2, inaccuracy: 1 };
        return (severity[b.classification] - severity[a.classification]) || (b.cpLoss - a.cpLoss);
      });
      summary.drills = summary.drills.slice(0, 24);
      const createdAt = new Date().toISOString();
      const history = readStorage(COACH_HISTORY_KEY, []);
      history.push({ date: createdAt, accuracy: summary.accuracy, errors: summary.totalErrors, games: summary.games });
      writeStorage(COACH_HISTORY_KEY, history.slice(-12));
      report = {
        createdAt,
        username: $('coachChesscomUsername').value.trim() || $('coachLichessUsername').value.trim() || '',
        games: analyses,
        summary
      };
      writeStorage(COACH_REPORT_KEY, report);
      renderReport();
      setProgress(100, 'Анализ завершён. Найдено ошибок: ' + summary.totalErrors + '.');
      setStatus('Готово! Отчёт и персональные упражнения обновлены.', 'success');
    } catch (error) {
      setStatus('Не удалось завершить анализ: ' + error.message, 'error');
      setProgress(0, 'Анализ остановлен.');
    } finally {
      $('coachAnalyzeBtn').disabled = selectedGames().length === 0;
      $('coachLoadChesscom').disabled = false;
      $('coachLoadLichess').disabled = false;
    }
  }


  function renderCoachHistory() {
    const history = readStorage(COACH_HISTORY_KEY, []);
    const container = $('coachHistoryTrend');
    if (!container) return;
    if (history.length < 2) {
      container.innerHTML = '<span>После следующего анализа здесь появится сравнение с предыдущим отчётом.</span>';
      return;
    }
    const values = history.slice(-8);
    const min = Math.min(40, ...values.map(item => Number(item.accuracy || 0)));
    const max = Math.max(100, ...values.map(item => Number(item.accuracy || 0)));
    const range = Math.max(1, max - min);
    container.innerHTML = values.map((item, index) => {
      const accuracy = Number(item.accuracy || 0);
      const height = 18 + ((accuracy - min) / range) * 62;
      const date = new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      return '<div class="coach-history-point" title="' + date + ': ' + accuracy.toFixed(1) + '% · ошибок: ' + item.errors + '">' +
        '<strong>' + accuracy.toFixed(0) + '%</strong><i style="height:' + height + 'px"></i><small>' + date + '</small></div>';
    }).join('');
    const previous = Number(values[values.length - 2].accuracy || 0);
    const current = Number(values[values.length - 1].accuracy || 0);
    const delta = current - previous;
    const phrase = delta > 0.05 ? 'Точность выросла на ' + delta.toFixed(1) + ' п.п. относительно прошлого отчёта.' :
      delta < -0.05 ? 'Точность снизилась на ' + Math.abs(delta).toFixed(1) + ' п.п. относительно прошлого отчёта.' :
      'Точность почти не изменилась относительно прошлого отчёта.';
    const note = document.createElement('span');
    note.className = 'coach-history-note';
    note.textContent = phrase;
    container.appendChild(note);
  }

  function renderReport() {
    if (!report || !report.summary) return;
    const s = report.summary;
    $('coachMetricGames').textContent = String(s.games);
    $('coachMetricAccuracy').textContent = s.accuracy.toFixed(1) + '%';
    $('coachMetricErrors').textContent = String(s.totalErrors);
    $('coachMetricMoves').textContent = String(s.moves);
    $('coachReportDate').textContent = 'Обновлено: ' + new Date(report.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

    const phases = Object.keys(s.phaseErrors).map(key => ({ key, label: PHASE_LABELS[key], count: s.phaseErrors[key] }));
    const maxPhase = Math.max(1, ...phases.map(item => item.count));
    const phaseRows = phases.map(item =>
      '<div class="coach-weakness-row"><span class="coach-weakness-label">' + item.label + '</span><span class="coach-weakness-track"><i style="width:' + (item.count / maxPhase * 100) + '%"></i></span><strong class="coach-weakness-value">' + item.count + '</strong></div>'
    );
    const classRows = Object.entries(s.errors).map(([key, count]) => ({
      label: CLASS_LABELS[key],
      count
    })).filter(item => item.count > 0);
    const maxClass = Math.max(1, ...classRows.map(item => item.count));
    $('coachWeaknessList').innerHTML = '<div class="coach-weakness-subtitle">По этапам партии</div>' + phaseRows.join('') +
      '<div class="coach-weakness-subtitle">По типу ошибки</div>' +
      (classRows.length ? classRows.map(item =>
        '<div class="coach-weakness-row"><span class="coach-weakness-label">' + item.label + '</span><span class="coach-weakness-track"><i style="width:' + (item.count / maxClass * 100) + '%"></i></span><strong class="coach-weakness-value">' + item.count + '</strong></div>'
      ).join('') : '<div class="coach-empty">Серьёзных ошибок в выборке не найдено.</div>');
    renderCoachHistory();

    const entries = Object.entries(s.errors).sort((a, b) => b[1] - a[1]);
    const topError = entries.find(item => item[1] > 0);
    const topPhase = phases.slice().sort((a, b) => b.count - a.count)[0];
    if (!s.totalErrors) {
      $('coachInsight').textContent = 'В этой выборке не найдено ходов с классификацией «неточность», «ошибка» или «зевок». Продолжай собирать партии, чтобы увидеть устойчивые закономерности.';
    } else {
      $('coachInsight').textContent = 'Чаще всего встречается: ' + CLASS_LABELS[topError[0]].toLowerCase() + ' (' + topError[1] + '). Больше всего проблем на этапе «' + topPhase.label.toLowerCase() + '» (' + topPhase.count + '). Начни с упражнений ниже и повтори анализ после новых партий.';
    }
    renderAdaptivePlan(s);
    renderDrillList();
  }

  function openTab(tabName) {
    const button = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
    if (button) button.click();
    if (tabName === 'coach') {
      setTimeout(() => {
        if (drillBoard) drillBoard.resize();
        if (openingBoard) openingBoard.resize();
      }, 80);
    }
  }

  function renderAdaptivePlan(summary) {
    const tasks = [];
    const phases = summary.phaseErrors || {};
    if (summary.errors.blunder + summary.errors.mistake >= 2) {
      tasks.push({
        title: 'Снизь количество грубых ошибок',
        detail: 'Перед каждым ходом проверяй шахи, взятия и прямые угрозы соперника. Затем переиграй позиции из списка собственных ошибок.',
        action: 'К ошибкам',
        target: 'drills'
      });
    }
    if (phases.opening > 0) {
      tasks.push({
        title: 'Закрепи первые 10 ходов',
        detail: 'Повтори дебютные решения в карточках с интервальным повторением, уделяя внимание порядку развития фигур.',
        action: 'Повторить дебюты',
        target: 'openings'
      });
    }
    if (phases.endgame > 0) {
      tasks.push({
        title: 'Потренируй окончания',
        detail: 'В твоих партиях ошибки встречались в эндшпиле. Отработай короля, пешки и базовые ладейные позиции.',
        action: 'Открыть эндшпили',
        target: 'endgames'
      });
    }
    if (tasks.length < 3) {
      tasks.push({
        title: 'Разбирай по одной партии после игры',
        detail: 'Сравнивай свои решения с выбором Stockfish и отмечай повторяющиеся ошибки.',
        action: 'Открыть анализ',
        target: 'analysis'
      });
    }
    if (tasks.length < 3) {
      tasks.push({
        title: 'Сохраняй регулярность',
        detail: 'Выполняй короткие занятия 4–5 дней в неделю. Важнее стабильность, чем длинные редкие сессии.',
        action: 'Открыть план',
        target: 'plan'
      });
    }
    $('coachPlanList').innerHTML = tasks.slice(0, 3).map((task, index) =>
      '<div class="coach-plan-item"><span class="coach-plan-number">' + (index + 1) + '</span><div class="coach-plan-copy"><strong>' + task.title + '</strong><small>' + task.detail + '</small></div><button type="button" data-target="' + task.target + '">' + task.action + '</button></div>'
    ).join('');
    $('coachPlanList').querySelectorAll('button[data-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.target;
        if (target === 'drills') $('coachDrillList').scrollIntoView({ behavior: 'smooth', block: 'center' });
        else if (target === 'openings') {
          $('coachOpeningStart').scrollIntoView({ behavior: 'smooth', block: 'center' });
          $('coachOpeningStart').click();
        } else openTab(target);
      });
    });
  }

  function currentDrills() {
    return report && report.summary ? report.summary.drills || [] : [];
  }

  function renderDrillList() {
    const list = $('coachDrillList');
    const drills = currentDrills();
    $('coachDrillCount').textContent = drills.length + ' упражнений';
    if (!drills.length) {
      list.innerHTML = '<div class="coach-empty">Не найдено позиций с доступным лучшим ходом Stockfish. Попробуй проанализировать другие партии.</div>';
      return;
    }
    list.innerHTML = drills.map((drill, index) =>
      '<button type="button" class="coach-drill-option" data-drill-index="' + index + '">' +
        '<span class="coach-drill-tag">' + CLASS_LABELS[drill.classification] + '</span>' +
        '<span><strong>' + escapeHtml(drill.gameLabel) + ' · ход ' + drill.moveNum + '</strong><small>' + PHASE_LABELS[drill.phase] + ' · сыграно ' + escapeHtml(drill.playedSan) + (drill.solved ? ' · решено ✓' : '') + '</small></span>' +
      '</button>'
    ).join('');
    list.querySelectorAll('button[data-drill-index]').forEach(button => {
      button.addEventListener('click', () => openDrill(Number(button.dataset.drillIndex)));
    });
    openDrill(activeDrillIndex < 0 || activeDrillIndex >= drills.length ? 0 : activeDrillIndex);
  }

  function setDrillFeedback(message, type) {
    const el = $('coachDrillFeedback');
    el.textContent = message;
    el.className = 'coach-drill-feedback' + (type ? ' ' + type : '');
  }

  function openDrill(index) {
    const drill = currentDrills()[index];
    if (!drill) return;
    activeDrillIndex = index;
    drillGame = new Chess(drill.beforeFen);
    const color = drillGame.turn();
    $('coachDrillTitle').textContent = drill.gameLabel + ' · ход ' + drill.moveNum;
    $('coachDrillSide').textContent = color === 'w' ? 'Ход белых' : 'Ход чёрных';
    $('coachDrillHint').disabled = false;
    $('coachDrillReset').disabled = false;
    document.querySelectorAll('.coach-drill-option').forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === index));

    const config = {
      position: drill.beforeFen,
      draggable: true,
      pieceTheme: '/img/pieces/{piece}.png',
      onDragStart: (source, piece) => {
        if (!drillGame || !piece || piece[0] !== drillGame.turn()) return false;
        return drillGame.moves({ square: source }).length > 0;
      },
      onDrop: (source, target) => handleDrillDrop(source, target),
      onSnapEnd: () => {
        if (drillGame && drillBoard) drillBoard.position(drillGame.fen());
      }
    };
    if (!drillBoard) drillBoard = Chessboard('coachDrillBoard', config);
    else drillBoard.position(drill.beforeFen, false);
    if (typeof drillBoard.orientation === 'function') drillBoard.orientation(color === 'w' ? 'white' : 'black');
    drillBoard.resize();
    setDrillFeedback(drill.solved ? 'Эта позиция уже решена. Можешь повторить её ещё раз.' : 'Найди лучший ход в позиции. Ищи решение так, будто это твоя партия.', '');
  }

  function handleDrillDrop(source, target) {
    const drill = currentDrills()[activeDrillIndex];
    if (!drill || !drillGame || source === target) return 'snapback';
    let move = null;
    try {
      move = drillGame.move({ from: source, to: target, promotion: 'q' });
    } catch (error) {
      move = null;
    }
    if (!move) return 'snapback';
    const uci = move.from + move.to + (move.promotion || '');
    if (uci === drill.bestMoveUci) {
      drill.solved = true;
      writeStorage(COACH_REPORT_KEY, report);
      drillBoard.position(drillGame.fen());
      setDrillFeedback('Верно! Лучший ход: ' + (drill.bestMoveSan || uci) + '. Это решение сохраняется в твоём отчёте.', 'success');
      renderDrillListSolvedState();
      return;
    }
    drillGame.undo();
    setDrillFeedback('Это легальный ход, но Stockfish выбрал другое продолжение. Попробуй ещё раз.', 'error');
    return 'snapback';
  }

  function renderDrillListSolvedState() {
    document.querySelectorAll('.coach-drill-option').forEach((button, index) => {
      const drill = currentDrills()[index];
      if (!drill) return;
      const small = button.querySelector('small');
      if (small && drill.solved && !small.textContent.includes('решено')) small.textContent += ' · решено ✓';
    });
  }

  function resetDrill() {
    const drill = currentDrills()[activeDrillIndex];
    if (!drill) return;
    drillGame = new Chess(drill.beforeFen);
    drillBoard.position(drill.beforeFen, false);
    setDrillFeedback('Позиция сброшена. Найди лучший ход.', '');
  }

  function revealDrill() {
    const drill = currentDrills()[activeDrillIndex];
    if (!drill || !drillGame) return;
    drillGame = new Chess(drill.beforeFen);
    const move = drillGame.move({
      from: drill.bestMoveUci.slice(0, 2),
      to: drill.bestMoveUci.slice(2, 4),
      promotion: drill.bestMoveUci[4] || 'q'
    });
    if (!move) {
      setDrillFeedback('Не удалось показать ход из сохранённой позиции. Запусти новый анализ этой партии.', 'error');
      return;
    }
    drillBoard.position(drillGame.fen());
    setDrillFeedback('Лучший ход Stockfish: ' + (drill.bestMoveSan || drill.bestMoveUci) + '. Попробуй запомнить идею.', 'success');
  }

  function getOpeningSchedule() {
    return readStorage(OPENING_SRS_KEY, {});
  }

  function cardsForSide(side) {
    const color = side === 'black' ? 'b' : 'w';
    const cards = [];
    openingCatalog.forEach(opening => {
      if (opening.side && opening.side !== side) return;
      const line = Array.isArray(opening.moves) ? opening.moves : [];
      const game = new Chess();
      for (let index = 0; index < line.length; index++) {
        if (game.game_over()) break;
        const currentColor = game.turn();
        const beforeFen = game.fen();
        let move = null;
        try {
          move = game.move(line[index]);
        } catch (error) {
          move = null;
        }
        if (!move) break;
        if (currentColor === color) {
          cards.push({
            id: String(opening.id) + ':' + index,
            title: (opening.family ? opening.family + ' · ' : '') + (opening.name || opening.title || 'Дебют'),
            beforeFen,
            expectedUci: move.from + move.to + (move.promotion || ''),
            expectedSan: move.san,
            side: color,
            ply: index + 1
          });
        }
      }
    });
    return cards;
  }

  function updateOpeningDueCount() {
    const cards = cardsForSide($('coachOpeningSide').value);
    const schedule = getOpeningSchedule();
    const due = cards.filter(card => !schedule[card.id] || Number(schedule[card.id].due || 0) <= Date.now()).length;
    $('coachOpeningDue').textContent = String(due);
    return { cards, due };
  }

  function startOpeningReview() {
    openingDeck = cardsForSide($('coachOpeningSide').value);
    const schedule = getOpeningSchedule();
    const dueCards = openingDeck.filter(card => !schedule[card.id] || Number(schedule[card.id].due || 0) <= Date.now());
    if (!openingDeck.length) {
      $('coachOpeningEmpty').hidden = false;
      $('coachOpeningEmpty').textContent = 'Для этой стороны пока нет доступных карточек в каталоге дебютов.';
      $('coachOpeningSession').hidden = true;
      updateOpeningDueCount();
      return;
    }
    if (!dueCards.length) {
      const next = openingDeck.map(card => schedule[card.id] ? Number(schedule[card.id].due || 0) : 0).sort((a, b) => a - b)[0];
      $('coachOpeningEmpty').hidden = false;
      $('coachOpeningEmpty').textContent = 'Все карточки повторены. Следующая станет доступна ' + new Date(next).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) + '.';
      $('coachOpeningSession').hidden = true;
      updateOpeningDueCount();
      return;
    }
    dueCards.sort((a, b) => {
      const aDue = schedule[a.id] ? Number(schedule[a.id].due || 0) : 0;
      const bDue = schedule[b.id] ? Number(schedule[b.id].due || 0) : 0;
      return aDue - bDue;
    });
    $('coachOpeningEmpty').hidden = true;
    $('coachOpeningSession').hidden = false;
    showOpeningCard(dueCards[0]);
  }

  function showOpeningCard(card) {
    activeOpeningCard = card;
    openingGame = new Chess(card.beforeFen);
    $('coachOpeningTitle').textContent = card.title;
    $('coachOpeningMeta').textContent = 'Ход ' + card.ply + ' · играешь ' + (card.side === 'w' ? 'белыми' : 'чёрными') + ' · выбери правильное продолжение';
    $('coachOpeningFeedback').textContent = 'Сделай ход на доске или введи SAN в поле ниже.';
    $('coachOpeningFeedback').className = 'coach-opening-feedback';
    $('coachOpeningGrades').hidden = true;
    $('coachOpeningMoveInput').value = '';

    const config = {
      position: card.beforeFen,
      draggable: true,
      pieceTheme: '/img/pieces/{piece}.png',
      onDragStart: (source, piece) => {
        if (!openingGame || !piece || piece[0] !== openingGame.turn()) return false;
        return openingGame.moves({ square: source }).length > 0;
      },
      onDrop: (source, target) => {
        if (!openingGame || !activeOpeningCard) return 'snapback';
        let move = null;
        try {
          move = openingGame.move({ from: source, to: target, promotion: 'q' });
        } catch (error) {
          move = null;
        }
        if (!move) return 'snapback';
        const uci = move.from + move.to + (move.promotion || '');
        if (uci === activeOpeningCard.expectedUci) {
          openingBoard.position(openingGame.fen());
          revealOpeningGrade('Верно! ' + activeOpeningCard.expectedSan + ' — правильный ход.', true);
          return;
        }
        openingGame.undo();
        $('coachOpeningFeedback').textContent = 'Не тот ход. Попробуй ещё раз или открой ответ.';
        $('coachOpeningFeedback').className = 'coach-opening-feedback';
        return 'snapback';
      },
      onSnapEnd: () => {
        if (openingGame && openingBoard) openingBoard.position(openingGame.fen());
      }
    };
    if (!openingBoard) openingBoard = Chessboard('coachOpeningBoard', config);
    else openingBoard.position(card.beforeFen, false);
    if (typeof openingBoard.orientation === 'function') openingBoard.orientation(card.side === 'w' ? 'white' : 'black');
    openingBoard.resize();
  }

  function tryOpeningSan() {
    if (!activeOpeningCard || !openingGame) return;
    const value = $('coachOpeningMoveInput').value.trim();
    if (!value) {
      $('coachOpeningFeedback').textContent = 'Введи ход, например Nf3 или e4.';
      return;
    }
    let move = null;
    try {
      move = openingGame.move({ san: value });
    } catch (error) {
      move = null;
    }
    if (!move) {
      $('coachOpeningFeedback').textContent = 'Не удалось распознать ход. Используй SAN: e4, Nf3, O-O и т. д.';
      return;
    }
    const uci = move.from + move.to + (move.promotion || '');
    if (uci === activeOpeningCard.expectedUci) {
      openingBoard.position(openingGame.fen());
      revealOpeningGrade('Верно! ' + activeOpeningCard.expectedSan + ' — правильный ход.', true);
    } else {
      openingGame.undo();
      $('coachOpeningFeedback').textContent = 'Это не тот ход в данной линии. Попробуй ещё раз.';
    }
  }

  function revealOpeningGrade(message, correct) {
    $('coachOpeningFeedback').textContent = message;
    $('coachOpeningFeedback').className = 'coach-opening-feedback' + (correct ? ' success' : '');
    $('coachOpeningGrades').hidden = false;
  }

  function revealOpeningAnswer() {
    if (!activeOpeningCard || !openingGame) return;
    openingGame = new Chess(activeOpeningCard.beforeFen);
    const move = openingGame.move({
      from: activeOpeningCard.expectedUci.slice(0, 2),
      to: activeOpeningCard.expectedUci.slice(2, 4),
      promotion: activeOpeningCard.expectedUci[4] || 'q'
    });
    if (move) openingBoard.position(openingGame.fen());
    revealOpeningGrade('Правильный ход: ' + activeOpeningCard.expectedSan + '. Отметь, насколько хорошо его помнил.', false);
  }

  function rateOpeningCard(grade) {
    if (!activeOpeningCard) return;
    const schedule = getOpeningSchedule();
    const previous = schedule[activeOpeningCard.id] || { interval: 0, reps: 0 };
    let intervalDays = Number(previous.interval || 0);
    const reps = Number(previous.reps || 0) + 1;
    let due;

    if (grade === 'again') {
      intervalDays = 10 / (24 * 60);
      due = Date.now() + 10 * 60 * 1000;
    } else if (grade === 'hard') {
      intervalDays = Math.max(1, intervalDays * 1.2 || 1);
      due = Date.now() + intervalDays * 86400000;
    } else {
      intervalDays = reps <= 1 ? 1 : Math.max(1, intervalDays * 2.5);
      due = Date.now() + intervalDays * 86400000;
    }

    schedule[activeOpeningCard.id] = {
      interval: intervalDays,
      reps,
      due,
      lastGrade: grade,
      updatedAt: Date.now()
    };
    writeStorage(OPENING_SRS_KEY, schedule);
    activeOpeningCard = null;
    updateOpeningDueCount();
    startOpeningReview();
  }

  async function loadOpeningCatalog() {
    try {
      const response = await fetch('/api/openings');
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Не удалось загрузить дебюты.');
      openingCatalog = (data.openings || []).filter(opening => Array.isArray(opening.moves) && opening.moves.length);
      updateOpeningDueCount();
    } catch (error) {
      $('coachOpeningEmpty').textContent = 'Не удалось загрузить каталог дебютов: ' + error.message;
    }
  }

  function updateSourcePanels() {
    const source = $('coachSource').value;
    $('coachChesscomFields').hidden = source !== 'chesscom';
    $('coachLichessFields').hidden = source !== 'lichess';
    $('coachPgnFields').hidden = source !== 'pgn';
  }

  function restoreSavedReport() {
    report = readStorage(COACH_REPORT_KEY, null);
    if (report && report.summary) {
      renderReport();
      setStatus('Загружен сохранённый отчёт от ' + new Date(report.createdAt).toLocaleString('ru-RU') + '. Новые партии можно добавить в любой момент.', 'success');
    }
  }

  function init() {
    if (!$('tab-coach') || $('tab-coach').dataset.ready === '1') return;
    $('tab-coach').dataset.ready = '1';

    $('coachSource').addEventListener('change', updateSourcePanels);
    $('coachGameLimit').addEventListener('change', () => {
      const limit = Number($('coachGameLimit').value || 3);
      document.querySelectorAll('#coachGamesList input[type="checkbox"]').forEach((input, index) => {
        input.checked = index < limit;
      });
      updateSelectionCount();
    });
    $('coachLoadChesscom').addEventListener('click', loadChessComGames);
    $('coachLoadLichess').addEventListener('click', loadLichessGames);
    $('coachLoadPgn').addEventListener('click', loadPgnText);
    $('coachAnalyzeBtn').addEventListener('click', analyzeSelectedGames);
    $('coachDrillHint').addEventListener('click', revealDrill);
    $('coachDrillReset').addEventListener('click', resetDrill);
    $('coachOpeningSide').addEventListener('change', updateOpeningDueCount);
    $('coachOpeningStart').addEventListener('click', startOpeningReview);
    $('coachOpeningCheck').addEventListener('click', tryOpeningSan);
    $('coachOpeningReveal').addEventListener('click', revealOpeningAnswer);
    $('coachOpeningMoveInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') tryOpeningSan();
    });
    $('coachOpeningGrades').querySelectorAll('button[data-grade]').forEach(button => {
      button.addEventListener('click', () => rateOpeningCard(button.dataset.grade));
    });

    $('coachPgnFile').addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        $('coachPgnText').value = String(reader.result || '');
        setStatus('Файл прочитан. Нажми «Подготовить партии».');
      };
      reader.onerror = () => setStatus('Не удалось прочитать файл PGN.', 'error');
      reader.readAsText(file, 'UTF-8');
    });

    document.querySelector('.tab-btn[data-tab="coach"]')?.addEventListener('click', () => {
      setTimeout(() => {
        if (drillBoard) drillBoard.resize();
        if (openingBoard) openingBoard.resize();
      }, 100);
    });

    updateSourcePanels();
    restoreSavedReport();
    loadOpeningCatalog();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();