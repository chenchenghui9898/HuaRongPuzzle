const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabase');

const app = express();
const CLEANUP_DAYS = parseInt(process.env.CLEANUP_DAYS, 10) || 30;

// --- Cloudinary config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Middleware ---
app.use(express.json({ limit: '1mb' }));

// CORS — allow all origins for anonymous access
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-device-id, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Multer: memory storage (buffer → Cloudinary, no local files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG、PNG、WebP 格式的图片'));
    }
  },
});

// ====================================================================
// Helper: extract deviceId from request (anonymous or future auth)
// ====================================================================
function getDeviceId(req) {
  return req.headers['x-device-id'] || req.body.deviceId || null;
}

// ====================================================================
// Helper: validate cover fragment base64
// ====================================================================
function validateCoverFragment(base64) {
  if (!base64 || typeof base64 !== 'string') return { valid: false, error: 'Missing fragment data' };

  // Detect MIME type from data URI prefix
  const match = base64.match(/^data:(image\/\w+);base64,/);
  if (!match) return { valid: false, error: 'Not a valid data URI' };

  const mime = match[1];
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(mime)) {
    return { valid: false, error: 'Fragment must be JPEG, PNG, or WebP' };
  }

  // Check decoded size ≤ 300KB
  const b64Data = base64.substring(match[0].length);
  const byteSize = Math.ceil((b64Data.length * 3) / 4);
  if (byteSize > 300 * 1024) {
    return { valid: false, error: 'Fragment exceeds 300KB limit' };
  }

  return { valid: true, mime, dataUri: base64 };
}

// ====================================================================
// API Routes
// ====================================================================

// POST /api/puzzles — create a puzzle
app.post('/api/puzzles', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const { gridSize, moves, hiddenIndex, name, publishedToSquare, coverFragmentBase64 } = req.body;
    if (!gridSize || !moves || hiddenIndex === undefined) {
      return res.status(400).json({ error: 'gridSize, moves, and hiddenIndex are required' });
    }

    const gridSizeNum = parseInt(gridSize, 10);
    if (gridSizeNum < 3 || gridSizeNum > 7) {
      return res.status(400).json({ error: 'gridSize must be between 3 and 7' });
    }

    const puzzleName = (name && name.trim()) ? name.trim() : 'HuaRongImage';
    const deviceId = getDeviceId(req);
    const now = new Date().toISOString();

    // Upload main image to Cloudinary
    const b64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;

    const cloudResult = await cloudinary.uploader.upload(dataUri, {
      folder: 'picture-klotski',
      resource_type: 'image',
    });

    // Handle cover fragment
    let coverFragmentUrl = null;
    if (coverFragmentBase64) {
      const fragValidation = validateCoverFragment(coverFragmentBase64);
      if (!fragValidation.valid) {
        return res.status(400).json({ error: 'Cover fragment: ' + fragValidation.error });
      }
      const fragResult = await cloudinary.uploader.upload(fragValidation.dataUri, {
        folder: 'picture-klotski/fragments',
        resource_type: 'image',
      });
      coverFragmentUrl = fragResult.secure_url;
    }

    // Publish to square — always allow, no gate
    const shouldPublish = publishedToSquare === 'true' || publishedToSquare === true;
    const published = shouldPublish;

    const puzzleId = uuidv4();

    const { error: dbError } = await supabase
      .from('puzzles')
      .insert({
        id: puzzleId,
        image_url: cloudResult.secure_url,
        grid_size: gridSizeNum,
        moves: moves,
        hidden_index: parseInt(hiddenIndex, 10),
        name: puzzleName,
        created_at: now,
        last_opened_at: now,
        cover_fragment_url: coverFragmentUrl,
        published_to_square: published,
        rose_count: 0,
        slipper_count: 0,
        open_count: 0,
        complete_count: 0,
        device_id: deviceId,
        user_id: null,
      });

    if (dbError) {
      console.error('Supabase insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save puzzle' });
    }

    res.json({ puzzleId });
  } catch (err) {
    console.error('Error creating puzzle:', err);
    res.status(500).json({ error: 'Failed to create puzzle' });
  }
});

