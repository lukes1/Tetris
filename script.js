const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next-piece");
const nextCtx = nextCanvas.getContext("2d");
const aiStatus = document.getElementById("ai-status");
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");
const levelElement = document.getElementById("level");
const highscoreElement = document.getElementById("highscore");
const statusText = document.getElementById("status-text");
const primaryActionButton = document.getElementById("primary-action");
const stageOverlay = document.getElementById("stage-overlay");
const overlayKicker = document.getElementById("overlay-kicker");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

const COLS = 10;
const ROWS = 20;
const BLOCK = 20;
const AUTO_PLAY_DEFAULT = true;
const PREVIEW_BLOCK = 24;
const HIGHSCORE_STORAGE_KEY = "tetris-highscore";
const GAME_STATES = {
    READY: "ready",
    RUNNING: "running",
    PAUSED: "paused",
    GAME_OVER: "gameover"
};

canvas.width = COLS * BLOCK;
canvas.height = ROWS * BLOCK;

const COLORS = [
    null,
    "#00f0f0",
    "#0000f0",
    "#f0a000",
    "#f0f000",
    "#00f000",
    "#a000f0",
    "#f00000"
];

const SHAPES = [
    [],
    [[1, 1, 1, 1]],
    [[2, 0, 0], [2, 2, 2]],
    [[0, 0, 3], [3, 3, 3]],
    [[4, 4], [4, 4]],
    [[0, 5, 5], [5, 5, 0]],
    [[0, 6, 0], [6, 6, 6]],
    [[7, 7, 0], [0, 7, 7]]
];

function createMatrix(w, h) {
    return Array.from({ length: h }, () => Array(w).fill(0));
}

function cloneMatrix(matrix) {
    return matrix.map(row => row.slice());
}

function randomShapeMatrix() {
    return cloneMatrix(SHAPES[Math.floor(Math.random() * (SHAPES.length - 1)) + 1]);
}

function rotateClockwise(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
}

function matrixSignature(matrix) {
    return matrix.map(row => row.join(",")).join("|");
}

function getUniqueRotations(matrix) {
    const seen = new Set();
    const rotations = [];
    let current = cloneMatrix(matrix);

    for (let i = 0; i < 4; i++) {
        const sig = matrixSignature(current);
        if (!seen.has(sig)) {
            seen.add(sig);
            rotations.push(cloneMatrix(current));
        }
        current = rotateClockwise(current);
    }

    return rotations;
}

function getOccupiedXBounds(matrix) {
    let min = Infinity;
    let max = -Infinity;

    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x] !== 0) {
                min = Math.min(min, x);
                max = Math.max(max, x);
            }
        }
    }

    return { min, max };
}

const arena = createMatrix(COLS, ROWS);

const player = {
    pos: { x: 0, y: 0 },
    matrix: null
};

let nextMatrix = null;
let autoPlay = AUTO_PLAY_DEFAULT;
let lastTime = 0;
let dropCounter = 0;
let aiCounter = 0;
let score = 0;
let lines = 0;
let level = 1;
let combo = -1;
let highscore = loadHighscore();
let gameState = GAME_STATES.READY;

const baseDropInterval = 500;
let dropInterval = baseDropInterval;
const aiInterval = 90;

function loadHighscore() {
    const stored = window.localStorage.getItem(HIGHSCORE_STORAGE_KEY);
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function persistHighscore() {
    window.localStorage.setItem(HIGHSCORE_STORAGE_KEY, String(highscore));
}

function collide(board, currentPlayer) {
    return collideAt(board, currentPlayer.matrix, currentPlayer.pos.x, currentPlayer.pos.y);
}

function collideAt(board, matrix, offsetX, offsetY) {
    for (let y = 0; y < matrix.length; y++) {
        for (let x = 0; x < matrix[y].length; x++) {
            if (matrix[y][x] === 0) {
                continue;
            }

            const ay = y + offsetY;
            const ax = x + offsetX;

            if (
                ay < 0 ||
                ay >= board.length ||
                ax < 0 ||
                ax >= board[0].length ||
                board[ay][ax] !== 0
            ) {
                return true;
            }
        }
    }

    return false;
}

function merge(board, currentPlayer) {
    placeMatrix(board, currentPlayer.matrix, currentPlayer.pos.x, currentPlayer.pos.y);
}

function placeMatrix(board, matrix, offsetX, offsetY) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                board[y + offsetY][x + offsetX] = value;
            }
        });
    });
}

