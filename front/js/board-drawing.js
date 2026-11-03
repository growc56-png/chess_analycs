/* Единый стиль шахматных пометок: ПКМ-перетаскивание, Г-ход конём и маркеры клеток. */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const boards = new Map();
  const palette = {
    green: '#159447',
    red: '#e04b4b',
    blue: '#3488d8',
    yellow: '#e0aa28'
  };
  let activeDrawing = null;

  function getBoardPoint(boardEl, clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (localX < 0 || localY < 0 || localX >= rect.width || localY >= rect.height) {
      return null;
    }

    const col = Math.min(7, Math.floor((localX / rect.width) * 8));
    const row = Math.min(7, Math.floor((localY / rect.height) * 8));
    return {
      point: { x: col + 0.5, y: row + 0.5 },
      cell: { col, row },
      key: col + ':' + row
    };
  }

  function arrowColor(event) {
    if (event.altKey) return palette.yellow;
    if (event.ctrlKey || event.metaKey) return palette.blue;
    if (event.shiftKey) return palette.red;
    return palette.green;
  }

  function svgNode(name) {
    return document.createElementNS(NS, name);
  }

  function setAttributes(element, values) {
    Object.keys(values).forEach(key => element.setAttribute(key, String(values[key])));
    return element;
  }

  function addCircle(group, point, color, opacity) {
    const circle = svgNode('circle');
    setAttributes(circle, {
      cx: point.x,
      cy: point.y,
      r: 0.34,
      fill: color,
      'fill-opacity': 0.22 * opacity,
      stroke: color,
      'stroke-width': 0.075,
      'stroke-opacity': 0.82 * opacity
    });
    group.appendChild(circle);
  }

  function addArrow(group, arrow, opacity) {
    const from = arrow.from;
    const to = arrow.to;
    const color = arrow.color || palette.green;

    if (!from || !to || !arrow.fromCell || !arrow.toCell) return;

    if (arrow.fromKey === arrow.toKey) {
      addCircle(group, from, color, opacity);
      return;
    }

    const colDelta = Math.abs(arrow.toCell.col - arrow.fromCell.col);
    const rowDelta = Math.abs(arrow.toCell.row - arrow.fromCell.row);
    const isKnightMove =
      (colDelta === 1 && rowDelta === 2) ||
      (colDelta === 2 && rowDelta === 1);

    // У коня длинная часть маршрута рисуется первой, короткая — последней.
    // Наконечник разворачивается по последнему сегменту, поэтому получается
    // отчётливая буква «Г» для всех четырёх направлений.
    const points = [from];
    if (isKnightMove) {
      points.push(colDelta === 2
        ? { x: to.x, y: from.y }
        : { x: from.x, y: to.y });
    }

    const lastPoint = points[points.length - 1];
    const dx = to.x - lastPoint.x;
    const dy = to.y - lastPoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;

    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const headLength = Math.min(0.42, length * 0.46);
    const headHalfWidth = 0.245;
    const base = {
      x: to.x - ux * headLength,
      y: to.y - uy * headLength
    };

    const shaftPoints = points.concat([base]);
    const pathData = shaftPoints.map((point, index) =>
      (index === 0 ? 'M ' : 'L ') + point.x.toFixed(3) + ' ' + point.y.toFixed(3)
    ).join(' ');

    const shaft = svgNode('path');
    setAttributes(shaft, {
      d: pathData,
      fill: 'none',
      stroke: color,
      'stroke-width': 0.19,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-opacity': 0.62 * opacity
    });
    group.appendChild(shaft);

    const head = svgNode('polygon');
    const left = {
      x: base.x + px * headHalfWidth,
      y: base.y + py * headHalfWidth
    };
    const right = {
      x: base.x - px * headHalfWidth,
      y: base.y - py * headHalfWidth
    };
    setAttributes(head, {
      points: [
        to.x.toFixed(3) + ',' + to.y.toFixed(3),
        left.x.toFixed(3) + ',' + left.y.toFixed(3),
        right.x.toFixed(3) + ',' + right.y.toFixed(3)
      ].join(' '),
      fill: color,
      'fill-opacity': 0.76 * opacity,
      stroke: color,
      'stroke-width': 0.025,
      'stroke-linejoin': 'round',
      'stroke-opacity': 0.32 * opacity
    });
    group.appendChild(head);
  }

  function makeGroup(arrow, opacity) {
    const group = svgNode('g');
    group.setAttribute('opacity', String(opacity));
    addArrow(group, arrow, 1);
    return group;
  }

  function render(state, preview) {
    if (!state || !state.svg || !state.svg.isConnected) return;
    state.svg.replaceChildren();

    state.arrows.forEach(arrow => {
      const group = makeGroup(arrow, 1);
      group.dataset.arrowKey = arrow.key;
      state.svg.appendChild(group);
    });

    if (preview) {
      const group = makeGroup(preview, 0.62);
      group.dataset.preview = '1';
      state.svg.appendChild(group);
    }
  }

  function getOverlay(boardId, boardEl) {
    let svg = document.getElementById('userDraw_' + boardId);
    if (!svg) {
      svg = svgNode('svg');
      svg.id = 'userDraw_' + boardId;
      svg.classList.add('user-draw-overlay');
    }

    // Делаем overlay дочерним элементом самой доски. Так его координаты
    // совпадают с 8x8 доской, а не с внешней карточкой/панелью вокруг неё.
    if (svg.parentElement !== boardEl) boardEl.appendChild(svg);
    if (window.getComputedStyle(boardEl).position === 'static') {
      boardEl.style.position = 'relative';
    }

    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('chess-user-draw-overlay');
    Object.assign(svg.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '30',
      pointerEvents: 'none',
      overflow: 'hidden'
    });
    return svg;
  }

  function cancelActiveDrawing() {
    if (!activeDrawing) return;
    activeDrawing.state.preview = null;
    render(activeDrawing.state);
    activeDrawing = null;
  }

  function finishDrawing(event) {
    if (!activeDrawing) return;
    const active = activeDrawing;
    if (event.pointerId !== active.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const hit = getBoardPoint(active.state.board, event.clientX, event.clientY);
    if (hit) {
      const arrow = {
        from: active.from.point,
        to: hit.point,
        fromCell: active.from.cell,
        toCell: hit.cell,
        fromKey: active.from.key,
        toKey: hit.key,
        color: active.color,
        key: active.from.key + '>' + hit.key
      };

      const existingIndex = active.state.arrows.findIndex(item => item.key === arrow.key);
      if (existingIndex >= 0) active.state.arrows.splice(existingIndex, 1);
      else active.state.arrows.push(arrow);
    }

    active.state.preview = null;
    render(active.state);
    activeDrawing = null;
  }

  document.addEventListener('pointermove', event => {
    if (!activeDrawing || event.pointerId !== activeDrawing.pointerId) return;
    event.preventDefault();
    const hit = getBoardPoint(activeDrawing.state.board, event.clientX, event.clientY);
    if (!hit) return;

    activeDrawing.preview = {
      from: activeDrawing.from.point,
      to: hit.point,
      fromCell: activeDrawing.from.cell,
      toCell: hit.cell,
      fromKey: activeDrawing.from.key,
      toKey: hit.key,
      color: activeDrawing.color
    };
    render(activeDrawing.state, activeDrawing.preview);
  }, true);

  document.addEventListener('pointerup', finishDrawing, true);
  document.addEventListener('pointercancel', cancelActiveDrawing, true);
  window.addEventListener('blur', cancelActiveDrawing);

  function init(boardId) {
    const board = document.getElementById(boardId);
    if (!board) return false;
    if (boards.has(boardId)) return true;

    const svg = getOverlay(boardId, board);
    const state = { board, svg, arrows: [], preview: null };
    boards.set(boardId, state);
    board.dataset.chessArrowsReady = '1';
    board.style.userSelect = 'none';
    board.style.webkitUserSelect = 'none';

    board.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
    }, true);

    // Не даём правой кнопке запускать выделение/drag логики Chessboard.js.
    board.addEventListener('mousedown', event => {
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);

    board.addEventListener('pointerdown', event => {
      if (event.button !== 2 || event.pointerType === 'touch') return;
      const hit = getBoardPoint(board, event.clientX, event.clientY);
      if (!hit) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      cancelActiveDrawing();

      activeDrawing = {
        state,
        pointerId: event.pointerId,
        from: hit,
        color: arrowColor(event),
        preview: null
      };
      render(state, {
        from: hit.point,
        to: hit.point,
        fromCell: hit.cell,
        toCell: hit.cell,
        fromKey: hit.key,
        toKey: hit.key,
        color: activeDrawing.color
      });
    }, true);

    // ЛКМ, как на Chess.com, очищает все временные пометки на этой доске.
    board.addEventListener('click', event => {
      if (event.button !== 0 || !state.arrows.length) return;
      state.arrows = [];
      render(state);
    }, true);

    return true;
  }

  function clear(boardId) {
    const state = boards.get(boardId);
    if (state) {
      state.arrows = [];
      state.preview = null;
      if (activeDrawing && activeDrawing.state === state) activeDrawing = null;
      render(state);
      return;
    }
    const svg = document.getElementById('userDraw_' + boardId);
    if (svg) svg.replaceChildren();
  }

  function clearAll() {
    boards.forEach((state, boardId) => clear(boardId));
  }

  window.ChessBoardDrawing = { init, clear, clearAll };
  window.initRightClickDrawing = init;
  window.clearUserDrawings = clear;
})();