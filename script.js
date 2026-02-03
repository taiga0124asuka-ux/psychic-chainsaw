/**
 * ULTIMATE TETRIS - Logic Script
 * Features: Big Bang (I-Only), SRS, Timer Fix, Large Previews, Touch/Gamepad
 */
document.addEventListener('DOMContentLoaded', () => {
    // -----------------
    // 1. DOM要素の取得
    // -----------------
    const menuScreen = document.getElementById('menu-screen');
    const gameScreen = document.getElementById('game-screen');
    const resultScreen = document.getElementById('result-screen');
    const pauseOverlay = document.getElementById('pause-overlay');

    const boardCanvas = document.getElementById('game-board');
    const holdCanvas = document.getElementById('hold-canvas');
    const nextCanvases = [
        document.getElementById('next-canvas-1'),
        document.getElementById('next-canvas-2'),
        document.getElementById('next-canvas-3'),
        document.getElementById('next-canvas-4'),
        document.getElementById('next-canvas-5'),
    ];

    const ctx = boardCanvas.getContext('2d');
    const holdCtx = holdCanvas.getContext('2d');
    const nextCtxs = nextCanvases.map(c => c.getContext('2d'));

    const scoreDisplay = document.getElementById('score-display');
    const linesDisplay = document.getElementById('lines-display');
    const levelDisplay = document.getElementById('level-display');
    const timeDisplay = document.getElementById('time-display');
    const timeContainer = document.getElementById('time-container');

    // -----------------
    // 2. 定数と設定
    // -----------------
    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 30; 
    const SIDE_BLOCK_SIZE = 30; // サイドパネルも30pxに拡大

    const COLORS = {
        'I': '#00f0f0', 'J': '#0000f0', 'L': '#f0a000', 'O': '#f0f000',
        'S': '#00f000', 'T': '#a000f0', 'Z': '#f00000', 
        'GHOST': 'rgba(255, 255, 255, 0.2)', 'PUZZLE': '#555555'
    };

    const SHAPES = {
        'I': [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
        'J': [[1,0,0], [1,1,1], [0,0,0]],
        'L': [[0,0,1], [1,1,1], [0,0,0]],
        'O': [[1,1], [1,1]],
        'S': [[0,1,1], [1,1,0], [0,0,0]],
        'T': [[0,1,0], [1,1,1], [0,0,0]],
        'Z': [[1,1,0], [0,1,1], [0,0,0]]
    };

    // SRS ウォールキック
    const KICK_DATA = {
        'JLSTZ': {
            '0-1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]], '1-0': [[0,0], [1,0], [1,-1], [0,2], [1,2]],
            '1-2': [[0,0], [1,0], [1,-1], [0,2], [1,2]], '2-1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
            '2-3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]], '3-2': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
            '3-0': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]], '0-3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]]
        },
        'I': {
            '0-1': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]], '1-0': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
            '1-2': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]], '2-1': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]],
            '2-3': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]], '3-2': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]],
            '3-0': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]], '0-3': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]]
        }
    };

    let grid, currentPiece, nextPieces, holdPiece, canHold;
    let score, lines, level, dropCounter, dropInterval, isGameOver, isPaused, gameMode;
    let timer, timerInterval, bigBangStage, lastTime, animationFrameId;

    const inputState = { buttons: {}, touchStart: null };

    // -----------------
    // 3. ゲームロジック
    // -----------------
    function createEmptyGrid() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }

    function spawnPiece() {
        if (nextPieces.length < 10) {
            const types = (gameMode === 'BIG_BANG') ? Array(7).fill('I') : Object.keys(SHAPES);
            const bag = types.sort(() => Math.random() - 0.5);
            nextPieces.push(...bag);
        }
        const type = nextPieces.shift();
        currentPiece = {
            type, matrix: SHAPES[type], rotation: 0,
            x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0].length / 2),
            y: type === 'I' ? -1 : 0
        };
        canHold = true;
        if (!isValid(currentPiece)) isGameOver = true;
    }

    function isValid(piece, ox = 0, oy = 0, matrix = piece.matrix) {
        return matrix.every((row, y) => row.every((val, x) => {
            if (!val) return true;
            let nx = piece.x + x + ox, ny = piece.y + y + oy;
            return nx >= 0 && nx < COLS && ny < ROWS && (ny < 0 || grid[ny][nx] === 0);
        }));
    }

    function rotate(dir) {
        if (isPaused || isGameOver || currentPiece.type === 'O') return;
        const m = currentPiece.matrix, n = m.length;
        const nm = m.map((row, i) => row.map((_, j) => dir === 1 ? m[n - 1 - j][i] : m[j][n - 1 - i]));
        const nextRot = (currentPiece.rotation + dir + 4) % 4;
        const kickType = currentPiece.type === 'I' ? 'I' : 'JLSTZ';
        const kicks = KICK_DATA[kickType][`${currentPiece.rotation}-${nextRot}`] || [[0, 0]];

        for (const [kx, ky] of kicks) {
            if (isValid(currentPiece, kx, -ky, nm)) {
                currentPiece.x += kx; currentPiece.y -= ky;
                currentPiece.matrix = nm; currentPiece.rotation = nextRot;
                return;
            }
        }
    }

    function move(dx) { if (isValid(currentPiece, dx, 0)) currentPiece.x += dx; }
    function softDrop() { if (isValid(currentPiece, 0, 1)) { currentPiece.y++; dropCounter = 0; } else { lockPiece(); } }
    function hardDrop() { while (isValid(currentPiece, 0, 1)) currentPiece.y++; lockPiece(); }

    function lockPiece() {
        currentPiece.matrix.forEach((row, y) => row.forEach((val, x) => {
            if (val) {
                if (currentPiece.y + y < 0) isGameOver = true;
                else grid[currentPiece.y + y][currentPiece.x + x] = currentPiece.type;
            }
        }));
        clearLines();
        if (!isGameOver) {
            if (gameMode === 'BIG_BANG' && grid.every(r => r.every(c => c !== 'PUZZLE'))) {
                bigBangStage++;
                if (bigBangStage > 10) isGameOver = true; else generateBigBangPuzzle();
            }
            spawnPiece();
        }
    }

    function clearLines() {
        let cleared = 0;
        outer: for (let y = ROWS - 1; y >= 0; y--) {
            for (let x = 0; x < COLS; x++) if (grid[y][x] === 0) continue outer;
            grid.splice(y, 1); grid.unshift(Array(COLS).fill(0)); cleared++; y++;
        }
        if (cleared > 0) {
            lines += cleared; score += [0, 100, 300, 500, 800][cleared] * level;
            if (gameMode === 'NORMAL') { level = Math.floor(lines / 10) + 1; dropInterval = Math.max(100, 1000 - (level - 1) * 50); }
            if (gameMode === '40_LINES' && lines >= 40) isGameOver = true;
        }
    }

    function generateBigBangPuzzle() {
        grid = createEmptyGrid();
        const hole = Math.floor(Math.random() * 7);
        for (let y = ROWS - 1; y >= ROWS - 4; y--) {
            for (let x = 0; x < COLS; x++) {
                if (x < hole || x > hole + 3) grid[y][x] = 'PUZZLE';
            }
        }
    }

    function hold() {
        if (!canHold || isPaused || isGameOver) return;
        const oldType = holdPiece; holdPiece = currentPiece.type;
        if (oldType) {
            currentPiece = { type: oldType, matrix: SHAPES[oldType], rotation: 0,
                x: Math.floor(COLS / 2) - Math.floor(SHAPES[oldType][0].length / 2), y: oldType === 'I' ? -1 : 0 };
        } else { spawnPiece(); }
        canHold = false;
    }

    // -----------------
    // 4. 描画
    // -----------------
    function drawBlock(c, x, y, color, size = BLOCK_SIZE) {
        c.fillStyle = color; c.fillRect(x * size, y * size, size, size);
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.strokeRect(x * size, y * size, size, size);
    }

    function drawSide(c, type) {
        c.clearRect(0, 0, 120, 120);
        if (!type) return;
        const m = SHAPES[type];
        const ox = (type === 'I' || type === 'O') ? 0 : 0.5;
        m.forEach((row, y) => row.forEach((v, x) => {
            if (v) drawBlock(c, x + ox, y + 0.5, COLORS[type], SIDE_BLOCK_SIZE);
        }));
    }

    function draw() {
        ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
        grid.forEach((row, y) => row.forEach((v, x) => { if (v) drawBlock(ctx, x, y, COLORS[v]); }));
        
        if (currentPiece && !isGameOver) {
            const ghost = { ...currentPiece };
            while (isValid(ghost, 0, 1)) ghost.y++;
            ghost.matrix.forEach((row, y) => row.forEach((v, x) => { if (v) drawBlock(ctx, ghost.x + x, ghost.y + y, COLORS.GHOST); }));
            currentPiece.matrix.forEach((row, y) => row.forEach((v, x) => { if (v) drawBlock(ctx, currentPiece.x + x, currentPiece.y + y, COLORS[currentPiece.type]); }));
        }

        scoreDisplay.textContent = score; 
        linesDisplay.textContent = lines;
        levelDisplay.textContent = (gameMode === 'BIG_BANG') ? bigBangStage : level;
        if (gameMode !== 'NORMAL') timeDisplay.textContent = (timer / 1000).toFixed(2);

        drawSide(holdCtx, holdPiece);
        nextCtxs.forEach((c, i) => drawSide(c, nextPieces[i]));
    }

    // -----------------
    // 5. ループ・入力
    // -----------------
    function handleGamepad() {
        const gp = navigator.getGamepads()[0]; if (!gp || isPaused || isGameOver) return;
        const now = Date.now();
        const check = (idx, cb, ms = 200) => {
            if (gp.buttons[idx]?.pressed) { if (!inputState.buttons[idx] || now - inputState.buttons[idx] > ms) { cb(); inputState.buttons[idx] = now; } }
            else inputState.buttons[idx] = null;
        };
        check(14, () => move(-1), 120); check(15, () => move(1), 120); check(13, () => softDrop(), 80);
        check(0, () => rotate(1)); check(2, () => rotate(-1)); check(3, () => hardDrop()); check(4, () => hold());
    }

    function update(time = 0) {
        if (isGameOver) { showResult(); return; }
        if (!isPaused) {
            const dt = time - lastTime; lastTime = time;
            dropCounter += dt; if (dropCounter > dropInterval) softDrop();
            handleGamepad(); draw();
        }
        animationFrameId = requestAnimationFrame(update);
    }

    function showResult() {
        clearInterval(timerInterval);
        resultScreen.style.display = 'flex';
        document.getElementById('result-score').textContent = score;
        document.getElementById('result-lines').textContent = lines;
        document.getElementById('result-time').textContent = (timer / 1000).toFixed(2);
        document.getElementById('result-time-row').style.display = (gameMode === 'NORMAL') ? 'none' : 'block';
    }

    function startGame(mode) {
        grid = createEmptyGrid(); score = 0; lines = 0; level = 1; timer = 0; bigBangStage = 1;
        nextPieces = []; holdPiece = null; isGameOver = false; isPaused = false; gameMode = mode;
        dropInterval = 1000; dropCounter = 0; lastTime = performance.now();
        
        // タイム表示の制御
        timeContainer.style.display = (mode === 'NORMAL') ? 'none' : 'block';
        
        if (mode === 'BIG_BANG') generateBigBangPuzzle();
        spawnPiece();
        
        clearInterval(timerInterval);
        if (mode !== 'NORMAL') {
            timerInterval = setInterval(() => { if(!isPaused) timer += 10; }, 10);
        }
        
        menuScreen.classList.remove('active'); 
        gameScreen.classList.add('active'); 
        resultScreen.style.display = 'none';
        update();
    }

    // -----------------
    // 6. 初期化
    // -----------------
    function init() {
        document.getElementById('start-normal').onclick = () => startGame('NORMAL');
        document.getElementById('start-40lines').onclick = () => startGame('40_LINES');
        document.getElementById('start-bigbang').onclick = () => startGame('BIG_BANG');
        document.getElementById('retry-button').onclick = () => startGame(gameMode);
        document.getElementById('menu-button').onclick = () => location.reload();

        // モバイル回転ボタン
        document.getElementById('rotate-left-btn').onclick = () => rotate(-1);
        document.getElementById('rotate-right-btn').onclick = () => rotate(1);

        document.onkeydown = (e) => {
            if (e.code === 'Escape') { isPaused = !isPaused; pauseOverlay.style.display = isPaused ? 'flex' : 'none'; }
            if (isPaused || isGameOver) return;
            switch(e.code) {
                case 'ArrowLeft': move(-1); break;
                case 'ArrowRight': move(1); break;
                case 'ArrowDown': softDrop(); break;
                case 'ArrowUp': rotate(1); break;
                case 'KeyZ': rotate(-1); break;
                case 'Space': e.preventDefault(); hardDrop(); break;
                case 'KeyC': hold(); break;
            }
        };

        // スワイプ操作
        gameScreen.ontouchstart = (e) => { inputState.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
        gameScreen.ontouchend = (e) => {
            if (!inputState.touchStart || isPaused) return;
            const dx = e.changedTouches[0].clientX - inputState.touchStart.x;
            const dy = e.changedTouches[0].clientY - inputState.touchStart.y;
            if (Math.abs(dx) > Math.abs(dy)) { if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1); } 
            else { if (dy > 50) hardDrop(); else if (dy < -50) hold(); }
            inputState.touchStart = null;
        };

        menuScreen.classList.add('active');
    }

    init();
});