function playerRotate() {
    const originalX = player.pos.x;
    const original = player.matrix;
    let offset = 1;
    player.matrix = rotateClockwise(player.matrix);

    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (Math.abs(offset) > player.matrix[0].length) {
            player.matrix = original;
            player.pos.x = originalX;
            return;
        }
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        lockPiece();
    }
}

function hardDrop() {
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    lockPiece();
}

function sweepBoard(board) {
    let cleared = 0;

    outer: for (let y = board.length - 1; y >= 0; y--) {
        for (let x = 0; x < board[y].length; x++) {
            if (board[y][x] === 0) {
                continue outer;
            }
        }
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
    }

    return cleared;
}

function arenaSweep() {
    return sweepBoard(arena);
}

function levelFromLines(totalLines) {
    return Math.floor(totalLines / 10) + 1;
}

function dropIntervalForLevel(currentLevel) {
    return Math.max(90, baseDropInterval - (currentLevel - 1) * 35);
}

function scoreForClearedLines(clearedLines, currentLevel) {
    const table = [0, 40, 100, 300, 1200];
    return table[clearedLines] * currentLevel;
}

function updateHighscore() {
    if (score > highscore) {
        highscore = score;
        persistHighscore();
    }
}

function updateScoreDisplay() {
    scoreElement.textContent = String(score);
    linesElement.textContent = String(lines);
    levelElement.textContent = String(level);
    highscoreElement.textContent = String(highscore);
}

function resetStats() {
    score = 0;
    lines = 0;
    level = 1;
    combo = -1;
    dropInterval = dropIntervalForLevel(level);
    updateScoreDisplay();
}

function addDropScore(points) {
    score += points;
    updateHighscore();
    updateScoreDisplay();
}

function applyLineScore(clearedLines) {
    if (clearedLines > 0) {
        combo = combo < 0 ? 0 : combo + 1;
        score += scoreForClearedLines(clearedLines, level);
        if (combo > 0) {
            score += combo * 50 * level;
        }
        lines += clearedLines;
        level = levelFromLines(lines);
        dropInterval = dropIntervalForLevel(level);
        updateHighscore();
    } else {
        combo = -1;
    }

    updateScoreDisplay();
}

function lockPiece() {
    merge(arena, player);
    const clearedLines = arenaSweep();
    applyLineScore(clearedLines);
    resetPlayer();
}

function spawnPlayerFromQueue() {
    player.matrix = nextMatrix;
    nextMatrix = randomShapeMatrix();
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
}

function resetPlayer() {
    if (!nextMatrix) {
        nextMatrix = randomShapeMatrix();
    }

    spawnPlayerFromQueue();
    drawNextPreview();

    if (collide(arena, player)) {
        handleGameOver();
    }
}

function simulateDrop(board, matrix, startX) {
    let y = 0;
    if (collideAt(board, matrix, startX, y)) {
        return null;
    }

    while (!collideAt(board, matrix, startX, y + 1)) {
        y++;
    }

    return y;
}

function evaluateBoard(board, clearedLines) {
    const heights = Array(COLS).fill(0);
    let holes = 0;

    for (let x = 0; x < COLS; x++) {
        let seenBlock = false;
        for (let y = 0; y < ROWS; y++) {
            if (board[y][x] !== 0) {
                if (!seenBlock) {
                    heights[x] = ROWS - y;
                    seenBlock = true;
                }
            } else if (seenBlock) {
                holes++;
            }
        }
    }

    let bumpiness = 0;
    for (let x = 0; x < COLS - 1; x++) {
        bumpiness += Math.abs(heights[x] - heights[x + 1]);
    }

    const aggregateHeight = heights.reduce((sum, h) => sum + h, 0);

    return (
        clearedLines * 7.5 -
        aggregateHeight * 0.42 -
        holes * 1.15 -
        bumpiness * 0.26
    );
}

