const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const aiStatus = document.getElementById("ai-status");
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");
const levelElement = document.getElementById("level");

const COLS = 10;
const ROWS = 20;
const BLOCK = 20;
const AUTO_PLAY_DEFAULT = true;

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

let autoPlay = AUTO_PLAY_DEFAULT;
let lastTime = 0;
let dropCounter = 0;
let aiCounter = 0;
let score = 0;
let lines = 0;
let level = 1;

const baseDropInterval = 500;
let dropInterval = baseDropInterval;
const aiInterval = 90;

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

function updateScoreDisplay() {
    scoreElement.textContent = String(score);
    linesElement.textContent = String(lines);
    levelElement.textContent = String(level);
}

function resetStats() {
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = dropIntervalForLevel(level);
    updateScoreDisplay();
}

function applyLineScore(clearedLines) {
    if (clearedLines <= 0) {
        return;
    }

    score += scoreForClearedLines(clearedLines, level);
    lines += clearedLines;
    level = levelFromLines(lines);
    dropInterval = dropIntervalForLevel(level);
    updateScoreDisplay();
}

function lockPiece() {
    merge(arena, player);
    const clearedLines = arenaSweep();
    applyLineScore(clearedLines);
    resetPlayer();
}

function resetPlayer() {
    player.matrix = cloneMatrix(
        SHAPES[Math.floor(Math.random() * (SHAPES.length - 1)) + 1]
    );
    player.pos.y = 0;
    player.pos.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);

    if (collide(arena, player)) {
        arena.forEach(row => row.fill(0));
        resetStats();
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
        clearedLines * 3.8 -
        aggregateHeight * 0.45 -
        holes * 0.95 -
        bumpiness * 0.32
    );
}

function findBestMove(board, matrix) {
    const rotations = getUniqueRotations(matrix);
    let best = null;

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
            const score = evaluateBoard(simulated, cleared);

            if (!best || score > best.score) {
                best = {
                    score,
                    x,
                    y,
                    matrix: cloneMatrix(rotated)
                };
            }
        }
    }

    return best;
}

function aiStep() {
    const bestMove = findBestMove(arena, player.matrix);
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
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.strokeRect(x * BLOCK + 0.5, y * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
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

function draw() {
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMatrix(arena, { x: 0, y: 0 });
    drawMatrix(player.matrix, player.pos);
}

function updateAIStatus() {
    if (aiStatus) {
        aiStatus.textContent = `AI: ${autoPlay ? "ON" : "OFF"}`;
    }
}

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    if (autoPlay) {
        aiCounter += deltaTime;
        if (aiCounter > aiInterval) {
            aiCounter = 0;
            aiStep();
        }
    } else {
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
    if (event.key.toLowerCase() === "a") {
        autoPlay = !autoPlay;
        dropCounter = 0;
        aiCounter = 0;
        updateAIStatus();
        return;
    }

    if (autoPlay) {
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
        playerDrop();
    }

    if (event.key === "ArrowUp") {
        playerRotate();
    }

    if (event.code === "Space") {
        hardDrop();
    }
});

resetPlayer();
resetStats();
updateAIStatus();
update();
