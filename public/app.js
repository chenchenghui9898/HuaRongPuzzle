/**
 * App — Main orchestration: events, state, screen transitions.
 */
(function () {
  'use strict';

  // --- DOM References ---
  var setupScreen = document.getElementById('setup-screen');
  var gameScreen = document.getElementById('game-screen');
  var victoryOverlay = document.getElementById('victory-overlay');
  var puzzleGrid = document.getElementById('puzzle-grid');
  var confettiCanvas = document.getElementById('confetti-canvas');

  var setupContent = document.getElementById('setup-content');
  var setupSubtitle = document.getElementById('setup-subtitle');
  var uploadArea = document.getElementById('upload-area');
  var imageInput = document.getElementById('image-input');
  var uploadPlaceholder = document.getElementById('upload-placeholder');
  var imagePreview = document.getElementById('image-preview');
  var btnStart = document.getElementById('btn-start');
  var loadingShared = document.getElementById('loading-shared');
  var difficultyButtons = document.getElementById('difficulty-buttons');
  var puzzleNameInput = document.getElementById('puzzle-name-input');
  var resumePrompt = document.getElementById('resume-prompt');
  var resumeDetail = document.getElementById('resume-detail');
  var btnResumeContinue = document.getElementById('btn-resume-continue');
  var btnResumeFresh = document.getElementById('btn-resume-fresh');

  var btnBack = document.getElementById('btn-back');
  var btnRestart = document.getElementById('btn-restart');
  var btnShare = document.getElementById('btn-share');
  var btnLeaderboard = document.getElementById('btn-leaderboard');
  var btnCreatePuzzleGame = document.getElementById('btn-create-puzzle-game');
  var btnAgain = document.getElementById('btn-again');
  var btnRestartWin = document.getElementById('btn-restart-win');
  var btnShareWin = document.getElementById('btn-share-win');
  var btnSubmitScore = document.getElementById('btn-submit-score');
  var btnLeaderboardWin = document.getElementById('btn-leaderboard-win');
  var btnCreateOwn = document.getElementById('btn-create-own');
  var playerNameInput = document.getElementById('player-name-input');
  var victoryNameSection = document.getElementById('victory-name-section');
  var victorySavedMsg = document.getElementById('victory-saved-msg');
  var victoryCompletedImage = document.getElementById('victory-completed-image');
  var moveCounter = document.getElementById('move-counter');
  var timerEl = document.getElementById('timer');
  var victoryTime = document.getElementById('victory-time');
  var victoryMoves = document.getElementById('victory-moves');
  var puzzleNameDisplay = document.getElementById('puzzle-name-display');
  var gameHint = document.getElementById('game-hint');
  var toast = document.getElementById('toast');
  var toastMsg = document.getElementById('toast-msg');

  // --- Game State ---
  var gameState = {
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
    timerStarted: false,
    completionSubmitted: false,
  };

  // --- Progress Cache (localStorage) ---
  function progressKey(pid) {
    return 'klotski_progress_' + pid;
  }

  function saveProgress() {
    if (!gameState.puzzleId || !gameState.currentState) return;
    try {
      var data = {
        s: gameState.currentState,       // 2D array
        e: gameState.emptyPos,
        t: gameState.elapsedSeconds,
        m: gameState.moveCount,
        ts: gameState.timerStarted,
        gs: gameState.gridSize,
        hn: gameState.hiddenTileNum,
        tm: Date.now()
      };
      localStorage.setItem(progressKey(gameState.puzzleId), JSON.stringify(data));
    } catch (e) { /* quota exceeded — ignore */ }
  }

  function loadProgress(pid) {
    try {
      var raw = localStorage.getItem(progressKey(pid));
      if (!raw) return null;
      var data = JSON.parse(raw);
      // Validate essential fields
      if (!data.s || !data.e) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clearProgress(pid) {
    try {
      localStorage.removeItem(progressKey(pid));
    } catch (e) { /* ignore */ }
  }

  // --- Initialize ---
  function init() {
    Confetti.init(confettiCanvas);

    // Event delegation on the puzzle grid
    puzzleGrid.addEventListener('click', function (e) {
      var tile = e.target.closest('.tile');
      if (!tile) return;
      if (tile.classList.contains('empty') || tile.classList.contains('no-hover')) return;
      var row = parseInt(tile.dataset.row, 10);
      var col = parseInt(tile.dataset.col, 10);
      if (!isNaN(row) && !isNaN(col)) {
        handleTileClick(row, col);
      }
    });

    // Setup listeners
    uploadArea.addEventListener('click', function () { imageInput.click(); });
    imageInput.addEventListener('change', handleImageSelect);
    btnStart.addEventListener('click', startGame);
    btnBack.addEventListener('click', backToSetup);
    btnRestart.addEventListener('click', restartPuzzle);
    btnRestartWin.addEventListener('click', restartPuzzle);
    btnShare.addEventListener('click', sharePuzzle);
    btnAgain.addEventListener('click', backToSetup);
    btnShareWin.addEventListener('click', sharePuzzle);
    btnSubmitScore.addEventListener('click', submitScore);
    btnLeaderboard.addEventListener('click', openLeaderboard);
    btnLeaderboardWin.addEventListener('click', openLeaderboard);
    btnCreatePuzzleGame.addEventListener('click', goToSetup);
    btnCreateOwn.addEventListener('click', goToSetup);
    btnResumeContinue.addEventListener('click', resumeContinue);
    btnResumeFresh.addEventListener('click', resumeFresh);

    // Difficulty buttons
    difficultyButtons.addEventListener('click', function (e) {
      var btn = e.target.closest('.diff-btn');
      if (!btn) return;
      document.querySelectorAll('.diff-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      gameState.gridSize = parseInt(btn.dataset.size, 10);
    });

    // Window resize
    var resizeTimeout;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        if (gameScreen.classList.contains('active') && gameState.currentState) {
          refreshGridDisplay();
        }
      }, 200);
    });
  }

  // --- Parse puzzle ID from URL ---
  function getPuzzleIdFromUrl() {
    var qp = null;
    try {
      qp = new URLSearchParams(window.location.search).get('puzzle');
    } catch (e) {
      var raw = window.location.search.replace(/^\?/, '');
      var pairs = raw.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var kv = pairs[i].split('=');
        if (decodeURIComponent(kv[0]) === 'puzzle') qp = decodeURIComponent(kv[1] || '');
      }
    }
    if (qp && qp.trim()) return qp.trim();

    var path = window.location.pathname.replace(/\/+$/, '');
    var parts = path.split('/');
    var pi = parts.indexOf('puzzle');
    if (pi >= 0 && pi + 1 < parts.length) {
      var pid = parts[pi + 1];
      if (pid && pid.trim()) return pid.trim();
    }

    var hash = window.location.hash;
    if (hash) {
      try {
        var hp = new URLSearchParams(hash.replace(/^#/, ''));
        var hid = hp.get('puzzle');
        if (hid && hid.trim()) return hid.trim();
      } catch (e) {}
    }

    return null;
  }

  // --- Image Upload ---
  function handleImageSelect(e) {
    var file = e.target.files[0];
    if (!file) return;

    gameState.imageFile = file;
    gameState.readonly = false;
    gameState.originalImageUrl = null;

    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
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

  // --- Show loading-only mode for shared puzzles ---
  function showSharedLoading() {
    loadingShared.style.display = 'flex';
    setupContent.style.display = 'none';
    setupSubtitle.style.display = 'none';
    btnStart.style.display = 'none';
    resumePrompt.style.display = 'none';
  }

  function hideSharedLoading() {
    loadingShared.style.display = 'none';
    setupContent.style.display = '';
    setupSubtitle.style.display = '';
    btnStart.style.display = '';
  }

  // --- Start Game (user-uploaded image) ---
  function startGame() {
    if (!gameState.imageElement) return;

    var gs = gameState.gridSize;
    gameState.hiddenTileNum = gs * gs - 1;
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;

    var nameVal = puzzleNameInput.value.trim();
    gameState.puzzleName = nameVal || 'HuaRongImage';

    gameState.tileDataUrls = PuzzleEngine.cutImageToTiles(gameState.imageElement, gs);
    gameState.solvedState = PuzzleEngine.createSolvedState(gs);
    var numMoves = gs * gs * 20;
    var shuffled = PuzzleEngine.shuffleWithLegalMoves(gameState.solvedState, numMoves);

    gameState.currentState = shuffled.state;
    gameState.emptyPos = shuffled.emptyPos;
    gameState.shuffleMoves = shuffled.moves;
    gameState.puzzleId = null;

    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');
    victoryOverlay.classList.remove('active');

    hideSharedLoading();
    puzzleNameDisplay.textContent = gameState.puzzleName;
    puzzleGrid.setAttribute('data-size', String(gs));
    Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
    Renderer.updateMoveCounter(0);
    Renderer.updateTimer(0);
    gameHint.textContent = '点击空格旁边的图块来移动';
  }

  // --- Restart Puzzle (clear progress + fetch fresh) ---
  async function restartPuzzle() {
    stopTimer();
    Confetti.stop();
    victoryOverlay.classList.remove('active');

    if (gameState.puzzleId) {
      clearProgress(gameState.puzzleId);

      // Re-fetch from API to get fresh shuffle
      gameState.moveCount = 0;
      gameState.elapsedSeconds = 0;
      gameState.timerStarted = false;
      gameState.completionSubmitted = false;

      try {
        var data = await API.loadPuzzle(gameState.puzzleId);
        gameState.shuffleMoves = data.moves;
        gameState.hiddenTileNum = data.hiddenIndex;
        gameState.solvedState = PuzzleEngine.createSolvedState(gameState.gridSize);
        var reconstructed = PuzzleEngine.replayMoves(gameState.solvedState, data.moves);
        gameState.currentState = reconstructed.state;
        gameState.emptyPos = reconstructed.emptyPos;

      } catch (err) {
        // Fallback: re-shuffle client-side
        var shuffled = PuzzleEngine.shuffleWithLegalMoves(gameState.solvedState, gameState.gridSize * gameState.gridSize * 20);
        gameState.currentState = shuffled.state;
        gameState.emptyPos = shuffled.emptyPos;
        gameState.shuffleMoves = shuffled.moves;
      }

      gameScreen.classList.add('active');
      setupScreen.classList.remove('active');
      victoryOverlay.classList.remove('active');

      puzzleGrid.setAttribute('data-size', String(gameState.gridSize));
      Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
      Renderer.updateMoveCounter(0);
      Renderer.updateTimer(0);
      gameHint.textContent = '点击空格旁边的图块来移动';

      saveProgress();
    }
  }

  // --- Load Shared Puzzle ---
  async function loadSharedPuzzle(puzzleId) {
    showSharedLoading();

    try {
      var data = await API.loadPuzzle(puzzleId);

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
      var img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise(function (resolve, reject) {
        img.onload = resolve;
        img.onerror = function () { reject(new Error('Failed to load image')); };
        img.src = data.imageUrl;
      });

      gameState.imageElement = img;
      gameState.imageFile = null;

      var gs = data.gridSize;
      gameState.tileDataUrls = PuzzleEngine.cutImageToTiles(img, gs);
      gameState.solvedState = PuzzleEngine.createSolvedState(gs);

      // Check for saved progress (only for this puzzleId)
      var saved = loadProgress(puzzleId);

      if (saved && saved.m > 0) {
        // Progress exists — show resume prompt
        var m = Math.floor(saved.t / 60);
        var s = saved.t % 60;
        var timeStr = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        resumeDetail.textContent = '已用 ' + timeStr + ' · 步数 ' + saved.m;
        hideSharedLoading();
        resumePrompt.style.display = 'block';
        setupContent.style.display = 'none';
        setupSubtitle.style.display = 'none';
        btnStart.style.display = 'none';
        document.querySelectorAll('.diff-btn').forEach(function (b) {
          b.classList.toggle('active', parseInt(b.dataset.size, 10) === gs);
        });
        return;
      }

      // No saved progress — start fresh
      var reconstructed = PuzzleEngine.replayMoves(gameState.solvedState, data.moves);
      gameState.currentState = reconstructed.state;
      gameState.emptyPos = reconstructed.emptyPos;

      document.querySelectorAll('.diff-btn').forEach(function (b) {
        b.classList.toggle('active', parseInt(b.dataset.size, 10) === gs);
      });

      setupScreen.classList.remove('active');
      gameScreen.classList.add('active');
      victoryOverlay.classList.remove('active');

      hideSharedLoading();
      puzzleNameDisplay.textContent = gameState.puzzleName;
      puzzleGrid.setAttribute('data-size', String(gs));
      Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
      Renderer.updateMoveCounter(0);
      Renderer.updateTimer(0);
      gameHint.textContent = '点击空格旁边的图块来移动';

    } catch (err) {
      hideSharedLoading();
      loadingShared.style.display = 'none';
      showToast('加载拼图失败: ' + err.message);
      window.history.replaceState({}, '', '/');
    }
  }

  // --- Resume progress ---
  function resumeContinue() {
    var saved = loadProgress(gameState.puzzleId);
    if (!saved) {
      // Fallback: start fresh
      resumeFresh();
      return;
    }

    gameState.currentState = saved.s;
    gameState.emptyPos = saved.e;
    gameState.moveCount = saved.m;
    gameState.elapsedSeconds = saved.t;
    gameState.timerStarted = saved.ts;
    gameState.gridSize = saved.gs;
    gameState.hiddenTileNum = saved.hn;
    gameState.completionSubmitted = false;

    var gs = saved.gs;
    puzzleNameDisplay.textContent = gameState.puzzleName;

    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');
    victoryOverlay.classList.remove('active');

    resumePrompt.style.display = 'none';
    hideSharedLoading();

    puzzleGrid.setAttribute('data-size', String(gs));
    Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
    Renderer.updateMoveCounter(gameState.moveCount);
    Renderer.updateTimer(gameState.elapsedSeconds);

    // If timer was running, resume it
    if (gameState.timerStarted) {
      gameState.startTime = Date.now() - gameState.elapsedSeconds * 1000;
      stopTimer();
      gameState.timerInterval = setInterval(function () {
        gameState.elapsedSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
        Renderer.updateTimer(gameState.elapsedSeconds);
        saveProgress(); // periodic save
      }, 1000);
    }

    gameHint.textContent = '点击空格旁边的图块来移动';
  }

  function resumeFresh() {
    clearProgress(gameState.puzzleId);

    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;

    var gs = gameState.gridSize;
    var reconstructed = PuzzleEngine.replayMoves(gameState.solvedState, gameState.shuffleMoves);
    gameState.currentState = reconstructed.state;
    gameState.emptyPos = reconstructed.emptyPos;

    resumePrompt.style.display = 'none';
    hideSharedLoading();

    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');
    victoryOverlay.classList.remove('active');

    puzzleNameDisplay.textContent = gameState.puzzleName;
    puzzleGrid.setAttribute('data-size', String(gs));
    Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
    Renderer.updateMoveCounter(0);
    Renderer.updateTimer(0);
    gameHint.textContent = '点击空格旁边的图块来移动';
  }

  // --- Tile Click Handler ---
  function handleTileClick(row, col) {
    if (gameState.isAnimating) return;

    if (!PuzzleEngine.isTileAdjacent(row, col, gameState.emptyPos.row, gameState.emptyPos.col)) {
      return;
    }

    if (!gameState.timerStarted) {
      startTimer();
      gameState.timerStarted = true;
    }

    gameState.isAnimating = true;

    gameState.currentState = PuzzleEngine.moveTile(
      gameState.currentState,
      { row: row, col: col },
      gameState.emptyPos
    );
    gameState.emptyPos = { row: row, col: col };
    gameState.moveCount++;

    Renderer.updateTilePositions(gameState.currentState, gameState.emptyPos);
    Renderer.updateMoveCounter(gameState.moveCount);

    // Save progress to localStorage
    saveProgress();

    setTimeout(function () {
      gameState.isAnimating = false;

      if (PuzzleEngine.checkWin(gameState.currentState, gameState.solvedState)) {
        handleVictory();
      }
    }, 220);
  }

  // --- Victory ---
  function handleVictory() {
    stopTimer();
    // Clear saved progress on victory
    if (gameState.puzzleId) clearProgress(gameState.puzzleId);

    Renderer.revealHiddenTile(gameState.currentState, gameState.emptyPos);
    Renderer.lockTiles();
    gameHint.textContent = '';

    setTimeout(function () {
      victoryTime.textContent = formatTime(gameState.elapsedSeconds);
      victoryMoves.textContent = String(gameState.moveCount);

      if (gameState.imageElement) {
        victoryCompletedImage.src = gameState.imageElement.src;
        victoryCompletedImage.style.display = 'block';
      }

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

    var playerName = playerNameInput.value.trim() || '匿名玩家';

    if (!gameState.puzzleId) {
      try {
        if (!gameState.imageFile && gameState.readonly) {
          showToast('无法提交成绩：拼图信息缺失');
          return;
        }
        if (!gameState.imageFile) {
          var response = await fetch(gameState.originalImageUrl);
          var blob = await response.blob();
          gameState.imageFile = new File([blob], 'puzzle-image.jpg', { type: blob.type });
        }
        var result = await API.savePuzzle(
          gameState.imageFile, gameState.gridSize, gameState.shuffleMoves,
          gameState.hiddenTileNum, gameState.puzzleName
        );
        gameState.puzzleId = result.puzzleId;
        window.history.replaceState({}, '', '/?puzzle=' + result.puzzleId);
      } catch (err) {
        showToast('提交失败: ' + err.message);
        return;
      }
    }

    btnSubmitScore.disabled = true;
    btnSubmitScore.textContent = '⏳ 提交中...';

    try {
      await API.saveCompletion(gameState.puzzleId, playerName, gameState.elapsedSeconds, gameState.moveCount);
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
    window.open('/leaderboard.html?puzzle=' + gameState.puzzleId, '_blank');
  }

  // --- Timer ---
  function startTimer() {
    stopTimer();
    gameState.startTime = Date.now();
    gameState.elapsedSeconds = 0;
    Renderer.updateTimer(0);

    gameState.timerInterval = setInterval(function () {
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
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // --- Clipboard (polyfill for older browsers / Baidu etc.) ---
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyWithExecCommand(text);
      });
    }
    return copyWithExecCommand(text);
  }

  function copyWithExecCommand(text) {
    return new Promise(function (resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed'; textarea.style.top = '0'; textarea.style.left = '0';
      textarea.style.width = '2em'; textarea.style.height = '2em';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);

      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        textarea.contentEditable = 'true';
        textarea.readOnly = false;
        var range = document.createRange();
        range.selectNodeContents(textarea);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        textarea.setSelectionRange(0, text.length);
      } else {
        textarea.select();
        textarea.setSelectionRange(0, text.length);
      }

      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      document.body.removeChild(textarea);
      if (ok) resolve();
      else reject(new Error('execCommand failed'));
    });
  }

  // --- Share ---
  async function sharePuzzle() {
    btnShare.disabled = true;
    btnShare.textContent = '⏳ ...';

    try {
      var puzzleId = gameState.puzzleId;

      if (!puzzleId) {
        if (!gameState.imageFile && gameState.readonly) {
          showToast('此拼图已可分享，请复制当前页面链接');
          return;
        }
        if (!gameState.imageFile) {
          var response = await fetch(gameState.originalImageUrl);
          var blob = await response.blob();
          gameState.imageFile = new File([blob], 'puzzle-image.jpg', { type: blob.type });
        }
        var result = await API.savePuzzle(
          gameState.imageFile, gameState.gridSize, gameState.shuffleMoves,
          gameState.hiddenTileNum, gameState.puzzleName
        );
        puzzleId = result.puzzleId;
        gameState.puzzleId = puzzleId;
      }

      var shareUrl = window.location.origin + '/?puzzle=' + puzzleId;

      try {
        await copyToClipboard(shareUrl);
        showToast('✅ 分享链接已复制到剪贴板！');
      } catch (clipErr) {
        showToast('📋 请手动复制: ' + shareUrl, 8000);
      }

      window.history.replaceState({}, '', '/?puzzle=' + puzzleId);
    } catch (err) {
      showToast('分享失败: ' + err.message);
    } finally {
      btnShare.disabled = false;
      btnShare.textContent = '🔗';
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

    hideSharedLoading();
    resumePrompt.style.display = 'none';
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

  function goToSetup() {
    if (gameScreen.classList.contains('active')) stopTimer();
    Confetti.stop();
    victoryOverlay.classList.remove('active');
    gameScreen.classList.remove('active');
    setupScreen.classList.add('active');
    puzzleGrid.innerHTML = '';

    window.history.replaceState({}, '', '/');

    hideSharedLoading();
    resumePrompt.style.display = 'none';
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
    Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
    Renderer.updateMoveCounter(gameState.moveCount);
    Renderer.updateTimer(gameState.elapsedSeconds);

    if (PuzzleEngine.checkWin(gameState.currentState, gameState.solvedState)) {
      Renderer.revealHiddenTile(gameState.currentState, gameState.emptyPos);
      Renderer.lockTiles();
    }
  }

  // --- Toast ---
  var toastTimeout;

  function showToast(msg, duration) {
    toastMsg.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      toast.classList.remove('show');
    }, duration || 3000);
  }

  // --- Boot (readyState check: safe on slow mobile browsers) ---
  function boot() {
    if (!window.PuzzleEngine || !window.API || !window.Renderer || !window.Confetti) {
      setTimeout(boot, 100);
      return;
    }
    init();
    var puzzleId = getPuzzleIdFromUrl();
    if (puzzleId) {
      loadSharedPuzzle(puzzleId);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
