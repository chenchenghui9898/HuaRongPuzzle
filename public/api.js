/**
 * API Client — Thin fetch wrappers for backend communication.
 * All requests use absolute URLs to avoid path resolution issues on mobile.
 * Retries up to 3 times with 2s delay on network errors.
 */
window.API = (function () {
  var BASE = '';

  function initBase() {
    if (BASE) return BASE;
    try {
      BASE = window.location.origin;
    } catch (e) {
      BASE = '';
    }
    return BASE;
  }

  /**
   * Fetch with retry on network failure.
   * @param {string} url — absolute URL
   * @param {object} opts — fetch options
   * @param {number} maxRetries — max retry count (default 3)
   * @returns {Promise<Response>}
   */
  async function fetchWithRetry(url, opts, maxRetries) {
    maxRetries = maxRetries || 3;
    var lastErr;

    for (var attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        var res = await fetch(url, opts);
        return res;
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetries) {
          console.log('retrying... (' + attempt + '/' + maxRetries + ') ' + url);
          await new Promise(function (r) { setTimeout(r, 2000); });
        }
      }
    }

    throw lastErr || new Error('请求失败，请检查网络连接');
  }

  /**
   * Build absolute API URL.
   */
  function apiUrl(path) {
    initBase();
    return BASE + '/api' + path;
  }

  /**
   * Save a puzzle configuration to the backend.
   */
  async function savePuzzle(imageFile, gridSize, moves, hiddenIndex, name) {
    var formData = new FormData();
    formData.append('image', imageFile);
    formData.append('gridSize', String(gridSize));
    formData.append('moves', JSON.stringify(moves));
    formData.append('hiddenIndex', String(hiddenIndex));
    formData.append('name', name || 'HuaRongImage');

    var res = await fetchWithRetry(apiUrl('/puzzles'), {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      var err = await res.json().catch(function () { return { error: 'Unknown error' }; });
      throw new Error(err.error || 'HTTP ' + res.status);
    }

    return res.json();
  }

  /**
   * Load a shared puzzle from the backend.
   */
  async function loadPuzzle(puzzleId) {
    var res = await fetchWithRetry(apiUrl('/puzzles/' + encodeURIComponent(puzzleId)));

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('拼图不存在，链接可能已过期');
      }
      var err = await res.json().catch(function () { return { error: 'Unknown error' }; });
      throw new Error(err.error || 'HTTP ' + res.status);
    }

    return res.json();
  }

  /**
   * Save a completion record after victory.
   */
  async function saveCompletion(puzzleId, playerName, timeSeconds, moveCount) {
    var res = await fetchWithRetry(apiUrl('/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puzzleId: puzzleId, playerName: playerName, timeSeconds: timeSeconds, moveCount: moveCount }),
    });

    if (!res.ok) {
      var err = await res.json().catch(function () { return { error: 'Unknown error' }; });
      throw new Error(err.error || 'HTTP ' + res.status);
    }

    return res.json();
  }

  /**
   * Load the leaderboard for a puzzle.
   */
  async function getLeaderboard(puzzleId) {
    var res = await fetchWithRetry(apiUrl('/completions/' + encodeURIComponent(puzzleId)));

    if (!res.ok) {
      var err = await res.json().catch(function () { return { error: 'Unknown error' }; });
      throw new Error(err.error || 'HTTP ' + res.status);
    }

    return res.json();
  }

  return { savePuzzle, loadPuzzle, saveCompletion, getLeaderboard };
})();
