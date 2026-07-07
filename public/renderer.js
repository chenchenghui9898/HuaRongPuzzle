/**
 * Renderer — DOM rendering and CSS transition management.
 *
 * Each tile is an absolutely-positioned <div> inside a relative container.
 * Tile position is set via CSS `left`/`top` properties.
 * CSS `transition: left 0.2s ease, top 0.2s ease` handles the sliding animation.
 */
window.Renderer = (function () {
  let tileByNum = {};       // tileNum → DOM element
  let gridContainer = null;
  let gridSize = 0;
  let cellSize = 0;
  let hiddenTileNum = -1;

  /**
   * Build the full puzzle grid.
   */
  function renderGrid(container, state, emptyPos, tileDataUrls, hiddenTileNumber) {
    gridContainer = container;
    gridSize = state.length;
    hiddenTileNum = hiddenTileNumber;

    const containerRect = container.getBoundingClientRect();
    cellSize = containerRect.width / gridSize;

    container.innerHTML = '';
    tileByNum = {};

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const tileNum = state[r][c];
        const isHiddenTile = tileNum === hiddenTileNum;
        const isEmptyPos = (r === emptyPos.row && c === emptyPos.col);

        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.tileNum = String(tileNum);
        tile.dataset.row = String(r);
        tile.dataset.col = String(c);

        tile.style.width = cellSize + 'px';
        tile.style.height = cellSize + 'px';
        tile.style.left = (c * cellSize) + 'px';
        tile.style.top = (r * cellSize) + 'px';

        // Background: each tile data URL is already a single-tile image slice,
        // so we just set it as background with cover sizing — no offset needed.
        tile.style.backgroundImage = `url(${tileDataUrls[tileNum]})`;
        tile.style.backgroundSize = '100% 100%';

        if (isEmptyPos) {
          tile.classList.add('empty');
        }

        container.appendChild(tile);
        tileByNum[tileNum] = tile;
      }
    }
  }

  /**
   * Update tile positions after a move.
   * Iterates the NEW state and repositions each tile element.
   */
  function updateTilePositions(state, emptyPos) {
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const tileNum = state[r][c];
        const tile = tileByNum[tileNum];
        if (!tile) continue;

        tile.style.left = (c * cellSize) + 'px';
        tile.style.top = (r * cellSize) + 'px';
        tile.dataset.row = String(r);
        tile.dataset.col = String(c);

        if (r === emptyPos.row && c === emptyPos.col) {
          tile.classList.add('empty');
        } else if (tileNum !== hiddenTileNum) {
          tile.classList.remove('empty');
        }
      }
    }
  }

  /**
   * Reveal the hidden tile at the empty position (on victory).
   */
  function revealHiddenTile(state, emptyPos) {
    const tileNum = state[emptyPos.row]?.[emptyPos.col];
    if (tileNum === hiddenTileNum) {
      const tile = tileByNum[hiddenTileNum];
      if (tile) {
        tile.classList.add('revealed');
      }
    }
  }

  /** Mark all tiles non-interactive after victory. */
  function lockTiles() {
    Object.values(tileByNum).forEach(tile => {
      tile.classList.add('no-hover');
    });
  }

  /** Update the move counter display. */
  function updateMoveCounter(count) {
    const el = document.getElementById('move-counter');
    if (el) el.textContent = String(count);
  }

  /** Update the timer display. */
  function updateTimer(seconds) {
    const el = document.getElementById('timer');
    if (el) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
  }

  // --- API ---
  return {
    renderGrid,
    updateTilePositions,
    revealHiddenTile,
    lockTiles,
    updateMoveCounter,
    updateTimer,
  };
})();
