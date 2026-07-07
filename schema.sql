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
