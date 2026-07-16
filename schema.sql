-- Run this SQL in the Supabase SQL Editor to create/update the tables.
-- https://supabase.com/dashboard → your project → SQL Editor

-- Add name column to existing puzzles table (if not already present)
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'HuaRongImage';

-- Add last_opened_at column for auto-cleanup tracking
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS last_opened_at TEXT;

-- Create completions table for player records
CREATE TABLE IF NOT EXISTS completions (
  id            SERIAL PRIMARY KEY,
  puzzle_id     TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  player_name   TEXT NOT NULL DEFAULT '匿名玩家',
  time_seconds  INTEGER NOT NULL,
  move_count    INTEGER NOT NULL,
  completed_at  TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_completions_puzzle_time
  ON completions (puzzle_id, time_seconds ASC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_puzzles_last_opened
  ON puzzles (last_opened_at);

-- ============================================================
-- Room system
-- ============================================================

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '未命名房间',
  owner_id UUID,                    -- 预留：将来关联 users.id
  device_id TEXT,                   -- 创建设备标识
  created_at TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::text)
);

CREATE TABLE IF NOT EXISTS room_puzzles (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  added_by TEXT DEFAULT '匿名',
  added_by_user_id UUID,            -- 预留：将来关联 users.id
  added_by_device_id TEXT,          -- 添加者设备标识
  created_at TEXT NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::text),
  UNIQUE(room_id, puzzle_id)
);

CREATE INDEX IF NOT EXISTS idx_room_puzzles_room_id
  ON room_puzzles (room_id);

-- ============================================================
-- Square listing index
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_puzzles_square
  ON puzzles (published_to_square, rose_count DESC, created_at DESC);

-- ============================================================
-- Atomic counter increment for rose/slipper reactions
-- ============================================================

CREATE OR REPLACE FUNCTION increment_counter(puzzle_id TEXT, column_name TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_val INTEGER;
BEGIN
  IF column_name = 'rose_count' THEN
    UPDATE puzzles SET rose_count = rose_count + 1 WHERE id = puzzle_id
    RETURNING rose_count INTO new_val;
  ELSIF column_name = 'slipper_count' THEN
    UPDATE puzzles SET slipper_count = slipper_count + 1 WHERE id = puzzle_id
    RETURNING slipper_count INTO new_val;
  ELSE
    RAISE EXCEPTION 'Invalid column_name: % (must be rose_count or slipper_count)', column_name;
  END IF;
  RETURN new_val;
END;
$$ LANGUAGE plpgsql;
