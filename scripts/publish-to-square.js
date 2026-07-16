/**
 * Publish existing puzzles to the square.
 *
 * Reads scripts/seed-puzzles.json, extracts puzzle IDs from the URLs,
 * then updates each puzzle: published_to_square = true.
 * Also generates cover_fragment_url via Cloudinary transform if missing.
 *
 * Usage:  node scripts/publish-to-square.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SEED_FILE = path.join(__dirname, 'seed-puzzles.json');

function extractPuzzleId(url) {
  // Extract UUID from URLs like:
  //   https://huarongpuzzle.onrender.com/?puzzle=7f42b17c-...
  //   /puzzle/7f42b17c-...
  const m = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  return m ? m[0] : null;
}

// Generate cover URL via Cloudinary transform
function buildCoverUrl(imageUrl) {
  if (!imageUrl) return null;
  const match = imageUrl.match(/\/upload\/(v\d+\/.+)$/);
  if (!match) return null;
  return imageUrl.replace(/\/upload\//, '/upload/c_crop,g_center,h_200,w_200/');
}

async function publishToSquare() {
  console.log('[publish] Loading seed data...');
  let entries;
  try {
    entries = require(SEED_FILE);
  } catch (err) {
    console.error('[publish] Failed to read seed file:', err.message);
    process.exit(1);
  }

  console.log('[publish] Found', entries.length, 'entries\n');

  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of entries) {
    const puzzleId = extractPuzzleId(item.imageUrl);
    if (!puzzleId) {
      console.log('[publish] "' + item.name + '" — could not extract puzzle ID, skipping');
      skipped++;
      continue;
    }

    try {
      // Fetch the existing puzzle
      const { data: puzzle, error } = await supabase
        .from('puzzles')
        .select('id, name, image_url, cover_fragment_url, published_to_square')
        .eq('id', puzzleId)
        .single();

      if (error || !puzzle) {
        console.log('[publish] "' + item.name + '" (' + puzzleId + ') — puzzle not found, skipping');
        skipped++;
        continue;
      }

      if (puzzle.published_to_square) {
        console.log('[publish] "' + puzzle.name + '" — already published, skipping');
        skipped++;
        continue;
      }

      // Build cover URL if missing
      const coverUrl = puzzle.cover_fragment_url || buildCoverUrl(puzzle.image_url);

      const { error: updErr } = await supabase
        .from('puzzles')
        .update({
          published_to_square: true,
          cover_fragment_url: coverUrl || puzzle.cover_fragment_url,
        })
        .eq('id', puzzleId);

      if (updErr) {
        console.error('[publish] "' + puzzle.name + '" — update failed:', updErr.message);
        failed++;
      } else {
        console.log('[publish] "' + puzzle.name + '" (' + puzzleId + ') — ✅ published');
        published++;
      }
    } catch (err) {
      console.error('[publish] "' + item.name + '" — error:', err.message);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('[publish] Done!');
  console.log('  Published:', published);
  console.log('  Skipped: ', skipped);
  console.log('  Failed:  ', failed);
  console.log('========================================');

  process.exit(failed > 0 ? 1 : 0);
}

publishToSquare();
