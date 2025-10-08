-- Migration: Add shuffled_question_order column to session_participants table
-- Date: Current
-- Purpose: Enable question and option shuffling to prevent answer copying

-- Add shuffled_question_order column to session_participants table
ALTER TABLE session_participants 
ADD COLUMN IF NOT EXISTS shuffled_question_order JSONB;

-- Create index for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_session_participants_shuffle 
ON session_participants USING GIN (shuffled_question_order);