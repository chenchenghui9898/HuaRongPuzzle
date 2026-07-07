/**
 * App — Main orchestration: events, state, screen transitions.
 */
(function () {
  'use strict';

  // --- DOM References ---
  const setupScreen = document.getElementById('setup-screen');
  const gameScreen = document.getElementById('game-screen');
  const victoryOverlay = document.getElementById('victory-overlay');
  const puzzleGrid = document.getElementById('puzzle-grid');
  const confettiCanvas = document.getElementById('confetti-canvas');

  const uploadArea = document.getElementById('upload-area');
  const imageInput = document.getElementById('image-input');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const imagePreview = document.getElementById('image-preview');
  const btnStart = document.getElementById('btn-start');
  const loadingShared = document.getElementById('loading-shared');
  const difficultyButtons = document.getElementById('difficulty-buttons');
  const puzzleNameInput = document.getElementById('puzzle-name-input');

  const btnBack = document.getElementById('btn-back');
  const btnShare = document.getElementById('btn-share');
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  const btnCreatePuzzleGame = document.getElementById('btn-create-puzzle-game');
  const btnAgain = document.getElementById('btn-again');
  const btnShareWin = document.getElementById('btn-share-win');
  const btnSubmitScore = document.getElementById('btn-submit-score');
  const btnLeaderboardWin = document.getElementById('btn-leaderboard-win');
  const btnCreateOwn = document.getElementById('btn-create-own');
  const playerNameInput = document.getElementById('player-name-input');
  const victoryNameSection = document.getElementById('victory-name-section');
  const victorySavedMsg = document.getElementById('victory-saved-msg');
  const victoryCompletedImage = document.getElementById('victory-completed-image');
  const moveCounter = document.getElementById('move-counter');
  const timerEl = document.getElementById('timer');
  const victoryTime = document.getElementById('victory-time');
  const victoryMoves = document.getElementById('victory-moves');
  const puzzleNameDisplay = document.getElementById('puzzle-name-display');
  const gameHint = document.getElementById('game-hint');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');

  // --- Game State ---
  const gameState = {
    imageFile: null,
    imageElement: null,
    gridSize: 4,
    tileDataUrls: [],
    solvedState: null,
    currentState: null,
    emptyPos: null,
    hiddenTileNum: -1,
    moveCount: 0,
    startTime: null,
    timerInterval: null,
    elapsedSeconds: 0,
    puzzleId: null,
    puzzleName: 'HuaRongImage',
    shuffleMoves: [],
    isAnimating: false,
    readonly: false,
    originalImageUrl: null,
    timerStarted: false,       // Timer starts on first move
    completionSubmitted: false, // Avoid duplicate submissions
  };

  // --- Initialize ---
  function init() {
    Confetti.init(confettiCanvas);

    // Event delegation on the puzzle grid
    puzzleGrid.addEventListener('click', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile) return;
      if (tile.classList.contains('empty') || tile.classList.contains('no-hover')) return;
      const row = parseInt(tile.dataset.row, 10);
      const col = parseInt(tile.dataset.col, 10);
      if (!isNaN(row) && !isNaN(col)) {
        handleTileClick(row, col);
      }
    });

    // Setup listeners
    uploadArea.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleImageSelect);
    btnStart.addEventListener('click', startGame);
    btnBack.addEventListener('click', backToSetup);
    btnShare.addEventListener('click', sharePuzzle);
    btnAgain.addEventListener('click', backToSetup);
    btnShareWin.addEventListener('click', sharePuzzle);
    btnSubmitScore.addEventListener('click', submitScore);
    btnLeaderboard.addEventListener('click', openLeaderboard);
    btnLeaderboardWin.addEventListener('click', openLeaderboard);
    btnCreatePuzzleGame.addEventListener('click', goToSetup);
    btnCreateOwn.addEventListener('click', goToSetup);

    // Difficulty buttons
    difficultyButtons.addEventListener('click', (e) => {
      const btn = e.target.closest('.diff-btn');
      if (!btn) return;
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameState.gridSize = parseInt(btn.dataset.size, 10);
    });

    // Window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (gameScreen.classList.contains('active') && gameState.currentState) {
          refreshGridDisplay();
        }
      }, 200);
    });

    // Load shared puzzle from URL
    const params = new URLSearchParams(window.location.search);
    const puzzleId = params.get('puzzle');
    if (puzzleId) {
      loadSharedPuzzle(puzzleId);
    }
  }

  // --- Image Upload ---
  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    gameState.imageFile = file;
    gameState.readonly = false;
    gameState.originalImageUrl = null;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        gameState.imageElement = img;
        imagePreview.src = ev.target.result;
        imagePreview.style.display = 'block';
        uploadPlaceholder.style.display = 'none';
        uploadArea.classList.add('has-image');
        btnStart.disabled = false;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // --- Start Game ---
  function startGame() {
    if (!gameState.imageElement) return;

    const gs = gameState.gridSize;
    gameState.hiddenTileNum = gs * gs - 1;
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;

    // Puzzle name from input (default if empty)
    const nameVal = puzzleNameInput.value.trim();
    gameState.puzzleName = nameVal || 'HuaRongImage';

    // Cut image into tiles
    gameState.tileDataUrls = PuzzleEngine.cutImageToTiles(gameState.imageElement, gs);

    // Create solved state and shuffle
    gameState.solvedState = PuzzleEngine.createSolvedState(gs);
    const numMoves = gs * gs * 20;
    const shuffled = PuzzleEngine.shuffleWithLegalMoves(gameState.solvedState, numMoves);

    gameState.currentState = shuffled.state;
    gameState.emptyPos = shuffled.emptyPos;
    gameState.shuffleMoves = shuffled.moves;
    gameState.puzzleId = null;

    // Switch screens FIRST
    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');
    victoryOverlay.classList.remove('active');

    // Display puzzle name
    puzzleNameDisplay.textContent = gameState.puzzleName;

    // Render
    puzzleGrid.setAttribute('data-size', String(gs));
    Renderer.renderGrid(
      puzzleGrid,
      gameState.currentState,
      gameState.emptyPos,
      gameState.tileDataUrls,
      gameState.hiddenTileNum
    );
    Renderer.updateMoveCounter(0);
    Renderer.updateTimer(0);
    gameHint.textContent = '点击空格旁边的图块来移动';

    // DO NOT start timer here — it starts on first move
  }

  // --- Load Shared Puzzle ---
  async function loadSharedPuzzle(puzzleId) {
    loadingShared.style.display = 'flex';
    btnStart.disabled = true;

    try {
      const data = await API.loadPuzzle(puzzleId);

      gameState.gridSize = data.gridSize;
      gameState.hiddenTileNum = data.hiddenIndex;
      gameState.shuffleMoves = data.moves;
      gameState.puzzleId = data.puzzleId;
      gameState.puzzleName = data.name || 'HuaRongImage';
      gameState.moveCount = 0;
      gameState.elapsedSeconds = 0;
      gameState.timerStarted = false;
      gameState.completionSubmitted = false;
      gameState.readonly = true;
      gameState.originalImageUrl = data.imageUrl;

      // Load the image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = data.imageUrl;
      });

      gameState.imageElement = img;
      gameState.imageFile = null;

      // Cut and reconstruct
      const gs = data.gridSize;
      gameState.tileDataUrls = PuzzleEngine.cutImageToTiles(img, gs);
      gameState.solvedState = PuzzleEngine.createSolvedState(gs);

      const reconstructed = PuzzleEngine.replayMoves(gameState.solvedState, data.moves);
      gameState.currentState = reconstructed.state;
      gameState.emptyPos = reconstructed.emptyPos;

      // Difficulty highlight
      document.querySelectorAll('.diff-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.size, 10) === gs);
      });

      // Switch screens FIRST
      setupScreen.classList.remove('active');
      gameScreen.classList.add('active');
      victoryOverlay.classList.remove('active');

      // Display puzzle name
      puzzleNameDisplay.textContent = gameState.puzzleName;

      // Render
      puzzleGrid.setAttribute('data-size', String(gs));
      Renderer.renderGrid(
        puzzleGrid,
        gameState.currentState,
        gameState.emptyPos,
        gameState.tileDataUrls,
        gameState.hiddenTileNum
      );
      Renderer.updateMoveCounter(0);
      Renderer.updateTimer(0);
      gameHint.textContent = '点击空格旁边的图块来移动';
    } catch (err) {
      loadingShared.style.display = 'none';
      btnStart.disabled = false;
      showToast('加载拼图失败: ' + err.message);
      window.history.replaceState({}, '', '/');
    } finally {
      loadingShared.style.display = 'none';
    }
  }

  // --- Tile Click Handler ---
  function handleTileClick(row, col) {
    if (gameState.isAnimating) return;

    const { emptyPos, currentState } = gameState;

    if (!PuzzleEngine.isTileAdjacent(row, col, emptyPos.row, emptyPos.col)) {
      return;
    }

    // Start timer on first move
    if (!gameState.timerStarted) {
      startTimer();
      gameState.timerStarted = true;
    }

    gameState.isAnimating = true;

    gameState.currentState = PuzzleEngine.moveTile(
      gameState.currentState,
      { row, col },
      emptyPos
    );
    gameState.emptyPos = { row, col };
    gameState.moveCount++;

    Renderer.updateTilePositions(gameState.currentState, gameState.emptyPos);
    Renderer.updateMoveCounter(gameState.moveCount);

    setTimeout(() => {
      gameState.isAnimating = false;

      if (PuzzleEngine.checkWin(gameState.currentState, gameState.solvedState)) {
        handleVictory();
      }
    }, 220);
  }

  // --- Victory ---
  function handleVictory() {
    stopTimer();

    Renderer.revealHiddenTile(gameState.currentState, gameState.emptyPos);
    Renderer.lockTiles();
    gameHint.textContent = '';

    setTimeout(() => {
      victoryTime.textContent = formatTime(gameState.elapsedSeconds);
      victoryMoves.textContent = String(gameState.moveCount);

      // Show completed image (use the original imageElement src)
      if (gameState.imageElement) {
        victoryCompletedImage.src = gameState.imageElement.src;
        victoryCompletedImage.style.display = 'block';
      }

      // Reset completion UI
      playerNameInput.value = '';
      victoryNameSection.style.display = 'block';
      btnSubmitScore.style.display = 'inline-block';
      victorySavedMsg.style.display = 'none';
      gameState.completionSubmitted = false;
      victoryOverlay.classList.add('active');
      Confetti.start();
    }, 500);
  }

  // --- Submit Score ---
  async function submitScore() {
    if (gameState.completionSubmitted) return;

    const playerName = playerNameInput.value.trim() || '匿名玩家';

    if (!gameState.puzzleId) {
      // Need to save the puzzle first before recording completion
      try {
        if (!gameState.imageFile && gameState.readonly) {
          showToast('无法提交成绩：拼图信息缺失');
          return;
        }

        if (!gameState.imageFile) {
          const response = await fetch(gameState.originalImageUrl);
          const blob = await response.blob();
          gameState.imageFile = new File([blob], 'puzzle-image.jpg', { type: blob.type });
        }

        const result = await API.savePuzzle(
          gameState.imageFile,
          gameState.gridSize,
          gameState.shuffleMoves,
          gameState.hiddenTileNum,
          gameState.puzzleName
        );
        gameState.puzzleId = result.puzzleId;

        // Also update the URL
        window.history.replaceState({}, '', `/?puzzle=${result.puzzleId}`);
      } catch (err) {
        showToast('提交失败: ' + err.message);
        return;
      }
    }

    btnSubmitScore.disabled = true;
    btnSubmitScore.textContent = '⏳ 提交中...';

    try {
      await API.saveCompletion(
        gameState.puzzleId,
        playerName,
        gameState.elapsedSeconds,
        gameState.moveCount
      );
      gameState.completionSubmitted = true;
      victoryNameSection.style.display = 'none';
      btnSubmitScore.style.display = 'none';
      victorySavedMsg.style.display = 'block';
      showToast('✅ 成绩已记录！');
    } catch (err) {
      btnSubmitScore.disabled = false;
      btnSubmitScore.textContent = '📝 提交成绩';
      showToast('提交失败: ' + err.message);
    }
  }

  // --- Leaderboard ---
  function openLeaderboard() {
    if (!gameState.puzzleId) {
      showToast('请先分享拼图后再查看排行榜');
      return;
    }
    window.open(`/leaderboard.html?puzzle=${gameState.puzzleId}`, '_blank');
  }

  // --- Timer ---
  function startTimer() {
    stopTimer();
    gameState.startTime = Date.now();
    gameState.elapsedSeconds = 0;
    Renderer.updateTimer(0);

    gameState.timerInterval = setInterval(() => {
      gameState.elapsedSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
      Renderer.updateTimer(gameState.elapsedSeconds);
    }, 500);
  }

  function stopTimer() {
    if (gameState.timerInterval) {
      clearInterval(gameState.timerInterval);
      gameState.timerInterval = null;
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // --- Share ---
  async function sharePuzzle() {
    btnShare.disabled = true;
    btnShare.textContent = '⏳ ...';

    try {
      let puzzleId = gameState.puzzleId;

      if (!puzzleId) {
        if (!gameState.imageFile && gameState.readonly) {
          showToast('此拼图已可分享，请复制当前页面链接');
          return;
        }

        if (!gameState.imageFile) {
          const response = await fetch(gameState.originalImageUrl);
          const blob = await response.blob();
          gameState.imageFile = new File([blob], 'puzzle-image.jpg', { type: blob.type });
        }

        const result = await API.savePuzzle(
          gameState.imageFile,
          gameState.gridSize,
          gameState.shuffleMoves,
          gameState.hiddenTileNum,
          gameState.puzzleName
        );
        puzzleId = result.puzzleId;
        gameState.puzzleId = puzzleId;
      }

      const shareUrl = `${window.location.origin}/?puzzle=${puzzleId}`;
      await navigator.clipboard.writeText(shareUrl);
      showToast('✅ 分享链接已复制到剪贴板！');

      window.history.replaceState({}, '', `/?puzzle=${puzzleId}`);
    } catch (err) {
      showToast('分享失败: ' + err.message);
    } finally {
      btnShare.disabled = false;
      btnShare.textContent = '🔗 分享';
    }
  }

  // --- Back to Setup ---
  function backToSetup() {
    stopTimer();
    Confetti.stop();
    victoryOverlay.classList.remove('active');
    gameScreen.classList.remove('active');
    setupScreen.classList.add('active');
    puzzleGrid.innerHTML = '';

    window.history.replaceState({}, '', '/');

    gameState.currentState = null;
    gameState.solvedState = null;
    gameState.tileDataUrls = [];
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.puzzleId = null;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;

    if (!gameState.readonly && gameState.imageElement) {
      btnStart.disabled = false;
    }
  }

  // --- Navigate to Setup (for "I want to create a puzzle" button) ---
  function goToSetup() {
    if (gameScreen.classList.contains('active')) {
      stopTimer();
    }
    Confetti.stop();
    victoryOverlay.classList.remove('active');
    gameScreen.classList.remove('active');
    setupScreen.classList.add('active');
    puzzleGrid.innerHTML = '';

    window.history.replaceState({}, '', '/');

    gameState.currentState = null;
    gameState.solvedState = null;
    gameState.tileDataUrls = [];
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.puzzleId = null;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;
  }

  // --- Refresh grid on resize ---
  function refreshGridDisplay() {
    if (!gameState.currentState) return;
    puzzleGrid.setAttribute('data-size', String(gameState.gridSize));
    Renderer.renderGrid(
      puzzleGrid,
      gameState.currentState,
      gameState.emptyPos,
      gameState.tileDataUrls,
      gameState.hiddenTileNum
    );
    Renderer.updateMoveCounter(gameState.moveCount);
    Renderer.updateTimer(gameState.elapsedSeconds);

    if (PuzzleEngine.checkWin(gameState.currentState, gameState.solvedState)) {
      Renderer.revealHiddenTile(gameState.currentState, gameState.emptyPos);
      Renderer.lockTiles();
    }
  }

  // --- Toast ---
  let toastTimeout;

  function showToast(msg) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', init);
})();
