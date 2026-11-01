const sounds = {
    move: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3'),
    capture: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3'),
    end: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3'),
    error: new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/illegal.mp3')
};

function playSound(type) {
    if (sounds[type]) { sounds[type].currentTime = 0; sounds[type].play().catch(e => {}); }
}

function initRightClickDrawing(boardId) {
    const boardEl = document.getElementById(boardId);
    const svgEl = document.getElementById(`userDraw_${boardId}`);
    if (!boardEl || !svgEl) return;

    svgEl.setAttribute('viewBox', '0 0 8 8');
    svgEl.innerHTML = ''; 
    let isDrawing = false, startX = -1, startY = -1;

    const getSquareCoords = (e) => {
        const rect = boardEl.getBoundingClientRect();
        const size = rect.width / 8;
        let x = Math.floor((e.clientX - rect.left) / size);
        let y = Math.floor((e.clientY - rect.top) / size);
        if (x < 0 || x > 7 || y < 0 || y > 7) return null;
        return { x, y };
    };

    boardEl.addEventListener('mousedown', e => {
        if (e.button !== 2) return;
        e.preventDefault(); e.stopPropagation();
        const sq = getSquareCoords(e);
        if (!sq) return;
        isDrawing = true; startX = sq.x; startY = sq.y; svgEl.innerHTML = ''; 
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', startX + 0.5); circle.setAttribute('cy', startY + 0.5);
        circle.setAttribute('r', '0.31'); circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', 'rgba(255, 69, 0, 0.8)'); circle.setAttribute('stroke-width', '0.085');
        svgEl.appendChild(circle);
    }, true);

    boardEl.addEventListener('mousemove', e => {
        if (!isDrawing) return;
        e.preventDefault(); e.stopPropagation();
        const sq = getSquareCoords(e);
        if (!sq) return;

        const currentX = sq.x, currentY = sq.y; svgEl.innerHTML = '';
        const x1 = startX + 0.5, y1 = startY + 0.5, x2 = currentX + 0.5, y2 = currentY + 0.5;

        if (startX === currentX && startY === currentY) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x1); circle.setAttribute('cy', y1); circle.setAttribute('r', '0.4');
            circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', 'rgba(255, 69, 0, 0.8)'); circle.setAttribute('stroke-width', '0.15');
            svgEl.appendChild(circle);
        } else {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke', 'rgba(255, 69, 0, 0.8)'); path.setAttribute('stroke-width', '0.15'); path.setAttribute('fill', 'none');

            const dx = Math.abs(currentX - startX), dy = Math.abs(currentY - startY);
            const isKnightMove = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
            let endLineX = x2, endLineY = y2;

            if (isKnightMove) {
                if (dx === 2) path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`);
                else path.setAttribute('d', `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`);
            } else {
                const angle = Math.atan2(y2 - y1, x2 - x1);
                endLineX = x2 - 0.16 * Math.cos(angle); endLineY = y2 - 0.16 * Math.sin(angle);
                path.setAttribute('d', `M ${x1} ${y1} L ${endLineX} ${endLineY}`);
            }
            svgEl.appendChild(path);

            let angle = 0;
            if (isKnightMove) {
                 if (dx === 2) angle = (currentY > startY) ? Math.PI/2 : -Math.PI/2;
                 else angle = (currentX > startX) ? 0 : Math.PI;
            } else angle = Math.atan2(y2 - y1, x2 - x1);

            const len = 0.27, ang = Math.PI / 5;
            const ax1 = x2 - len * Math.cos(angle - ang), ay1 = y2 - len * Math.sin(angle - ang);
            const ax2 = x2 - len * Math.cos(angle + ang), ay2 = y2 - len * Math.sin(angle + ang);

            const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            head.setAttribute('points', `${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`);
            head.setAttribute('fill', 'rgba(255, 69, 0, 0.8)');
            svgEl.appendChild(head);
        }
    }, true);

    document.addEventListener('mouseup', e => { if (e.button === 2 && isDrawing) isDrawing = false; });
}

function clearUserDrawings(boardId) {
    const svg = document.getElementById(`userDraw_${boardId}`);
    if (svg) svg.innerHTML = '';
}

function downloadPGN(pgn, filename = "game.pgn") {
    const blob = new Blob([pgn], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}