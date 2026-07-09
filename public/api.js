/**
 * API Client — Thin fetch wrappers for backend communication.
 * All requests use absolute URLs to avoid path resolution issues on mobile.
 * Retries up to 3 times with 2s delay on network errors.
 * XHR fallback if fetch itself is unavailable or blocked.
 */
window.API = (function () {
  // --- Safe logging (console might be blocked on some browsers) ---
  function safeLog(msg) {
    try { if (window.console && window.console.log) window.console.log(msg); } catch (e) {}
  }

  // --- Base URL (with origin fallback for old browsers) ---
  function getOrigin() {
    try {
      if (window.location.origin) return window.location.origin;
    } catch (e) {}
    // Fallback: build origin from protocol + host
    var port = window.location.port ? ':' + window.location.port : '';
    return window.location.protocol + '//' + window.location.hostname + port;
  }

  function apiUrl(path) {
    return getOrigin() + '/api' + path;
  }

  // --- fetch() wrapper with robust retry ---
  function fetchWithRetry(url, opts, maxRetries) {
    maxRetries = maxRetries || 3;
    var lastErr;

    return (function tryFetch(attempt) {
      return fetchFn(url, opts).then(function (res) {
        return res;
      }).catch(function (e) {
        lastErr = e;
        if (attempt < maxRetries) {
          safeLog('retrying... (' + attempt + '/' + maxRetries + ') ' + url);
          return sleep(2000).then(function () {
            return tryFetch(attempt + 1);
          });
        }
        throw lastErr;
      });
    })(1);
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // --- Low-level fetch that falls back to XHR ---
  function fetchFn(url, opts) {
    opts = opts || {};
    // Use native fetch if available
    if (typeof fetch !== 'undefined') {
      return fetch(url, opts).catch(function (fetchErr) {
        safeLog('fetch failed, trying XHR: ' + url);
        // Fallback to XHR for one attempt
        return xhrFetch(url, opts);
      });
    }
    return xhrFetch(url, opts);
  }

  function xhrFetch(url, opts) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var method = (opts.method || 'GET').toUpperCase();

      xhr.open(method, url, true);

      // Set headers
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          try { xhr.setRequestHeader(key, opts.headers[key]); } catch (e) {}
        });
      }

      xhr.onload = function () {
        var resp = {
          ok: xhr.status >= 200 && xhr.status < 400,
          status: xhr.status,
          json: function () { return Promise.resolve(JSON.parse(xhr.responseText)); },
          text: function () { return Promise.resolve(xhr.responseText); }
        };
        resolve(resp);
      };
      xhr.onerror = function () {
        reject(new Error('请求失败，请检查网络连接'));
      };
      xhr.ontimeout = function () {
        reject(new Error('请求超时'));
      };
      xhr.timeout = 15000;

      if (opts.body instanceof FormData) {
        xhr.send(opts.body);
      } else if (opts.body) {
        xhr.send(opts.body);
      } else {
        xhr.send();
      }
    });
  }

  // =============================================
  // Public API
  // =============================================

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

  async function getLeaderboard(puzzleId) {
    var res = await fetchWithRetry(apiUrl('/completions/' + encodeURIComponent(puzzleId)));

    if (!res.ok) {
      var err = await res.json().catch(function () { return { error: 'Unknown error' }; });
      throw new Error(err.error || 'HTTP ' + res.status);
    }

    return res.json();
  }

  var API = { savePuzzle: savePuzzle, loadPuzzle: loadPuzzle, saveCompletion: saveCompletion, getLeaderboard: getLeaderboard, _lastUrl: '', _retries: 0 };

  // Wrap loadPuzzle to track URL + retries for debug panel
  var _loadPuzzle = loadPuzzle;
  API.loadPuzzle = function (puzzleId) {
    API._lastUrl = apiUrl('/puzzles/' + encodeURIComponent(puzzleId));
    API._retries = 0;
    return _loadPuzzle(puzzleId);
  };

  return API;
})();
