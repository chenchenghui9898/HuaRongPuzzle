const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabase');

const app = express();
const CLEANUP_DAYS = 30;

// --- Cloudinary config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Middleware ---
app.use(express.json());

// CORS — allow all origins in development
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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

// --- API Routes ---

// POST /api/puzzles
app.post('/api/puzzles', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const { gridSize, moves, hiddenIndex, name } = req.body;
    if (!gridSize || !moves || hiddenIndex === undefined) {
      return res.status(400).json({ error: 'gridSize, moves, and hiddenIndex are required' });
    }

    const gridSizeNum = parseInt(gridSize, 10);
    if (gridSizeNum < 3 || gridSizeNum > 7) {
      return res.status(400).json({ error: 'gridSize must be between 3 and 7' });
    }

    const puzzleName = (name && name.trim()) ? name.trim() : 'HuaRongImage';
    const now = new Date().toISOString();

    const b64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${b64}`;

    const cloudResult = await cloudinary.uploader.upload(dataUri, {
      folder: 'picture-klotski',
      resource_type: 'image',
    });

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

// GET /api/puzzles/:id
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

    // Touch last_opened_at (fire-and-forget)
    supabase
      .from('puzzles')
      .update({ last_opened_at: new Date().toISOString() })
      .eq('id', puzzle.id)
      .then(({ error: updateErr }) => {
        if (updateErr) console.error('Failed to update last_opened_at:', updateErr.message);
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
    });
  } catch (err) {
    console.error('Error loading puzzle:', err);
    res.status(500).json({ error: 'Failed to load puzzle' });
  }
});

// POST /api/completions
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

  console.log(`[cleanup] Starting — cutoff ${cutoffISO}`);

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
    console.log('[cleanup] No stale puzzles');
    return { success: true, deleted: 0 };
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
  return { success: true, deleted: all.length };
}

// --- Exports ---
module.exports = app;
module.exports.cleanupStalePuzzles = cleanupStalePuzzles;