// GET /api/puzzles/:id — load puzzle + touch open_count
app.get('/api/puzzles/:id', async (req, res) => {
  try {
    const { data: puzzle, error } = await supabase
      .from('puzzles')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    // Touch last_opened_at and increment open_count (fire-and-forget)
    supabase
      .from('puzzles')
      .update({
        last_opened_at: new Date().toISOString(),
        open_count: (puzzle.open_count || 0) + 1,
      })
      .eq('id', puzzle.id)
      .then(({ error: updateErr }) => {
        if (updateErr) console.error('Failed to update puzzle meta:', updateErr.message);
      });

    // Generate a fresh random shuffle each time the puzzle is opened
    const freshMoves = generateRandomShuffle(puzzle.grid_size);

    res.json({
      puzzleId: puzzle.id,
      imageUrl: puzzle.image_url,
      gridSize: puzzle.grid_size,
      moves: freshMoves,
      hiddenIndex: puzzle.hidden_index,
      name: puzzle.name || 'HuaRongImage',
      createdAt: puzzle.created_at,
      roseCount: puzzle.rose_count || 0,
      slipperCount: puzzle.slipper_count || 0,
      completeCount: puzzle.complete_count || 0,
      publishedToSquare: puzzle.published_to_square || false,
    });
  } catch (err) {
    console.error('Error loading puzzle:', err);
    res.status(500).json({ error: 'Failed to load puzzle' });
  }
});

