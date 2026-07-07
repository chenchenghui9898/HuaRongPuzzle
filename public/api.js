/**
 * API Client — Thin fetch wrappers for backend communication.
 */
window.API = (function () {
  const BASE = '/api';

  /**
   * Save a puzzle configuration to the backend.
   */
  async function savePuzzle(imageFile, gridSize, moves, hiddenIndex, name) {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('gridSize', String(gridSize));
    formData.append('moves', JSON.stringify(moves));
    formData.append('hiddenIndex', String(hiddenIndex));
    formData.append('name', name || 'HuaRongImage');

    const res = await fetch(`${BASE}/puzzles`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Load a shared puzzle from the backend.
   */
  async function loadPuzzle(puzzleId) {
    const res = await fetch(`${BASE}/puzzles/${encodeURIComponent(puzzleId)}`);

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Puzzle not found. The link may be invalid or expired.');
      }
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Save a completion record after victory.
   */
  async function saveCompletion(puzzleId, playerName, timeSeconds, moveCount) {
    const res = await fetch(`${BASE}/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId, playerName, timeSeconds, moveCount }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Load the leaderboard for a puzzle.
   */
  async function getLeaderboard(puzzleId) {
    const res = await fetch(`${BASE}/completions/${encodeURIComponent(puzzleId)}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  return { savePuzzle, loadPuzzle, saveCompletion, getLeaderboard };
})();
