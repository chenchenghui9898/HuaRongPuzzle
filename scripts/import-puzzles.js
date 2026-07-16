/**
 * Import Script — Batch-import puzzles into Supabase + Cloudinary.
 *
 * Usage:  node scripts/import-puzzles.js
 *
 * Reads scripts/seed-puzzles.json, for each entry:
 *   1. Check duplicate by name (skip if exists)
 *   2. Upload source image to Cloudinary
 *   3. Generate cover fragment URL via Cloudinary transform
 *   4. HEAD-verify the fragment URL is accessible (with timeout)
 *   5. Generate legal shuffle moves
 *   6. Insert into Supabase puzzles table
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HEAD_TIMEOUT_MS = 10000;
const SEED_FILE = path.join(__dirname, 'seed-puzzles.json');

// ------------------------------------------------------------------
// HEAD check — verify a URL is reachable (with timeout)
// ------------------------------------------------------------------

async function checkUrlExists(url) {
  return new Promise((resolve) => {
    const { request } = url.startsWith('https')
      ? require('https')
      : require('http');

    const req = request(url, { method: 'HEAD', timeout: HEAD_TIMEOUT_MS }, (res) => {
      // 2xx or 3xx = accessible
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// ------------------------------------------------------------------
// Shuffle generator — produce legal moves from solved state
// ------------------------------------------------------------------

function generateShuffledMoves(gridSize) {
  const n = gridSize * gridSize;
  let emptyRow = gridSize - 1;
  let emptyCol = gridSize - 1;
  let lastFromRow = null;
  let lastFromCol = null;
  const moves = [];
  const numMoves = n * 50; // per requirement

  // Build solved state as flat array
  const state = [];
  for (let i = 0; i < n; i++) state.push(i);

  for (let i = 0; i < numMoves; i++) {
    const candidates = [];
    if (emptyRow > 0 && !(emptyRow - 1 === lastFromRow && emptyCol === lastFromCol))
      candidates.push({ row: emptyRow - 1, col: emptyCol });
    if (emptyRow < gridSize - 1 && !(emptyRow + 1 === lastFromRow && emptyCol === lastFromCol))
      candidates.push({ row: emptyRow + 1, col: emptyCol });
    if (emptyCol > 0 && !(emptyRow === lastFromRow && emptyCol - 1 === lastFromCol))
      candidates.push({ row: emptyRow, col: emptyCol - 1 });
    if (emptyCol < gridSize - 1 && !(emptyRow === lastFromRow && emptyCol + 1 === lastFromCol))
      candidates.push({ row: emptyRow, col: emptyCol + 1 });

    if (candidates.length === 0) break;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    // Swap flat-array indices
    const fromIdx = chosen.row * gridSize + chosen.col;
    const toIdx = emptyRow * gridSize + emptyCol;
    const tmp = state[fromIdx];
    state[fromIdx] = state[toIdx];
    state[toIdx] = tmp;

    moves.push({ from: chosen.row * gridSize + chosen.col, to: emptyRow * gridSize + emptyCol });

    lastFromRow = emptyRow;
    lastFromCol = emptyCol;
    emptyRow = chosen.row;
    emptyCol = chosen.col;
  }

  return { shuffledState: state, moves };
}

// ------------------------------------------------------------------
// Cover fragment URL via Cloudinary transform
// ------------------------------------------------------------------

function buildCoverFragmentUrl(publicId) {
  return cloudinary.url(publicId, {
    width: 200,
    height: 200,
    crop: 'crop',
    gravity: 'center',
    quality: 'auto',
    fetch_format: 'auto',
    secure: true,
  });
}

// ------------------------------------------------------------------
// Main import loop
// ------------------------------------------------------------------

async function importPuzzles() {
  console.log('[import] Loading seed data from', SEED_FILE);
  let puzzles;
  try {
    puzzles = require(SEED_FILE);
  } catch (err) {
    console.error('[import] Failed to read seed file:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(puzzles) || puzzles.length === 0) {
    console.error('[import] Seed file contains no puzzles');
    process.exit(1);
  }

  console.log('[import] Found', puzzles.length, 'puzzle(s) to import\n');

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of puzzles) {
    const label = `"${item.name}" (${item.gridSize}×${item.gridSize})`;
    console.log('---');

    try {
      // 1. Check duplicate by name
      console.log(`[import] ${label} — checking for duplicates...`);
      const { data: existing, error: checkErr } = await supabase
        .from('puzzles')
        .select('id')
        .eq('name', item.name)
        .limit(1);

      if (checkErr) {
        console.error(`[import] ${label} — duplicate check failed:`, checkErr.message);
        failed++;
        continue;
      }

      if (existing && existing.length > 0) {
        console.log(`[import] ${label} — already exists, skipping`);
        skipped++;
        continue;
      }

      // 2. Upload to Cloudinary
      console.log(`[import] ${label} — uploading to Cloudinary...`);
      const uploadResult = await cloudinary.uploader.upload(item.imageUrl, {
        folder: 'picture-klotski',
        overwrite: false,
      });
      console.log(`[import] ${label} — uploaded: ${uploadResult.secure_url}`);

      // 3. Build and verify cover fragment URL
      const coverUrl = buildCoverFragmentUrl(uploadResult.public_id);
      console.log(`[import] ${label} — checking cover URL...`);

      const coverAccessible = await checkUrlExists(coverUrl);
      if (!coverAccessible) {
        console.warn(`[import] ${label} — cover URL not accessible (HEAD failed), using anyway: ${coverUrl}`);
      } else {
        console.log(`[import] ${label} — cover URL verified`);
      }

      // 4. Generate shuffle moves
      const { shuffledState, moves } = generateShuffledMoves(item.gridSize);
      // Validate hiddenIndex
      const maxIndex = item.gridSize * item.gridSize - 1;
      const hiddenIndex = Math.min(Math.max(0, item.hiddenIndex), maxIndex);

      // 5. Insert into Supabase
      const now = new Date().toISOString();
      const { data: inserted, error: insertErr } = await supabase
        .from('puzzles')
        .insert({
          id: require('crypto').randomUUID(),
          name: item.name,
          image_url: uploadResult.secure_url,
          grid_size: item.gridSize,
          moves: JSON.stringify(shuffledState),
          hidden_index: hiddenIndex,
          created_at: now,
          last_opened_at: now,
          cover_fragment_url: coverUrl,
          published_to_square: true,
          rose_count: 0,
          slipper_count: 0,
          open_count: 0,
          complete_count: 0,
          device_id: 'seed-import',
          user_id: null,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error(`[import] ${label} — insert failed:`, insertErr.message);
        failed++;
        continue;
      }

      console.log(`[import] ${label} — ✅ imported (id: ${inserted.id})`);
      imported++;

    } catch (err) {
      console.error(`[import] ${label} — error:`, err.message);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('[import] Done!');
  console.log('  Imported:', imported);
  console.log('  Skipped: ', skipped);
  console.log('  Failed:  ', failed);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

importPuzzles();