function getCandidatePlacements(board, matrix) {
    const rotations = getUniqueRotations(matrix);
    const candidates = [];

    for (const rotated of rotations) {
        const bounds = getOccupiedXBounds(rotated);
        const minX = -bounds.min;
        const maxX = COLS - 1 - bounds.max;

        for (let x = minX; x <= maxX; x++) {
            const y = simulateDrop(board, rotated, x);
            if (y === null) {
                continue;
            }

            const simulated = board.map(row => row.slice());
            placeMatrix(simulated, rotated, x, y);
            const cleared = sweepBoard(simulated);
            const scoreValue = evaluateBoard(simulated, cleared);

            candidates.push({
                score: scoreValue,
                x,
                y,
                cleared,
                matrix: cloneMatrix(rotated),
                boardAfter: simulated
            });
        }
    }

    return candidates;
}

function findBestMove(board, matrix, upcomingMatrix) {
    const firstMoves = getCandidatePlacements(board, matrix);
    let best = null;

    for (const move of firstMoves) {
        let lookaheadScore = move.score;

        if (upcomingMatrix) {
            const nextMoves = getCandidatePlacements(move.boardAfter, upcomingMatrix);

            if (nextMoves.length === 0) {
                lookaheadScore -= 1000;
            } else {
                const bestNext = nextMoves.reduce(
                    (maxScore, nextMove) => Math.max(maxScore, nextMove.score),
                    -Infinity
                );
                lookaheadScore = move.score * 0.55 + bestNext * 1.0 + move.cleared * 2.5;
            }
        }

        if (!best || lookaheadScore > best.score) {
            best = {
                score: lookaheadScore,
                x: move.x,
                y: move.y,
                matrix: move.matrix
            };
        }
    }

    return best;
}

function aiStep() {
    const bestMove = findBestMove(arena, player.matrix, nextMatrix);
    if (!bestMove) {
        playerDrop();
        return;
    }

    player.matrix = bestMove.matrix;
    player.pos.x = bestMove.x;
    player.pos.y = bestMove.y;
    lockPiece();
}

function drawCell(x, y, color) {
    drawCellOnContext(ctx, x, y, color, BLOCK);
}

function drawCellOnContext(context, x, y, color, size) {
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size, size);
    context.strokeStyle = "rgba(255, 255, 255, 0.12)";
    context.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
}

function drawPreview() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.fillStyle = "#05070d";
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    if (!nextMatrix) {
        return;
    }

    const matrixWidth = nextMatrix[0].length;
    const matrixHeight = nextMatrix.length;
    const offsetX = Math.floor((nextCanvas.width - matrixWidth * PREVIEW_BLOCK) / 2 / PREVIEW_BLOCK);
    const offsetY = Math.floor((nextCanvas.height - matrixHeight * PREVIEW_BLOCK) / 2 / PREVIEW_BLOCK);

    nextMatrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                drawCellOnContext(nextCtx, x + offsetX, y + offsetY, COLORS[value], PREVIEW_BLOCK);
            }
        });
    });
}

function drawNextPreview() {
    drawPreview();
}

function drawOverlay() {
    if (gameState === GAME_STATES.RUNNING) {
        stageOverlay.hidden = true;
        return;
    }

    stageOverlay.hidden = false;

    if (gameState === GAME_STATES.READY) {
        overlayKicker.textContent = "Bereit?";
        overlayTitle.textContent = "Tetris starten";
        overlayText.textContent = "Druecke Enter oder den Start-Button.";
    } else if (gameState === GAME_STATES.PAUSED) {
        overlayKicker.textContent = "Pause";
        overlayTitle.textContent = "Spiel pausiert";
        overlayText.textContent = "Druecke P oder den Button, um weiterzuspielen.";
    } else {
        overlayKicker.textContent = "Game Over";
        overlayTitle.textContent = "Neuer Versuch?";
        overlayText.textContent = `Dein Run endet mit ${score} Punkten. Enter startet neu.`;
    }
}

