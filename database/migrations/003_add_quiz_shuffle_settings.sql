-- Migration: Add shuffle settings to quizzes table
-- Date: Current
-- Purpose: Add configuration options for question and option shuffling

-- Add shuffle settings columns to quizzes table
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS shuffle_options BOOLEAN DEFAULT true;

-- Update existing quizzes to have shuffling enabled by default
UPDATE quizzes 
SET shuffle_questions = true, shuffle_options = true 
WHERE shuffle_questions IS NULL OR shuffle_options IS NULL;