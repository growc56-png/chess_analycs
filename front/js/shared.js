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
    return window.ChessBoardDrawing ? window.ChessBoardDrawing.init(boardId) : false;
}

function clearUserDrawings(boardId) {
    if (window.ChessBoardDrawing) window.ChessBoardDrawing.clear(boardId);
    else {
        const svg = document.getElementById('userDraw_' + boardId);
        if (svg) svg.replaceChildren();
    }
}

function downloadPGN(pgn, filename = "game.pgn") {
    const blob = new Blob([pgn], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}