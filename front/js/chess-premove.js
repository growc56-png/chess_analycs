/* Общая механика премувов для всех режимов игры против соперника. */
(() => {
  'use strict';

  function copyGame(game) {
    if (!game || typeof game.fen !== 'function' || typeof window.Chess !== 'function') {
      return null;
    }
    return new window.Chess(game.fen());
  }

  function normalize(move) {
    if (!move || !/^[a-h][1-8]$/.test(move.from || '') || !/^[a-h][1-8]$/.test(move.to || '')) {
      return null;
    }
    return {
      from: move.from,
      to: move.to,
      promotion: String(move.promotion || 'q').toLowerCase()
    };
  }

  function forceTurn(game, color) {
    const targetColor = color === 'b' ? 'b' : 'w';
    const fields = game.fen().split(' ');
    if (fields[1] !== targetColor) {
      fields[1] = targetColor;
      // Ход соперника виртуально пропускается, поэтому en passant больше недоступен.
      fields[3] = '-';
    }
    return new window.Chess(fields.join(' '));
  }

  function applyMove(game, move) {
    const normalized = normalize(move);
    if (!normalized) return null;
    try {
      return game.move(normalized);
    } catch (_) {
      return null;
    }
  }

  function rebuild(baseGame, color, queue) {
    const virtualGame = copyGame(baseGame);
    if (!virtualGame) return { virtualGame: null, queue: [] };

    let virtual = forceTurn(virtualGame, color);
    const validQueue = [];

    for (const candidate of Array.isArray(queue) ? queue : []) {
      const planned = normalize(candidate);
      if (!planned) break;
      if (virtual.turn() !== color) virtual = forceTurn(virtual, color);
      const applied = applyMove(virtual, planned);
      if (!applied) break;

      validQueue.push(planned);
      // Между своими премувами виртуально пропускаем ответ соперника.
      virtual = forceTurn(virtual, color);
    }

    return { virtualGame: virtual, queue: validQueue };
  }

  function add(baseGame, color, queue, move) {
    const current = rebuild(baseGame, color, queue);
    if (!current.virtualGame) {
      return { ok: false, virtualGame: null, queue: [] };
    }

    const planned = normalize(move);
    if (!planned) {
      return { ok: false, virtualGame: current.virtualGame, queue: current.queue };
    }

    const probe = copyGame(current.virtualGame);
    if (!probe || !applyMove(probe, planned)) {
      return { ok: false, virtualGame: current.virtualGame, queue: current.queue };
    }

    const next = rebuild(baseGame, color, current.queue.concat(planned));
    return {
      ok: next.queue.length === current.queue.length + 1,
      virtualGame: next.virtualGame,
      queue: next.queue
    };
  }

  function execute(game, color, queue) {
    const current = rebuild(game, color, queue);
    if (!current.queue.length || !game || game.game_over() || game.turn() !== color) {
      return { move: null, queue: current.queue, virtualGame: current.virtualGame };
    }

    const planned = current.queue[0];
    const move = applyMove(game, planned);
    if (!move) {
      return { move: null, queue: [], virtualGame: forceTurn(game, color) };
    }

    const nextQueue = current.queue.slice(1);
    const next = rebuild(game, color, nextQueue);
    return { move, queue: next.queue, virtualGame: next.virtualGame };
  }

  function getVirtualGame(baseGame, color, queue) {
    return rebuild(baseGame, color, queue).virtualGame;
  }

  window.ChessPremove = {
    forceTurn,
    rebuild,
    add,
    execute,
    getVirtualGame
  };
})();