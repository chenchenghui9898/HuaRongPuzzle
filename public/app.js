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
  var mainNav = document.getElementById('main-nav');

  // New screens
  var squareScreen = document.getElementById('square-screen');
  var roomScreen = document.getElementById('room-screen');
  var roomsScreen = document.getElementById('rooms-screen');

  // Rooms Hub refs
  var roomsHubIdInput = document.getElementById('rooms-hub-id-input');
  var btnRoomsHubJoin = document.getElementById('btn-rooms-hub-join');
  var btnRoomsHubCreate = document.getElementById('btn-rooms-hub-create');
  var roomsHubList = document.getElementById('rooms-hub-list');
  var roomsHubCachedSection = document.getElementById('rooms-hub-cached-section');

  var setupContent = document.getElementById('setup-content');
  var setupSubtitle = document.getElementById('setup-subtitle');
  var uploadArea = document.getElementById('upload-area');
  var imageInput = document.getElementById('image-input');
  var uploadPlaceholder = document.getElementById('upload-placeholder');
  var imagePreview = document.getElementById('image-preview');
  var btnStart = document.getElementById('btn-start');
  var gridOverlay = document.getElementById('grid-overlay');
  var loadingShared = document.getElementById('loading-shared');
  var difficultyButtons = document.getElementById('difficulty-buttons');
  var puzzleNameInput = document.getElementById('puzzle-name-input');
  var publishCheckbox = document.getElementById('publish-to-square');
  var resumePrompt = document.getElementById('resume-prompt');
  var resumeDetail = document.getElementById('resume-detail');
  var btnResumeContinue = document.getElementById('btn-resume-continue');
  var btnResumeFresh = document.getElementById('btn-resume-fresh');

  var btnBack = document.getElementById('btn-back');
  var btnPause = document.getElementById('btn-pause');
  var btnRestart = document.getElementById('btn-restart');
  var btnShare = document.getElementById('btn-share');
  var btnLeaderboard = document.getElementById('btn-leaderboard');
  var btnCreatePuzzleGame = document.getElementById('btn-create-puzzle-game');
  var gameReactions = document.getElementById('game-reactions');
  var btnRose = document.getElementById('btn-rose');
  var btnSlipper = document.getElementById('btn-slipper');
  var roseCountEl = document.getElementById('rose-count');
  var slipperCountEl = document.getElementById('slipper-count');
  var btnAddToRoomGame = document.getElementById('btn-add-to-room-game');

  // Room / Modal refs
  var btnRoomBack = document.getElementById('btn-room-back');
  var btnRoomShare = document.getElementById('btn-room-share');
  var roomAddPuzzleId = document.getElementById('room-add-puzzle-id');
  var btnRoomAddPuzzle = document.getElementById('btn-room-add-puzzle');
  var roomPuzzlesEl = document.getElementById('room-puzzles');
  var roomEmpty = document.getElementById('room-empty');
  var roomName = document.getElementById('room-name');
  var roomPuzzleCount = document.getElementById('room-puzzle-count');
  var roomSelectModal = document.getElementById('room-select-modal');
  var modalRoomList = document.getElementById('modal-room-list');
  var modalRoomIdInput = document.getElementById('modal-room-id-input');
  var btnConfirmAddRoom = document.getElementById('btn-confirm-add-room');
  var btnCancelRoomModal = document.getElementById('btn-cancel-room-modal');

  // Create Room Modal refs
  var createRoomModal = document.getElementById('create-room-modal');
  var createRoomNameInput = document.getElementById('create-room-name-input');
  var btnCreateRoomConfirm = document.getElementById('btn-create-room-confirm');
  var btnCreateRoomCancel = document.getElementById('btn-create-room-cancel');

  var btnRestartWin = document.getElementById('btn-restart-win');
  var btnShareWin = document.getElementById('btn-share-win');
  var btnSubmitScore = document.getElementById('btn-submit-score');
  var btnLeaderboardWin = document.getElementById('btn-leaderboard-win');
  var btnCreateOwn = document.getElementById('btn-create-own');
  var victoryRankLine = document.getElementById('victory-rank-line');
  var victoryRank = document.getElementById('victory-rank');
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
  var pauseOverlay = document.getElementById('pause-overlay');
  var btnPauseResume = document.getElementById('btn-pause-resume');

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
    paused: false,
    pausedAt: null, // Date.now() at pause time, null if not paused
  };

  // Extended app state (non-gameplay)
  var appState = {
    currentRoomId: null,
    reactionCounts: { rose: 0, slipper: 0 },
    referrer: null,       // { screen: 'room'|'square'|'setup', roomId?, scrollY? }
  };

  // --- Reaction state (localStorage anti-spam) ---
  var REACT_KEY = 'klotski_reactions';
  var reactionState = {};

  function loadReactionState() {
    try {
      var raw = localStorage.getItem(REACT_KEY);
      if (raw) reactionState = JSON.parse(raw);
    } catch(e) { reactionState = {}; }
  }

  function saveReactionState() {
    try { localStorage.setItem(REACT_KEY, JSON.stringify(reactionState)); } catch(e) {}
  }

  function hasReacted(puzzleId, type) {
    return !!(reactionState[puzzleId] && reactionState[puzzleId][type]);
  }

  function markReacted(puzzleId, type) {
    if (!reactionState[puzzleId]) reactionState[puzzleId] = {};
    reactionState[puzzleId][type] = true;
    saveReactionState();
  }

  // --- Recent rooms cache ---
  var RECENT_ROOMS_KEY = 'klotski_recent_rooms';

  function getRecentRooms() {
    try {
      var raw = localStorage.getItem(RECENT_ROOMS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function addRecentRoom(roomId, roomName) {
    var rooms = getRecentRooms();
    rooms = rooms.filter(function(r) { return r.id !== roomId; });
    rooms.unshift({ id: roomId, name: roomName });
    if (rooms.length > 10) rooms.length = 10;
    try { localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms)); } catch(e) {}
  }

  // --- Cover Fragment Generation ---
  function generateCoverFragment(imageElement, gridSize) {
    var canvas = document.createElement('canvas');
    var size = 200;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');

    var natW = imageElement.naturalWidth;
    var natH = imageElement.naturalHeight;
    var tileW = natW / gridSize;
    var tileH = natH / gridSize;
    var centerCol = Math.floor(gridSize / 2);
    var centerRow = Math.floor(gridSize / 2);
    var sx = centerCol * tileW;
    var sy = centerRow * tileH;

    ctx.drawImage(imageElement, sx, sy, tileW, tileH, 0, 0, size, size);

    // Try JPEG at quality 0.85; if still > 300KB, reduce quality
    var quality = 0.85;
    var dataUri = canvas.toDataURL('image/jpeg', quality);
    while (dataUri.length > 400000 && quality > 0.3) {
      quality -= 0.15;
      dataUri = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUri;
  }

  // --- Referrer tracking (for back-button context) ---
  var REFERRER_KEY = 'klotski_referrer';

  function saveReferrer(screen, id) {
    var ref = { screen: screen, roomId: id || null, scrollY: window.scrollY || 0, ts: Date.now() };
    try { sessionStorage.setItem(REFERRER_KEY, JSON.stringify(ref)); } catch(e) {}
    appState.referrer = ref;
  }

  function detectReferrer() {
    // Prefer sessionStorage (set before hard navigation) over document.referrer
    try {
      var raw = sessionStorage.getItem(REFERRER_KEY);
      if (raw) {
        var ref = JSON.parse(raw);
        // Only use if it's recent (< 30 seconds)
        if (Date.now() - ref.ts < 30000) return ref;
      }
    } catch(e) {}

    // Fallback: parse document.referrer
    try {
      var refUrl = document.referrer;
      if (refUrl) {
        var path = refUrl.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '') || '/';
        if (path.startsWith('/room/')) return { screen: 'room', roomId: path.split('/room/')[1], scrollY: 0 };
        if (path === '/square') return { screen: 'square', scrollY: 0 };
      }
    } catch(e) {}

    return { screen: 'setup' };
  }

  // --- Grid Overlay on image preview ---
  function drawGridOverlay() {
    if (!gridOverlay || !imagePreview || imagePreview.style.display === 'none') {
      if (gridOverlay) gridOverlay.style.display = 'none';
      return;
    }

    var gs = gameState.gridSize;
    var rect = imagePreview.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    if (w === 0 || h === 0) {
      gridOverlay.style.display = 'none';
      return;
    }

    var dpr = window.devicePixelRatio || 1;
    gridOverlay.width = w * dpr;
    gridOverlay.height = h * dpr;
    gridOverlay.style.width = w + 'px';
    gridOverlay.style.height = h + 'px';
    gridOverlay.style.display = 'block';

    var ctx = gridOverlay.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fill solid background first to prevent pink flash (Mac WeChat GPU quirk)
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
    ctx.lineWidth = 1;

    // Vertical lines
    for (var i = 1; i < gs; i++) {
      var x = (w / gs) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal lines
    for (var j = 1; j < gs; j++) {
      var y = (h / gs) * j;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // --- SPA Routing ---
  function hideAllScreens() {
    setupScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    squareScreen.classList.remove('active');
    roomScreen.classList.remove('active');
    roomsScreen.classList.remove('active');
    victoryOverlay.classList.remove('active');
    if (pauseOverlay) pauseOverlay.classList.remove('active');
    mainNav.style.display = 'flex';
  }

  function getRoute() {
    var path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/room/')) {
      return { screen: 'room', roomId: path.split('/room/')[1] };
    }
    if (path === '/square') return { screen: 'square' };
    if (path === '/rooms') return { screen: 'rooms' };
    return { screen: 'setup' };
  }

  function navigateTo(url) {
    window.history.pushState({}, '', url);
    routeAndRender();
  }

  function updateNavActive(screen) {
    document.querySelectorAll('.nav-link[data-nav]').forEach(function(link) {
      link.classList.toggle('active', link.dataset.nav === screen);
    });
  }

  // --- Progress Cache (localStorage) ---
  function progressKey(pid) {
    return 'klotski_progress_' + pid;
  }

  function saveProgress() {
    if (!gameState.puzzleId || !gameState.currentState) return;
    // Never cache a completed puzzle
    if (gameState.solvedState && PuzzleEngine.checkWin(gameState.currentState, gameState.solvedState)) return;
    try {
      var data = {
        s: gameState.currentState,
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

  // Check if the saved state is already solved (don't resume completed puzzles)
  function isSolvedSaved(saved, solvedState) {
    if (!saved.s || !solvedState) return false;
    for (var r = 0; r < saved.s.length; r++) {
      for (var c = 0; c < saved.s[r].length; c++) {
        if (saved.s[r][c] !== solvedState[r][c]) return false;
      }
    }
    return true;
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
    btnPause.addEventListener('click', pauseGame);
    btnPauseResume.addEventListener('click', resumeGame);
    btnRestart.addEventListener('click', restartPuzzle);
    btnRestartWin.addEventListener('click', restartPuzzle);
    btnShare.addEventListener('click', sharePuzzle);
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
      drawGridOverlay();
    });

    // Reaction buttons
    if (btnRose) btnRose.addEventListener('click', function() { handleReact('rose'); });
    if (btnSlipper) btnSlipper.addEventListener('click', function() { handleReact('slipper'); });
    if (btnAddToRoomGame) btnAddToRoomGame.addEventListener('click', openRoomSelectModal);

    // Room screen buttons
    if (btnRoomBack) btnRoomBack.addEventListener('click', function() { navigateTo('/square'); });
    if (btnRoomShare) btnRoomShare.addEventListener('click', shareRoomLink);
    if (btnRoomAddPuzzle) btnRoomAddPuzzle.addEventListener('click', addPuzzleToRoomFromInput);
    if (btnConfirmAddRoom) btnConfirmAddRoom.addEventListener('click', confirmAddToRoom);
    if (btnCancelRoomModal) btnCancelRoomModal.addEventListener('click', closeRoomModal);
    if (roomSelectModal) {
      roomSelectModal.addEventListener('click', function(e) {
        if (e.target === roomSelectModal) closeRoomModal();
      });
    }
    // Rooms hub buttons
    if (btnRoomsHubJoin) btnRoomsHubJoin.addEventListener('click', joinRoomFromHub);
    if (btnRoomsHubCreate) btnRoomsHubCreate.addEventListener('click', openCreateRoomModal);
    if (roomsHubIdInput) {
      roomsHubIdInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') joinRoomFromHub();
      });
    }

    if (btnCreateRoomConfirm) btnCreateRoomConfirm.addEventListener('click', confirmCreateRoom);
    if (btnCreateRoomCancel) btnCreateRoomCancel.addEventListener('click', closeCreateRoomModal);
    if (createRoomNameInput) {
      createRoomNameInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') confirmCreateRoom();
      });
    }
    if (createRoomModal) {
      createRoomModal.addEventListener('click', function(e) {
        if (e.target === createRoomModal) closeCreateRoomModal();
      });
    }

    // Delegation: room puzzle "play" links → save referrer before navigation
    document.addEventListener('click', function(e) {
      var link = e.target.closest('.room-puzzle-play');
      if (link && link.dataset.refRoom) {
        e.preventDefault();
        saveReferrer('room', link.dataset.refRoom);
        window.location.href = link.href;
      }
    });

    // Load saved reaction state
    loadReactionState();

    // SPA back/forward navigation
    window.addEventListener('popstate', function () {
      stopTimer();
      gameState.paused = false;
      if (pauseOverlay) pauseOverlay.classList.remove('active');
      Confetti.stop();
      victoryOverlay.classList.remove('active');
      gameState.currentState = null;
      gameState.tileDataUrls = [];
      gameReactions.style.display = 'none';
      routeAndRender();
    });

    // Window resize
    var resizeTimeout;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function () {
        if (gameScreen.classList.contains('active') && gameState.currentState) {
          refreshGridDisplay();
        }
        drawGridOverlay();
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

  // --- Image Upload (with auto-compress pipeline) ---
  function handleImageSelect(e) {
    var file = e.target.files[0];
    if (!file) return;

    gameState.readonly = false;
    gameState.originalImageUrl = null;
    gameState.imageFile = file;

    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var needsResize = img.naturalWidth > 2048 || img.naturalHeight > 2048;
        var needsCompress = file.size > 5 * 1024 * 1024;

        if (!needsResize && !needsCompress) {
          // Fast path: no changes needed
          gameState.imageElement = img;
          imagePreview.src = ev.target.result;
          imagePreview.style.display = 'block';
          uploadPlaceholder.style.display = 'none';
          uploadArea.classList.add('has-image');
          btnStart.disabled = false;
          setTimeout(drawGridOverlay, 50);
          return;
        }

        // Step 1: Resize dimensions (fit within 2048px, maintain aspect ratio)
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (needsResize) {
          var ratio = Math.min(2048 / w, 2048 / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        // Step 2: Try WebP first, fallback to JPEG
        function applyCompressedFile(blob) {
          if (!blob || blob.size === 0) {
            // Both WebP and JPEG failed — use original file
            gameState.imageElement = img;
            gameState.imageFile = file;
            imagePreview.src = ev.target.result;
            imagePreview.style.display = 'block';
            uploadPlaceholder.style.display = 'none';
            uploadArea.classList.add('has-image');
            btnStart.disabled = false;
            setTimeout(drawGridOverlay, 50);
            return;
          }

          var ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
          var compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ext), {
            type: blob.type
          });
          gameState.imageFile = compressedFile;

          var previewReader = new FileReader();
          previewReader.onload = function (prev) {
            var previewImg = new Image();
            previewImg.onload = function () {
              gameState.imageElement = previewImg;
              imagePreview.src = prev.target.result;
              imagePreview.style.display = 'block';
              uploadPlaceholder.style.display = 'none';
              uploadArea.classList.add('has-image');
              btnStart.disabled = false;
              setTimeout(drawGridOverlay, 50);
            };
            previewImg.src = prev.target.result;
          };
          previewReader.readAsDataURL(compressedFile);
        }

        canvas.toBlob(function (webpBlob) {
          if (!webpBlob || webpBlob.size === 0) {
            // WebP not supported — fallback to JPEG
            canvas.toBlob(applyCompressedFile, 'image/jpeg', 0.85);
          } else {
            applyCompressedFile(webpBlob);
          }
        }, 'image/webp', 0.85);
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
  async function startGame() {
    if (!gameState.imageElement) return;

    // Self-defense: discard any stale shared-puzzle state
    gameState.readonly = false;
    gameState.puzzleId = null;
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;
    gameState.currentState = null;
    gameState.solvedState = null;
    gameState.tileDataUrls = [];
    gameState.emptyPos = null;

    var gs = gameState.gridSize;
    gameState.hiddenTileNum = gs * gs - 1;

    var nameVal = puzzleNameInput.value.trim();
    gameState.puzzleName = nameVal || 'HuaRongImage';

    gameState.tileDataUrls = PuzzleEngine.cutImageToTiles(gameState.imageElement, gs);
    gameState.solvedState = PuzzleEngine.createSolvedState(gs);
    var numMoves = gs * gs * 20;
    var shuffled = PuzzleEngine.shuffleWithLegalMoves(gameState.solvedState, numMoves);

    gameState.currentState = shuffled.state;
    gameState.emptyPos = shuffled.emptyPos;
    gameState.shuffleMoves = shuffled.moves;

    // Only save immediately if publishing to square — otherwise defer to share
    var publishedToSquare = !!(publishCheckbox && publishCheckbox.checked);
    if (publishedToSquare) {
      btnStart.disabled = true;
      btnStart.textContent = '⏳ 创建中...';
      try {
        // Generate cover fragment — wrap in own try for precise error
        var coverFragment = null;
        try {
          coverFragment = generateCoverFragment(gameState.imageElement, gs);
        } catch (fragErr) {
          console.error('Cover fragment generation failed:', fragErr.message);
          // Non-fatal: proceed without cover, backend will use Cloudinary fallback
        }

        var result = await API.savePuzzle(
          gameState.imageFile, gs, gameState.shuffleMoves,
          gameState.hiddenTileNum, gameState.puzzleName,
          true, coverFragment
        );
        gameState.puzzleId = result.puzzleId;
        window.history.replaceState({}, '', '/?puzzle=' + result.puzzleId);
        showToast('✅ 已发布到拼图广场');
      } catch (err) {
        var msg = err.message || '未知错误';
        console.error('Failed to save puzzle on create:', msg);
        showToast('⚠ 发布广场失败: ' + msg + '，完成拼图后可重新发布');
      } finally {
        btnStart.disabled = false;
        btnStart.textContent = '生成拼图';
      }
    }

    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');
    victoryOverlay.classList.remove('active');
    mainNav.style.display = 'none';
    gameReactions.style.display = 'none';
    if (gridOverlay) gridOverlay.style.display = 'none';

    if (gameState.puzzleId) {
      showReactionBar(0, 0);
    }

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
    gameState.paused = false;
    pauseOverlay.classList.remove('active');
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
      mainNav.style.display = 'none';

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

    // Safety timeout: if the load hangs (slow network/deadlocked promise),
    // revert to setup screen after 20 seconds.
    var loadTimeout = setTimeout(function () {
      if (loadingShared.style.display !== 'none') {
        dbg('dbg-status', 'timeout (20s)', '#f66');
        hideSharedLoading();
        showToast('加载超时，请检查网络后刷新重试');
        window.history.replaceState({}, '', '/');
      }
    }, 20000);

    try {
      var data = await API.loadPuzzle(puzzleId);
      dbg('dbg-status', '200 OK', '#0f0');
      dbg('dbg-pid', data.puzzleId, '#0f0');
      dbg('dbg-retry', '0');

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

      // Show reaction bar for shared puzzles
      showReactionBar(data.roseCount, data.slipperCount);

      // Track where the user came from for the back button
      appState.referrer = detectReferrer();

      // Fetch image via blob → data URL to avoid Canvas CORS taint on old WebViews
      var resp = await fetch(data.imageUrl);
      if (!resp.ok) throw new Error('图片加载失败 HTTP ' + resp.status);
      var blob = await resp.blob();
      var dataUrl = await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('图片读取失败')); };
        reader.readAsDataURL(blob);
      });

      var img = new Image();
      await new Promise(function (resolve, reject) {
        img.onload = resolve;
        img.onerror = function () { reject(new Error('图片解码失败')); };
        img.src = dataUrl;
      });

      gameState.imageElement = img;
      gameState.imageFile = null;

      var gs = data.gridSize;
      gameState.tileDataUrls = PuzzleEngine.cutImageToTiles(img, gs);
      gameState.solvedState = PuzzleEngine.createSolvedState(gs);

      // Check for saved progress (only for this puzzleId)
      var saved = loadProgress(puzzleId);

      if (saved && saved.m > 0 && !isSolvedSaved(saved, gameState.solvedState)) {
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
      mainNav.style.display = 'none';

      hideSharedLoading();
      puzzleNameDisplay.textContent = gameState.puzzleName;
      puzzleGrid.setAttribute('data-size', String(gs));
      Renderer.renderGrid(puzzleGrid, gameState.currentState, gameState.emptyPos, gameState.tileDataUrls, gameState.hiddenTileNum);
      Renderer.updateMoveCounter(0);
      Renderer.updateTimer(0);
      gameHint.textContent = '点击空格旁边的图块来移动';

    } catch (err) {
      dbg('dbg-status', 'error: ' + (err && err.message ? err.message : 'unknown'), '#f66');
      hideSharedLoading();
      // Show retry UI instead of silently redirecting
      loadingShared.style.display = 'none';
      loadingShared.innerHTML = '<div style="text-align:center;color:#f66;padding:8px;"><p style="margin-bottom:12px;">⚠ ' + (err && err.message ? err.message : '加载失败') + '</p><button id="btn-retry-load" style="padding:8px 20px;border:1px solid rgba(255,255,255,0.2);border-radius:10px;background:rgba(255,255,255,0.1);color:#ddd;font-size:0.9rem;cursor:pointer;">🔄 重新加载</button></div>';
      loadingShared.style.display = 'flex';
      document.getElementById('btn-retry-load').addEventListener('click', function () {
        loadSharedPuzzle(puzzleId);
      });
    } finally {
      clearTimeout(loadTimeout);
      loadingShared.style.display = 'none';
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
    mainNav.style.display = 'none';
    gameReactions.style.display = 'flex';

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
    mainNav.style.display = 'none';
    gameReactions.style.display = 'flex';

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

      // Compute and display current rank
      fetchAndDisplayRank();
    }, 500);
  }

  // --- Rank computation ---
  async function fetchAndDisplayRank() {
    victoryRankLine.style.display = 'none';
    if (!gameState.puzzleId) return;

    try {
      var data = await API.getLeaderboard(gameState.puzzleId);
      var entries = data.leaderboard || [];
      var total = entries.length;

      // Compute where this player's score would rank
      var rank = 1;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].timeSeconds < gameState.elapsedSeconds) {
          rank++;
        } else if (entries[i].timeSeconds === gameState.elapsedSeconds && entries[i].moveCount < gameState.moveCount) {
          rank++;
        } else {
          break;
        }
      }

      var effectiveTotal = total + 1; // including current player

      if (rank <= 50) {
        var icon = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : '🏅'));
        victoryRank.textContent = icon + ' ' + rank;
      } else {
        var pct = Math.round((rank / effectiveTotal) * 100);
        victoryRank.textContent = 'Top ' + pct + '%';
      }
      victoryRankLine.style.display = 'block';
    } catch (e) {
      // Rank display is non-essential — silently ignore failures
    }
  }
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
        var coverFragment = gameState.imageElement ? generateCoverFragment(gameState.imageElement, gameState.gridSize) : null;
        var result = await API.savePuzzle(
          gameState.imageFile, gameState.gridSize, gameState.shuffleMoves,
          gameState.hiddenTileNum, gameState.puzzleName, publishCheckbox.checked, coverFragment
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
      // Re-fetch rank now that the score is in the database
      fetchAndDisplayRank();
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
    saveProgress();
    window.location.href = '/leaderboard.html?puzzle=' + gameState.puzzleId;
  }

  // --- Timer ---
  function startTimer() {
    stopTimer();
    gameState.startTime = Date.now();
    gameState.elapsedSeconds = 0;
    gameState.paused = false;
    gameState.pausedAt = null;
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

  // --- Pause / Resume ---
  function pauseGame() {
    if (!gameState.timerStarted || gameState.paused) return;
    gameState.paused = true;
    gameState.pausedAt = Date.now();
    // Freeze the elapsed time at the current value
    if (gameState.timerInterval) {
      clearInterval(gameState.timerInterval);
      gameState.timerInterval = null;
    }
    pauseOverlay.classList.add('active');
  }

  function resumeGame() {
    if (!gameState.paused) return;
    // Adjust startTime so elapsedSeconds stays correct
    var pausedDuration = Date.now() - gameState.pausedAt;
    gameState.startTime += pausedDuration;
    gameState.paused = false;
    gameState.pausedAt = null;
    // Restart interval
    gameState.timerInterval = setInterval(function () {
      gameState.elapsedSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
      Renderer.updateTimer(gameState.elapsedSeconds);
    }, 500);
    pauseOverlay.classList.remove('active');
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

  // --- Share fallback: selectable URL dialog ---
  var copyFallbackOverlay = document.createElement('div');
  copyFallbackOverlay.id = 'copy-fallback-overlay';
  copyFallbackOverlay.innerHTML = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;"><div style="background:#1e1e32;border:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:24px 20px;max-width:400px;width:100%;text-align:center;"><p style="color:#ffd452;font-weight:600;margin-bottom:8px;">🔗 分享链接</p><p style="color:#aaa;font-size:0.85rem;margin-bottom:14px;">自动复制失败，请长按下方链接手动复制</p><input id="fallback-url-input" style="width:100%;padding:10px;border:1px solid rgba(255,255,255,0.2);border-radius:10px;background:rgba(255,255,255,0.06);color:#e0e0e0;font-size:0.85rem;text-align:center;margin-bottom:14px;word-break:break-all;" readonly><div style="display:flex;gap:10px;"><button id="fallback-copy-btn" style="flex:1;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#52d4ff,#52ff8f);color:#1a1a2e;font-weight:600;font-size:1rem;cursor:pointer;">📋 复制</button><button id="fallback-close-btn" style="flex:1;padding:12px;border:1px solid rgba(255,255,255,0.2);border-radius:10px;background:rgba(255,255,255,0.08);color:#ddd;font-weight:600;font-size:1rem;cursor:pointer;">关闭</button></div></div></div>';
  copyFallbackOverlay.style.display = 'none';
  document.body.appendChild(copyFallbackOverlay);

  var fbInput = document.getElementById('fallback-url-input');
  document.getElementById('fallback-copy-btn').addEventListener('click', function () {
    // execCommand works reliably in user click context
    fbInput.removeAttribute('readonly');
    fbInput.select();
    fbInput.setSelectionRange(0, fbInput.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    if (ok) showToast('✅ 已复制！');
    else showToast('⚠ 请长按输入框中的链接手动复制');
    fbInput.setAttribute('readonly', '');
    copyFallbackOverlay.style.display = 'none';
  });
  document.getElementById('fallback-close-btn').addEventListener('click', function () {
    copyFallbackOverlay.style.display = 'none';
  });
  copyFallbackOverlay.addEventListener('click', function (e) {
    if (e.target === copyFallbackOverlay) copyFallbackOverlay.style.display = 'none';
  });

  function showCopyFallback(url) {
    fbInput.value = url;
    // Reset title to default share text
    var titleEl = copyFallbackOverlay.querySelector('p:first-child');
    if (titleEl) titleEl.textContent = '🔗 分享链接';
    copyFallbackOverlay.style.display = 'block';
    // Auto-select on desktop
    setTimeout(function () {
      fbInput.select();
      fbInput.setSelectionRange(0, url.length);
    }, 100);
  }

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
        var coverFragment = generateCoverFragment(gameState.imageElement, gameState.gridSize);
        var publishedToSquare = publishCheckbox.checked;
        var result = await API.savePuzzle(
          gameState.imageFile, gameState.gridSize, gameState.shuffleMoves,
          gameState.hiddenTileNum, gameState.puzzleName, publishedToSquare, coverFragment
        );
        puzzleId = result.puzzleId;
        gameState.puzzleId = puzzleId;
        showReactionBar(0, 0);
      }

      var shareUrl = window.location.origin + '/?puzzle=' + puzzleId;

      try {
        await copyToClipboard(shareUrl);
        showToast('✅ 分享链接已复制到剪贴板！');
      } catch (clipErr) {
        showCopyFallback(shareUrl);
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
    gameState.paused = false;
    pauseOverlay.classList.remove('active');
    Confetti.stop();
    victoryOverlay.classList.remove('active');
    gameScreen.classList.remove('active');
    puzzleGrid.innerHTML = '';
    gameReactions.style.display = 'none';
    gameState.currentState = null;
    gameState.solvedState = null;
    gameState.tileDataUrls = [];
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.puzzleId = null;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;
    gameState.imageElement = null;
    gameState.imageFile = null;
    gameState.readonly = false;
    gameState.originalImageUrl = null;

    var ref = appState.referrer;
    if (ref && ref.screen === 'room' && ref.roomId) {
      // Navigate back to the room (hard navigation preserves room loading)
      window.location.href = '/room/' + ref.roomId;
      return;
    }
    if (ref && ref.screen === 'square') {
      // Navigate back to square and restore scroll position
      window.location.href = '/square';
      return;
    }

    // Default: back to home setup
    setupScreen.classList.add('active');
    window.history.replaceState({}, '', '/');
    mainNav.style.display = 'flex';
    hideSharedLoading();
    resumePrompt.style.display = 'none';
    btnStart.disabled = true;
    imagePreview.src = '';
    imagePreview.style.display = 'none';
    uploadPlaceholder.style.display = '';
    uploadArea.classList.remove('has-image');
    puzzleNameInput.value = '';
    if (gridOverlay) gridOverlay.style.display = 'none';
  }

  function goToSetup() {
    if (gameScreen.classList.contains('active')) stopTimer();
    gameState.paused = false;
    pauseOverlay.classList.remove('active');
    Confetti.stop();
    victoryOverlay.classList.remove('active');
    gameScreen.classList.remove('active');
    setupScreen.classList.add('active');
    puzzleGrid.innerHTML = '';

    window.history.replaceState({}, '', '/');

    hideSharedLoading();
    resumePrompt.style.display = 'none';
    gameReactions.style.display = 'none';
    mainNav.style.display = 'flex';
    gameState.currentState = null;
    gameState.solvedState = null;
    gameState.tileDataUrls = [];
    gameState.moveCount = 0;
    gameState.elapsedSeconds = 0;
    gameState.puzzleId = null;
    gameState.timerStarted = false;
    gameState.completionSubmitted = false;
    // Discard stale image from shared puzzle
    gameState.imageElement = null;
    gameState.imageFile = null;
    gameState.readonly = false;
    gameState.originalImageUrl = null;
    gameState.gridSize = parseInt(
      (document.querySelector('.diff-btn.active') || {}).dataset?.size || '4', 10
    ) || 4;
    btnStart.disabled = true;
    // Reset upload area to empty state
    imagePreview.src = '';
    imagePreview.style.display = 'none';
    uploadPlaceholder.style.display = '';
    uploadArea.classList.remove('has-image');
    puzzleNameInput.value = '';
    if (gridOverlay) gridOverlay.style.display = 'none';
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

  // --- Debug panel ---
  function dbg(id, text, color) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      if (color) el.style.color = color;
    }
  }

  var debugBall = document.getElementById('debug-ball');
  var debugPanel = document.getElementById('debug-panel');
  var debugClose = document.getElementById('debug-close');

  debugBall.addEventListener('click', function () {
    debugPanel.style.display = 'block';
    debugBall.style.display = 'none';
  });

  debugClose.addEventListener('click', function (e) {
    e.stopPropagation();
    debugPanel.style.display = 'none';
    debugBall.style.display = 'flex';
  });

  function populateDebug(path, matched, pid) {
    dbg('dbg-path', path);
    dbg('dbg-match', matched ? 'YES ✓' : 'NO ✗', matched ? '#0f0' : '#f66');
    dbg('dbg-pid', pid || '(null)', pid ? '#0f0' : '#f66');
    if (pid) {
      var url = window.API._lastUrl ? window.API._lastUrl : (window.location.origin + '/api/puzzles/' + pid);
      dbg('dbg-url', url, '#ff0');
    } else {
      dbg('dbg-url', '-');
    }
    dbg('dbg-status', pid ? 'loading…' : 'no puzzleId in URL', pid ? '#ff0' : '#f66');
    dbg('dbg-retry', '-');
  }

  // --- Boot (readyState check: safe on slow mobile browsers) ---
  function boot() {
    if (!window.PuzzleEngine || !window.API || !window.Renderer || !window.Confetti) {
      setTimeout(boot, 100);
      return;
    }
    init();
    routeAndRender();
  }

  function routeAndRender() {
    var route = getRoute();
    var puzzleId = getPuzzleIdFromUrl();

    // Populate debug
    populateDebug(window.location.pathname, puzzleId !== null || route.screen !== 'setup', puzzleId || route.roomId || '');

    if (route.screen === 'room') {
      loadRoomScreen(route.roomId);
    } else if (route.screen === 'rooms') {
      showRoomsScreen();
    } else if (route.screen === 'square') {
      showSquareScreen();
    } else if (puzzleId) {
      // setup screen + shared puzzle
      updateNavActive('home');
      loadSharedPuzzle(puzzleId);
    } else {
      // plain setup screen
      showSetupScreen();
    }
  }

  function showSetupScreen() {
    hideAllScreens();
    setupScreen.classList.add('active');
    updateNavActive('home');
    window.history.replaceState({}, '', '/');
    mainNav.style.display = 'flex';
  }

  // --- Rooms Hub Screen ---
  function showRoomsScreen() {
    hideAllScreens();
    roomsScreen.classList.add('active');
    updateNavActive('rooms');
    window.history.pushState({ screen: 'rooms' }, '', '/rooms');
    mainNav.style.display = 'flex';

    if (roomsHubIdInput) roomsHubIdInput.value = '';

    // Render cached rooms
    var rooms = getRecentRooms();
    if (roomsHubList) roomsHubList.innerHTML = '';
    if (rooms.length === 0) {
      if (roomsHubCachedSection) roomsHubCachedSection.style.display = 'none';
    } else {
      if (roomsHubCachedSection) roomsHubCachedSection.style.display = '';
      rooms.forEach(function(r) {
        var item = document.createElement('div');
        item.className = 'rooms-hub-item';
        item.innerHTML =
          '<span class="rooms-hub-item-name">' + escHtml(r.name) + '</span>' +
          '<span class="rooms-hub-item-id">' + escHtml(r.id.substring(0, 8)) + '...</span>';

        item.addEventListener('click', function() {
          if (roomsHubIdInput) roomsHubIdInput.value = r.id;
        });

        if (roomsHubList) roomsHubList.appendChild(item);
      });
    }
  }

  function joinRoomFromHub() {
    if (!roomsHubIdInput) return;
    var inputVal = roomsHubIdInput.value.trim();
    if (!inputVal) { showToast('请输入房间ID或链接'); return; }

    var roomId = inputVal;
    // Extract roomId from full URL
    try {
      var url = new URL(inputVal);
      var parts = url.pathname.replace(/\/+$/, '').split('/');
      var idx = parts.indexOf('room');
      if (idx >= 0 && idx + 1 < parts.length) roomId = parts[idx + 1];
    } catch(e) {}
    // Fallback: strip common prefixes
    if (roomId.startsWith('/room/')) roomId = roomId.replace('/room/', '');

    if (!roomId || roomId.length < 10) {
      showToast('无法识别房间ID，请检查输入');
      return;
    }

    window.location.href = '/room/' + roomId;
  }

  // --- Square Screen ---
  async function showSquareScreen() {
    hideAllScreens();
    squareScreen.classList.add('active');
    updateNavActive('square');
    window.history.pushState({ screen: 'square' }, '', '/square');
    mainNav.style.display = 'flex';

    // Restore scroll position if returning from a puzzle
    var savedRef = detectReferrer();
    if (savedRef && savedRef.screen === 'square' && savedRef.scrollY > 0) {
      setTimeout(function() { window.scrollTo(0, savedRef.scrollY); }, 100);
    }

    var loading = document.getElementById('square-loading');
    var grid = document.getElementById('square-grid');
    var empty = document.getElementById('square-empty');
    loading.style.display = 'flex';
    grid.innerHTML = '';
    empty.style.display = 'none';

    try {
      var data = await API.getSquare();
      loading.style.display = 'none';
      if (!data.puzzles || data.puzzles.length === 0) {
        empty.style.display = 'block';
        empty.querySelector('p').textContent = '广场上暂无拼图';
        return;
      }
      renderSquareCards(data.puzzles);
    } catch (err) {
      loading.style.display = 'none';
      empty.style.display = 'block';
      var msg = err.message || '未知错误';
      if (msg.indexOf('Failed to fetch') > -1 || msg.indexOf('NetworkError') > -1 || msg.indexOf('请求失败') > -1) {
        msg = '网络连接失败，请检查网络后刷新重试';
      }
      empty.querySelector('p').textContent = '加载失败: ' + msg;
    }
  }

  function renderSquareCards(puzzles) {
    var grid = document.getElementById('square-grid');
    grid.innerHTML = '';

    puzzles.forEach(function(p) {
      var card = document.createElement('div');
      card.className = 'square-card';
      card.innerHTML =
        '<img class="square-card-fragment" src="' + escHtml(p.cover_fragment_url || '') + '" alt="' + escHtml(p.name) + '" loading="lazy">' +
        '<div class="square-card-info">' +
          '<h3 class="square-card-name">' + escHtml(p.name) + '</h3>' +
          '<span class="square-card-diff">' + p.grid_size + '×' + p.grid_size + '</span>' +
          '<div class="square-card-stats">' +
            '<span>🌹 ' + (p.rose_count || 0) + '</span>' +
            '<span>🩴 ' + (p.slipper_count || 0) + '</span>' +
            '<span>✅ ' + (p.complete_count || 0) + '</span>' +
          '</div>' +
        '</div>';

      card.addEventListener('click', function() {
        saveReferrer('square');
        window.location.href = '/?puzzle=' + encodeURIComponent(p.id);
      });

      grid.appendChild(card);
    });
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Room Screen ---
  async function loadRoomScreen(roomId) {
    hideAllScreens();
    roomScreen.classList.add('active');
    updateNavActive(null);
    window.history.pushState({ screen: 'room', roomId: roomId }, '', '/room/' + roomId);
    mainNav.style.display = 'flex';

    appState.currentRoomId = roomId;
    roomName.textContent = '加载中...';
    roomPuzzleCount.textContent = '';
    roomPuzzlesEl.innerHTML = '';
    roomEmpty.style.display = 'none';

    try {
      var room = await API.getRoom(roomId);
      roomName.textContent = room.name;
      roomPuzzleCount.textContent = room.puzzleCount + ' 个拼图';
      addRecentRoom(room.id, room.name);
      renderRoomPuzzles(room.puzzles, room.id);
    } catch (err) {
      roomName.textContent = '房间不存在';
      roomEmpty.style.display = 'block';
      roomEmpty.querySelector('p').textContent = '房间不存在或加载失败';
    }
  }

  function renderRoomPuzzles(puzzles, roomId) {
    roomPuzzlesEl.innerHTML = '';

    if (!puzzles || puzzles.length === 0) {
      roomEmpty.style.display = 'block';
      return;
    }
    roomEmpty.style.display = 'none';

    puzzles.forEach(function(p) {
      var card = document.createElement('div');
      card.className = 'room-puzzle-card' + (p.isExpired ? ' expired' : '');
      card.innerHTML =
        '<img class="room-puzzle-thumb" src="' + escHtml(p.coverFragmentUrl || '') + '" alt="" loading="lazy">' +
        '<div class="room-puzzle-info">' +
          '<span class="room-puzzle-name">' + escHtml(p.name) + '</span>' +
          '<span class="room-puzzle-meta">' + p.gridSize + '×' + p.gridSize + ' · 🌹' + (p.roseCount || 0) + ' · ✅' + (p.completeCount || 0) + '</span>' +
          (p.isExpired ? '<span class="room-puzzle-expired-badge">🕰 已过期</span>' : '') +
        '</div>' +
        '<div class="room-puzzle-actions">' +
          '<a class="room-puzzle-play" href="/?puzzle=' + encodeURIComponent(p.puzzleId) + '" data-ref-room="' + escHtml(roomId) + '">▶ 游玩</a>' +
          '<button class="room-puzzle-remove" data-rpid="' + escHtml(p.roomPuzzleId) + '">✕</button>' +
        '</div>';

      card.querySelector('.room-puzzle-remove').addEventListener('click', function(e) {
        e.stopPropagation();
        removePuzzleFromRoom(roomId, p.roomPuzzleId);
      });

      roomPuzzlesEl.appendChild(card);
    });
  }

  async function removePuzzleFromRoom(roomId, roomPuzzleId) {
    if (!confirm('确认从房间中移除这个拼图？')) return;
    try {
      await API.removePuzzleFromRoom(roomId, roomPuzzleId);
      showToast('已移除');
      loadRoomScreen(roomId); // refresh
    } catch (err) {
      showToast('移除失败: ' + err.message);
    }
  }

  async function addPuzzleToRoomFromInput() {
    var inputVal = roomAddPuzzleId.value.trim();
    if (!inputVal) { showToast('请输入拼图ID或链接'); return; }

    // Extract puzzleId from URL if a full link was pasted
    var puzzleId = inputVal;
    try {
      var url = new URL(inputVal);
      puzzleId = url.searchParams.get('puzzle') || puzzleId;
    } catch(e) {}
    // Also handle /puzzle/xxx format
    var match = inputVal.match(/puzzle[\/=]([a-f0-9-]{36})/i);
    if (match) puzzleId = match[1];

    if (!puzzleId || puzzleId.length < 10) {
      showToast('无法识别拼图ID，请检查输入');
      return;
    }

    try {
      await API.addPuzzleToRoom(appState.currentRoomId, puzzleId);
      roomAddPuzzleId.value = '';
      showToast('已添加到房间！');
      loadRoomScreen(appState.currentRoomId);
    } catch (err) {
      if (err.message.indexOf('409') > -1 || err.message.indexOf('already') > -1) {
        showToast('该拼图已在房间中');
      } else {
        showToast('添加失败: ' + err.message);
      }
    }
  }

  // --- Create Room (modal-based, replacing native prompt) ---
  function openCreateRoomModal() {
    if (!createRoomModal || !createRoomNameInput) {
      console.error('createRoomModal elements not found');
      showToast('界面初始化异常，请刷新页面');
      return;
    }
    createRoomNameInput.value = '';
    createRoomModal.style.display = 'flex';
    setTimeout(function() {
      try { createRoomNameInput.focus(); } catch(e) {}
    }, 100);
  }

  function closeCreateRoomModal() {
    if (createRoomModal) createRoomModal.style.display = 'none';
  }

  async function confirmCreateRoom() {
    if (!createRoomNameInput) {
      showToast('界面初始化异常，请刷新页面');
      return;
    }
    var name = createRoomNameInput.value.trim() || '未命名房间';
    closeCreateRoomModal();

    // Disable button to prevent double-clicks
    if (btnCreateRoomConfirm) btnCreateRoomConfirm.disabled = true;

    try {
      var result = await API.createRoom(name);
      addRecentRoom(result.id, result.name);
      window.location.href = '/room/' + result.id;
    } catch (err) {
      showToast('创建房间失败: ' + (err.message || '请检查网络连接'));
    } finally {
      if (btnCreateRoomConfirm) btnCreateRoomConfirm.disabled = false;
    }
  }

  function shareRoomLink() {
    if (!appState.currentRoomId) return;
    var url = window.location.origin + '/room/' + appState.currentRoomId;
    copyToClipboard(url).then(function() {
      showToast('✅ 房间链接已复制！');
    }).catch(function() {
      showCopyFallback(url);
    });
  }

  // --- Room Select Modal ---
  function openRoomSelectModal() {
    if (!gameState.puzzleId) {
      showToast('请先分享拼图后再添加到房间');
      return;
    }
    modalRoomList.innerHTML = '';
    var rooms = getRecentRooms();
    if (rooms.length === 0) {
      modalRoomList.innerHTML = '<p class="modal-room-empty">暂无历史房间，请直接输入房间ID</p>';
    } else {
      rooms.forEach(function(r) {
        var item = document.createElement('div');
        item.className = 'modal-room-item';
        item.textContent = r.name + ' (' + r.id.substring(0, 8) + '...)';
        item.addEventListener('click', function() {
          modalRoomIdInput.value = r.id;
        });
        modalRoomList.appendChild(item);
      });
    }
    modalRoomIdInput.value = '';
    roomSelectModal.style.display = 'flex';
  }

  function closeRoomModal() {
    roomSelectModal.style.display = 'none';
  }

  async function confirmAddToRoom() {
    var roomId = modalRoomIdInput.value.trim();
    if (!roomId) {
      // Check if a recent room is selected
      var active = modalRoomList.querySelector('.modal-room-item.active');
      if (active) roomId = active.dataset.roomId;
    }
    if (!roomId) { showToast('请选择或输入房间ID'); return; }
    if (!gameState.puzzleId) { showToast('找不到当前拼图'); return; }

    try {
      await API.addPuzzleToRoom(roomId, gameState.puzzleId);
      showToast('✅ 已添加到房间！');
      closeRoomModal();
    } catch (err) {
      if (err.message.indexOf('409') > -1 || err.message.indexOf('already') > -1) {
        showToast('该拼图已在房间中');
      } else {
        showToast('添加失败: ' + err.message);
      }
    }
  }

  // --- Reactions ---
  async function handleReact(type) {
    if (!gameState.puzzleId) return;
    if (hasReacted(gameState.puzzleId, type)) {
      showToast(type === 'rose' ? '你已经送过玫瑰了 🌹' : '你已经扔过拖鞋了 🩴');
      return;
    }

    try {
      var result = await API.reactToPuzzle(gameState.puzzleId, type);
      markReacted(gameState.puzzleId, type);
      // Update count on screen
      var count = type === 'rose' ? result.rose_count : result.slipper_count;
      if (type === 'rose') {
        appState.reactionCounts.rose = count;
        roseCountEl.textContent = count;
      } else {
        appState.reactionCounts.slipper = count;
        slipperCountEl.textContent = count;
      }
      btnRose.classList.toggle('reacted', hasReacted(gameState.puzzleId, 'rose'));
      btnSlipper.classList.toggle('reacted', hasReacted(gameState.puzzleId, 'slipper'));
      showToast(type === 'rose' ? '🌹 送出一朵玫瑰！' : '🩴 扔出一只拖鞋！');
    } catch (err) {
      showToast('操作失败，请重试');
    }
  }

  function showReactionBar(puzzleRoseCount, puzzleSlipperCount) {
    appState.reactionCounts.rose = puzzleRoseCount || 0;
    appState.reactionCounts.slipper = puzzleSlipperCount || 0;
    roseCountEl.textContent = appState.reactionCounts.rose;
    slipperCountEl.textContent = appState.reactionCounts.slipper;
    btnRose.classList.toggle('reacted', hasReacted(gameState.puzzleId, 'rose'));
    btnSlipper.classList.toggle('reacted', hasReacted(gameState.puzzleId, 'slipper'));
    gameReactions.style.display = 'flex';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