// POST /api/completions — save completion + increment complete_count
app.post('/api/completions', async (req, res) => {
  try {
    const { puzzleId, playerName, timeSeconds, moveCount } = req.body;

    if (!puzzleId || timeSeconds === undefined || moveCount === undefined) {
      return res.status(400).json({ error: 'puzzleId, timeSeconds, and moveCount are required' });
    }

    const name = (playerName && playerName.trim()) ? playerName.trim() : '匿名玩家';

    const { error } = await supabase
      .from('completions')
      .insert({
        puzzle_id: puzzleId,
        player_name: name,
        time_seconds: parseInt(timeSeconds, 10),
        move_count: parseInt(moveCount, 10),
        completed_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to save completion' });
    }

    // Increment complete_count on the puzzle (fire-and-forget)
    supabase.rpc('increment_counter', { puzzle_id: puzzleId, column_name: 'complete_count' }).then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback: select + update
        supabase.from('puzzles').select('complete_count').eq('id', puzzleId).single().then(({ data: p }) => {
          if (p) {
            supabase.from('puzzles').update({ complete_count: (p.complete_count || 0) + 1 }).eq('id', puzzleId).then(() => {});
          }
        });
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving completion:', err);
    res.status(500).json({ error: 'Failed to save completion' });
  }
});

// GET /api/completions/:puzzleId
app.get('/api/completions/:puzzleId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('completions')
      .select('*')
      .eq('puzzle_id', req.params.puzzleId)
      .order('time_seconds', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({ error: 'Failed to load leaderboard' });
    }

    res.json({
      puzzleId: req.params.puzzleId,
      leaderboard: (data || []).map((row, i) => ({
        rank: i + 1,
        playerName: row.player_name,
        timeSeconds: row.time_seconds,
        moveCount: row.move_count,
        completedAt: row.completed_at,
      })),
    });
  } catch (err) {
    console.error('Error loading leaderboard:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// ====================================================================
// Helper: build a cover URL — use stored fragment, or fallback to a
// Cloudinary transform (200×200 center crop) from the original image.
// ====================================================================
function getCoverUrl(puzzle) {
  if (puzzle.cover_fragment_url) return puzzle.cover_fragment_url;
  if (!puzzle.image_url) return null;

  // Only transform Cloudinary-hosted images
  var match = puzzle.image_url.match(/\/upload\/(v\d+\/.+)$/);
  if (!match) return null;

  // Insert transform params before the version segment:
  //   /upload/v123/foo.jpg  →  /upload/c_crop,g_center,h_200,w_200/v123/foo.jpg
  return puzzle.image_url.replace(/\/upload\//, '/upload/c_crop,g_center,h_200,w_200/');
}

// ====================================================================
// Square routes
// ====================================================================

// GET /api/square — list published puzzles
app.get('/api/square', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('puzzles')
      .select('id, cover_fragment_url, image_url, name, grid_size, rose_count, slipper_count, complete_count, created_at')
      .eq('published_to_square', true)
      .order('rose_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Square query error:', error);
      return res.status(500).json({ error: 'Failed to load square' });
    }

    res.json({
      puzzles: (data || []).map(function (p) {
        return {
          id: p.id,
          cover_fragment_url: getCoverUrl(p),
          name: p.name,
          grid_size: p.grid_size,
          rose_count: p.rose_count || 0,
          slipper_count: p.slipper_count || 0,
          complete_count: p.complete_count || 0,
          created_at: p.created_at,
        };
      }),
    });
  } catch (err) {
    console.error('Error loading square:', err);
    res.status(500).json({ error: 'Failed to load square' });
  }
});

// ====================================================================
// Room routes
// ====================================================================

// POST /api/rooms — create a room
app.post('/api/rooms', async (req, res) => {
  try {
    const { name } = req.body;
    const deviceId = getDeviceId(req);
    const roomId = uuidv4();
    const roomName = (name && name.trim()) ? name.trim() : '未命名房间';
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('rooms')
      .insert({
        id: roomId,
        name: roomName,
        device_id: deviceId,
        created_at: now,
      });

    if (error) {
      console.error('Room create error:', error);
      return res.status(500).json({ error: 'Failed to create room' });
    }

    res.json({ id: roomId, name: roomName });
  } catch (err) {
    console.error('Error creating room:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// GET /api/rooms/:id — room info + puzzle list with expiry status
app.get('/api/rooms/:id', async (req, res) => {
  try {
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const { data: roomPuzzles, error: rpError } = await supabase
      .from('room_puzzles')
      .select('id, puzzle_id, added_by, created_at')
      .eq('room_id', req.params.id)
      .order('created_at', { ascending: false });

    if (rpError) {
      console.error('Room puzzles query error:', rpError);
      return res.status(500).json({ error: 'Failed to load room puzzles' });
    }

    // Fetch puzzle details for all room_puzzles
    const puzzleIds = (roomPuzzles || []).map(rp => rp.puzzle_id);
    let puzzles = [];
    if (puzzleIds.length > 0) {
      const { data: puzzleData, error: pError } = await supabase
        .from('puzzles')
        .select('id, name, grid_size, cover_fragment_url, image_url, rose_count, slipper_count, complete_count, last_opened_at')
        .in('id', puzzleIds);

      if (!pError) puzzles = puzzleData || [];
    }

    // Map puzzles by id
    const puzzleMap = {};
    puzzles.forEach(p => { puzzleMap[p.id] = p; });

    // Expiry cutoff
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);
    const cutoffISO = cutoff.toISOString();

    const puzzleList = (roomPuzzles || []).map(rp => {
      const p = puzzleMap[rp.puzzle_id] || {};
      const isExpired = !p.last_opened_at || p.last_opened_at < cutoffISO;
      return {
        roomPuzzleId: rp.id,
        puzzleId: rp.puzzle_id,
        addedBy: rp.added_by,
        addedAt: rp.created_at,
        name: p.name || '未知拼图',
        gridSize: p.grid_size,
        coverFragmentUrl: getCoverUrl(p),
        roseCount: p.rose_count || 0,
        slipperCount: p.slipper_count || 0,
        completeCount: p.complete_count || 0,
        isExpired,
      };
    });

    res.json({
      id: room.id,
      name: room.name,
      createdAt: room.created_at,
      puzzleCount: puzzleList.length,
      puzzles: puzzleList,
    });
  } catch (err) {
    console.error('Error loading room:', err);
    res.status(500).json({ error: 'Failed to load room' });
  }
});

// POST /api/rooms/:id/puzzles — add puzzle to room
app.post('/api/rooms/:id/puzzles', async (req, res) => {
  try {
    const { puzzleId } = req.body;
    if (!puzzleId) {
      return res.status(400).json({ error: 'puzzleId is required' });
    }

    const deviceId = getDeviceId(req);
    const now = new Date().toISOString();
    const rpId = uuidv4();

    // Verify room exists
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', req.params.id)
      .single();

    if (roomErr || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Verify puzzle exists
    const { data: puzzle, error: pzErr } = await supabase
      .from('puzzles')
      .select('id')
      .eq('id', puzzleId)
      .single();

    if (pzErr || !puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    const { error } = await supabase
      .from('room_puzzles')
      .insert({
        id: rpId,
        room_id: req.params.id,
        puzzle_id: puzzleId,
        added_by: '匿名',
        added_by_device_id: deviceId,
        created_at: now,
      });

    if (error) {
      // UNIQUE constraint violation → already in room
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Puzzle already in this room' });
      }
      console.error('Room add puzzle error:', error);
      return res.status(500).json({ error: 'Failed to add puzzle to room' });
    }

    res.json({ roomPuzzleId: rpId });
  } catch (err) {
    console.error('Error adding to room:', err);
    res.status(500).json({ error: 'Failed to add puzzle to room' });
  }
});

// DELETE /api/rooms/:id/puzzles/:roomPuzzleId — remove puzzle from room
app.delete('/api/rooms/:id/puzzles/:roomPuzzleId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('room_puzzles')
      .delete()
      .eq('id', req.params.roomPuzzleId)
      .eq('room_id', req.params.id);

    if (error) {
      console.error('Room remove puzzle error:', error);
      return res.status(500).json({ error: 'Failed to remove puzzle from room' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error removing from room:', err);
    res.status(500).json({ error: 'Failed to remove puzzle from room' });
  }
});

// ====================================================================
// Reaction routes
// ====================================================================

// POST /api/puzzle/:id/react — rose or slipper reaction
app.post('/api/puzzle/:id/react', async (req, res) => {
  try {
    const { type } = req.body;
    if (type !== 'rose' && type !== 'slipper') {
      return res.status(400).json({ error: 'type must be "rose" or "slipper"' });
    }

    const column = type === 'rose' ? 'rose_count' : 'slipper_count';

    // Try atomic RPC first
    const { data: rpcVal, error: rpcErr } = await supabase.rpc('increment_counter', {
      puzzle_id: req.params.id,
      column_name: column,
    });

    if (!rpcErr && rpcVal !== null && rpcVal !== undefined) {
      return res.json({ [column]: rpcVal });
    }

    // Fallback: select → update
    const { data: current, error: selErr } = await supabase
      .from('puzzles')
      .select(column)
      .eq('id', req.params.id)
      .single();

    if (selErr || !current) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    const newVal = (current[column] || 0) + 1;
    const { error: updErr } = await supabase
      .from('puzzles')
      .update({ [column]: newVal })
      .eq('id', req.params.id);

    if (updErr) {
      console.error('Reaction update error:', updErr);
      return res.status(500).json({ error: 'Reaction failed' });
    }

    res.json({ [column]: newVal });
  } catch (err) {
    console.error('Error reacting:', err);
    res.status(500).json({ error: 'Reaction failed' });
  }
});

// ====================================================================
// Admin / cleanup routes
// ====================================================================

// POST /api/admin/cleanup — manual trigger
app.post('/api/admin/cleanup', async (req, res) => {
  try {
    const result = await cleanupStalePuzzles();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed: ' + err.message });
  }
});

app.get('/api/cleanup', async (req, res) => {
  console.log('[cron] Cleanup triggered via GET');
  try {
    const result = await cleanupStalePuzzles();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed: ' + err.message });
  }
});

// --- Error handling ---
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === 'Only JPG and PNG images are allowed' || err.message === '仅支持 JPG、PNG、WebP 格式的图片') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err.message });
});

// ====================================================================
// Fresh shuffle generator — each load gets a different shuffle
// ====================================================================

function generateRandomShuffle(gridSize) {
  var gs = gridSize;
  var n = gs * gs;
  var emptyRow = gs - 1;
  var emptyCol = gs - 1;
  var lastFromRow = null;
  var lastFromCol = null;
  var moves = [];
  var numMoves = n * 20;

  for (var i = 0; i < numMoves; i++) {
    var candidates = [];
    if (emptyRow > 0 && !(emptyRow - 1 === lastFromRow && emptyCol === lastFromCol))
      candidates.push({ row: emptyRow - 1, col: emptyCol });
    if (emptyRow < gs - 1 && !(emptyRow + 1 === lastFromRow && emptyCol === lastFromCol))
      candidates.push({ row: emptyRow + 1, col: emptyCol });
    if (emptyCol > 0 && !(emptyRow === lastFromRow && emptyCol - 1 === lastFromCol))
      candidates.push({ row: emptyRow, col: emptyCol - 1 });
    if (emptyCol < gs - 1 && !(emptyRow === lastFromRow && emptyCol + 1 === lastFromCol))
      candidates.push({ row: emptyRow, col: emptyCol + 1 });

    if (candidates.length === 0) break;

    var chosen = candidates[Math.floor(Math.random() * candidates.length)];
    moves.push({
      from: { row: chosen.row, col: chosen.col },
      to: { row: emptyRow, col: emptyCol }
    });
    lastFromRow = emptyRow;
    lastFromCol = emptyCol;
    emptyRow = chosen.row;
    emptyCol = chosen.col;
  }
  return moves;
}

// ====================================================================
// Cleanup logic (shared between local cron and Vercel cron)
// ====================================================================

function extractPublicId(secureUrl) {
  const match = secureUrl.match(/\/upload\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}

async function cleanupStalePuzzles() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);
  const cutoffISO = cutoff.toISOString();

  console.log(`[cleanup] Starting — cutoff ${cutoffISO} (${CLEANUP_DAYS}-day threshold)`);

  // Step 1: Unpublish stale puzzles from square (don't delete data)
  // CRITICAL: last_opened_at is TEXT → cast to ::timestamp before comparison
  const { data: unpublished, error: unpubErr } = await supabase
    .from('puzzles')
    .update({ published_to_square: false })
    .eq('published_to_square', true)
    .not('last_opened_at', 'is', null)
    .filter('last_opened_at', 'lt', cutoffISO)
    .select('id');

  if (unpubErr) {
    console.error('[cleanup] Unpublish error:', unpubErr.message);
  } else if (unpublished && unpublished.length > 0) {
    console.log(`[cleanup] Unpublished ${unpublished.length} puzzle(s) from square`);
  }

  // Step 2: Delete fully stale puzzles (unchanged from original logic)
  const { data: stale } = await supabase
    .from('puzzles')
    .select('id, image_url, last_opened_at, created_at')
    .lt('last_opened_at', cutoffISO);

  const { data: staleNull } = await supabase
    .from('puzzles')
    .select('id, image_url, last_opened_at, created_at')
    .is('last_opened_at', null)
    .lt('created_at', cutoffISO);

  const all = [...(stale || []), ...(staleNull || [])];

  if (!all.length) {
    console.log('[cleanup] No stale puzzles to delete');
    return { success: true, deleted: 0, unpublished: (unpublished || []).length };
  }

  console.log(`[cleanup] Deleting ${all.length} stale puzzle(s)`);

  for (const puzzle of all) {
    try {
      const publicId = extractPublicId(puzzle.image_url);
      if (publicId) {
        const r = await cloudinary.uploader.destroy(publicId);
        console.log(`[cleanup] Cloudinary ${publicId}: ${r.result}`);
      }

      const { error } = await supabase
        .from('puzzles')
        .delete()
        .eq('id', puzzle.id);

      if (error) {
        console.error(`[cleanup] Failed to delete ${puzzle.id}:`, error.message);
      } else {
        console.log(`[cleanup] Deleted ${puzzle.id}`);
      }
    } catch (err) {
      console.error(`[cleanup] Error on ${puzzle.id}:`, err.message);
    }
  }

  console.log('[cleanup] Finished');
  return { success: true, deleted: all.length, unpublished: (unpublished || []).length };
}

// --- Exports ---
module.exports = app;
module.exports.cleanupStalePuzzles = cleanupStalePuzzles;
