(() => {
  'use strict';

  function initBoardClickToMove(boardId, getGame, onMove, options) {
    const boardEl = document.getElementById(boardId);
    if (!boardEl || typeof getGame !== 'function' || typeof onMove !== 'function') return null;
    if (boardEl.__clickToMoveReady) {
      boardEl.__clickToMoveConfig = { getGame, onMove, options: options || {} };
      return boardEl.__clearClickSelection || null;
    }

    boardEl.__clickToMoveReady = true;
    boardEl.__clickToMoveConfig = { getGame, onMove, options: options || {} };
    let selectedSquare = null;

    function clearSelection() {
      selectedSquare = null;
      boardEl.querySelectorAll('.board-click-selected, .board-click-legal')
        .forEach(square => square.classList.remove('board-click-selected', 'board-click-legal'));
    }

    function getSquareElement(target) {
      return target && target.closest ? target.closest('[data-square]') : null;
    }

    function paintSelection(game, square) {
      clearSelection();
      selectedSquare = square;
      const selected = boardEl.querySelector('[data-square="' + square + '"]');
      if (selected) selected.classList.add('board-click-selected');
      const legalMoves = game.moves({ square, verbose: true }) || [];
      legalMoves.forEach(move => {
        const target = boardEl.querySelector('[data-square="' + move.to + '"]');
        if (target) target.classList.add('board-click-legal');
      });
    }

    boardEl.addEventListener('contextmenu', event => {
      event.preventDefault();
    });

    boardEl.addEventListener('click', event => {
      if (event.button !== 0) return;
      const squareElement = getSquareElement(event.target);
      if (!squareElement) return;
      const square = squareElement.getAttribute('data-square');
      if (!/^[a-h][1-8]$/.test(square || '')) return;

      const config = boardEl.__clickToMoveConfig;
      const game = config && config.getGame();
      if (!game || typeof game.moves !== 'function') {
        clearSelection();
        return;
      }

      if (selectedSquare) {
        if (square === selectedSquare) {
          clearSelection();
          return;
        }

        const legalMove = (game.moves({ square: selectedSquare, verbose: true }) || [])
          .find(move => move.to === square);

        if (legalMove) {
          const from = selectedSquare;
          const moveCallback = config.onMove;
          clearSelection();
          moveCallback(from, square, legalMove);
          return;
        }
      }

      const piece = game.get(square);
      const canSelect = config.options && typeof config.options.canSelect === 'function'
        ? config.options.canSelect(piece, square, game)
        : Boolean(piece && piece.color === game.turn());

      if (piece && canSelect && piece.color === game.turn()) {
        paintSelection(game, square);
      } else {
        clearSelection();
      }
    });

    boardEl.__clearClickSelection = clearSelection;
    return clearSelection;
  }

  window.initBoardClickToMove = initBoardClickToMove;
})();