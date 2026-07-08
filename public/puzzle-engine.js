/**
 * Puzzle Engine — Pure logic module for the Picture Klotski game.
 * No DOM dependencies; all functions are pure and reusable.
 */
window.PuzzleEngine = (function () {
  // --- Tile Cutting ---

  /**
   * Slice an image element into gridSize × gridSize tiles.
   * @param {HTMLImageElement} imageElement
   * @param {number} gridSize
   * @returns {string[]} Array of data URLs, length = gridSize²
   */
  function cutImageToTiles(imageElement, gridSize) {
    var natW = imageElement.naturalWidth;
    var natH = imageElement.naturalHeight;

    // --- Step 1: Scale to working size (max 1200px on the long side) ---
    var maxDim = 1200;
    var scaleW = natW;
    var scaleH = natH;
    if (Math.max(scaleW, scaleH) > maxDim) {
      var ratio = maxDim / Math.max(scaleW, scaleH);
      scaleW = Math.round(scaleW * ratio);
      scaleH = Math.round(scaleH * ratio);
    }

    // --- Step 2: Square canvas size = tileW * gridSize ---
    // Pick a tile size that looks good: use the short side of the working image
    // as the basis so no part is too small.
    var squareSize = Math.min(scaleW, scaleH);
    // Round to a pixel count that divides cleanly by gridSize
    squareSize = Math.floor(squareSize / gridSize) * gridSize;
    // Minimum 300×300 to avoid tiny tiles
    if (squareSize < 300) squareSize = 300;

    var tileW = Math.floor(squareSize / gridSize);
    var tileH = Math.floor(squareSize / gridSize);

    // --- Step 3: Cover crop — scale image to fill the square, center-crop ---
    // Calculate scale factor: use the LARGER side-to-square ratio (cover)
    var coverScale = Math.max(squareSize / scaleW, squareSize / scaleH);
    var drawW = Math.round(scaleW * coverScale);
    var drawH = Math.round(scaleH * coverScale);

    // Center the drawn image on the square canvas
    var offsetX = Math.floor((squareSize - drawW) / 2);
    var offsetY = Math.floor((squareSize - drawH) / 2);

    var offCanvas = document.createElement('canvas');
    offCanvas.width = squareSize;
    offCanvas.height = squareSize;
    var offCtx = offCanvas.getContext('2d');
    // Fill with dark background (will show in gaps if any rounding leaves 1px)
    offCtx.fillStyle = '#111';
    offCtx.fillRect(0, 0, squareSize, squareSize);
    // Draw image centered and scaled to cover
    offCtx.drawImage(imageElement, offsetX, offsetY, drawW, drawH);

    // --- Step 4: Slice into tiles ---
    var tiles = [];
    for (var row = 0; row < gridSize; row++) {
      for (var col = 0; col < gridSize; col++) {
        var tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileW;
        tileCanvas.height = tileH;
        var tileCtx = tileCanvas.getContext('2d');
        tileCtx.drawImage(
          offCanvas,
          col * tileW, row * tileH, tileW, tileH,
          0, 0, tileW, tileH
        );
        try {
          tiles.push(tileCanvas.toDataURL('image/jpeg', 0.92));
        } catch (e) {
          throw new Error('图片处理受限，请刷新后重试');
        }
      }
    }
    return tiles;
  }

  // --- State Management ---

  /**
   * Create a solved 2D state array.
   * Tiles are numbered 0 .. gridSize²-1, where the last number is the hidden tile.
   * @param {number} gridSize
   * @returns {number[][]}
   */
  function createSolvedState(gridSize) {
    const state = [];
    let n = 0;
    for (let row = 0; row < gridSize; row++) {
      const rowArr = [];
      for (let col = 0; col < gridSize; col++) {
        rowArr.push(n++);
      }
      state.push(rowArr);
    }
    return state;
  }

  /**
   * Deep-copy a 2D state array.
   */
  function cloneState(state) {
    return state.map(row => row.slice());
  }

  // --- Move Logic ---

  /**
   * Get positions of tiles that are adjacent to the empty cell.
   * @param {number} emptyRow
   * @param {number} emptyCol
   * @param {number} gridSize
   * @returns {{row: number, col: number}[]}
   */
  function getValidMoves(emptyRow, emptyCol, gridSize) {
    const moves = [];
    // Up
    if (emptyRow > 0) moves.push({ row: emptyRow - 1, col: emptyCol });
    // Down
    if (emptyRow < gridSize - 1) moves.push({ row: emptyRow + 1, col: emptyCol });
    // Left
    if (emptyCol > 0) moves.push({ row: emptyRow, col: emptyCol - 1 });
    // Right
    if (emptyCol < gridSize - 1) moves.push({ row: emptyRow, col: emptyCol + 1 });
    return moves;
  }

  /**
   * Check if a tile is adjacent to the empty cell (Manhattan distance = 1).
   */
  function isTileAdjacent(tileRow, tileCol, emptyRow, emptyCol) {
    return Math.abs(tileRow - emptyRow) + Math.abs(tileCol - emptyCol) === 1;
  }

  /**
   * Swap a tile with the empty cell. Returns a new state (immutable).
   * @param {number[][]} state
   * @param {{row: number, col: number}} tilePos
   * @param {{row: number, col: number}} emptyPos
   * @returns {number[][]}
   */
  function moveTile(state, tilePos, emptyPos) {
    const newState = cloneState(state);
    const tmp = newState[tilePos.row][tilePos.col];
    newState[tilePos.row][tilePos.col] = newState[emptyPos.row][emptyPos.col];
    newState[emptyPos.row][emptyPos.col] = tmp;
    return newState;
  }

  /**
   * Find the position of a given tile number in the state.
   */
  function findTile(state, tileNum) {
    for (let r = 0; r < state.length; r++) {
      for (let c = 0; c < state[r].length; c++) {
        if (state[r][c] === tileNum) return { row: r, col: c };
      }
    }
    return null;
  }

  // --- Shuffling ---

  /**
   * Shuffle the puzzle by making random legal moves from the solved state.
   * This guarantees the puzzle is always solvable.
   *
   * @param {number[][]} solvedState
   * @param {number} numMoves — number of random moves to make
   * @returns {{ state: number[][], emptyPos: {row: number, col: number}, moves: object[] }}
   */
  function shuffleWithLegalMoves(solvedState, numMoves) {
    const gridSize = solvedState.length;
    let state = cloneState(solvedState);
    let emptyRow = gridSize - 1;
    let emptyCol = gridSize - 1;
    let lastFromRow = null;
    let lastFromCol = null;
    const moveHistory = [];

    for (let i = 0; i < numMoves; i++) {
      const candidates = getValidMoves(emptyRow, emptyCol, gridSize).filter(
        m => !(m.row === lastFromRow && m.col === lastFromCol)
      );

      if (candidates.length === 0) {
        // Shouldn't happen with anti-backtracking alone for gridSize >= 3,
        // but as a safety fallback, allow all moves if we filtered everything out.
        break;
      }

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      // Record the move
      moveHistory.push({
        from: { row: chosen.row, col: chosen.col },
        to: { row: emptyRow, col: emptyCol },
      });

      // Swap tile into empty space
      state = moveTile(state, chosen, { row: emptyRow, col: emptyCol });

      // Update empty position
      lastFromRow = emptyRow;
      lastFromCol = emptyCol;
      emptyRow = chosen.row;
      emptyCol = chosen.col;
    }

    return {
      state: state,
      emptyPos: { row: emptyRow, col: emptyCol },
      moves: moveHistory,
    };
  }

  /**
   * Replay a sequence of moves on the solved state to reconstruct a puzzle.
   * Used when loading a shared puzzle.
   */
  function replayMoves(solvedState, moves) {
    let state = cloneState(solvedState);
    const gridSize = solvedState.length;
    let emptyRow = gridSize - 1;
    let emptyCol = gridSize - 1;

    for (const move of moves) {
      state = moveTile(state, move.from, move.to);
      emptyRow = move.from.row;
      emptyCol = move.from.col;
    }

    return {
      state: state,
      emptyPos: { row: emptyRow, col: emptyCol },
    };
  }

  // --- Win Detection ---

  /**
   * Check if current state matches the solved state.
   */
  function checkWin(currentState, solvedState) {
    for (let r = 0; r < currentState.length; r++) {
      for (let c = 0; c < currentState[r].length; c++) {
        if (currentState[r][c] !== solvedState[r][c]) {
          return false;
        }
      }
    }
    return true;
  }

  // --- Public API ---
  return {
    cutImageToTiles,
    createSolvedState,
    shuffleWithLegalMoves,
    replayMoves,
    getValidMoves,
    moveTile,
    isTileAdjacent,
    checkWin,
    findTile,
  };
})();