function updateStatusUI() {
    const labels = {
        [GAME_STATES.READY]: { text: "Waiting", button: "Start" },
        [GAME_STATES.RUNNING]: { text: "Running", button: "Pause" },
        [GAME_STATES.PAUSED]: { text: "Paused", button: "Resume" },
        [GAME_STATES.GAME_OVER]: { text: "Game Over", button: "Restart" }
    };
    statusText.textContent = labels[gameState].text;
    primaryActionButton.textContent = labels[gameState].button;
}

function setGameState(nextState) {
    gameState = nextState;
    if (nextState !== GAME_STATES.RUNNING) {
        dropCounter = 0;
        aiCounter = 0;
    }
    updateStatusUI();
    drawOverlay();
}

function resetArena() {
    arena.forEach(row => row.fill(0));
}

function startNewGame() {
    resetArena();
    nextMatrix = randomShapeMatrix();
    resetStats();
    spawnPlayerFromQueue();
    drawNextPreview();
    lastTime = 0;
    setGameState(GAME_STATES.RUNNING);
}

function togglePause() {
    if (gameState === GAME_STATES.RUNNING) {
        setGameState(GAME_STATES.PAUSED);
    } else if (gameState === GAME_STATES.PAUSED) {
        setGameState(GAME_STATES.RUNNING);
    }
}

function handleGameOver() {
    updateHighscore();
    updateScoreDisplay();
    setGameState(GAME_STATES.GAME_OVER);
}

function handlePrimaryAction() {
    if (gameState === GAME_STATES.READY || gameState === GAME_STATES.GAME_OVER) {
        startNewGame();
    } else {
        togglePause();
    }
}

function draw() {
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMatrix(arena, { x: 0, y: 0 });
    if (player.matrix) {
        drawMatrix(player.matrix, player.pos);
    }
}

function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                drawCell(x + offset.x, y + offset.y, COLORS[value]);
            }
        });
    });
}

function updateAIStatus() {
    if (aiStatus) {
        aiStatus.textContent = `AI: ${autoPlay ? "ON" : "OFF"}`;
    }
}

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    if (gameState === GAME_STATES.RUNNING && autoPlay) {
        aiCounter += deltaTime;
        if (aiCounter > aiInterval) {
            aiCounter = 0;
            aiStep();
        }
    } else if (gameState === GAME_STATES.RUNNING) {
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
            dropCounter = 0;
        }
    }

    draw();
    requestAnimationFrame(update);
}

document.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        handlePrimaryAction();
        return;
    }

    if (event.key.toLowerCase() === "p") {
        if (gameState !== GAME_STATES.READY) {
            togglePause();
        }
        return;
    }

    if (event.key.toLowerCase() === "a") {
        autoPlay = !autoPlay;
        dropCounter = 0;
        aiCounter = 0;
        updateAIStatus();
        return;
    }

    if (gameState !== GAME_STATES.RUNNING || autoPlay) {
        return;
    }

    if (event.key === "ArrowLeft") {
        player.pos.x--;
        if (collide(arena, player)) {
            player.pos.x++;
        }
    }

    if (event.key === "ArrowRight") {
        player.pos.x++;
        if (collide(arena, player)) {
            player.pos.x--;
        }
    }

    if (event.key === "ArrowDown") {
        addDropScore(1);
        playerDrop();
    }

    if (event.key === "ArrowUp") {
        playerRotate();
    }

    if (event.code === "Space") {
        let dropDistance = 0;
        while (!collide(arena, player)) {
            player.pos.y++;
            dropDistance++;
        }
        player.pos.y--;
        dropDistance--;
        if (dropDistance > 0) {
            addDropScore(dropDistance * 2);
        }
        hardDrop();
    }
});

primaryActionButton.addEventListener("click", handlePrimaryAction);

player.matrix = randomShapeMatrix();
nextMatrix = randomShapeMatrix();
updateScoreDisplay();
drawNextPreview();
updateAIStatus();
updateStatusUI();
drawOverlay();
update();
