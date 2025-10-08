-- Migration: Add auto_start column to quiz_sessions table
-- Date: Current
-- Purpose: Add auto_start functionality to sessions

-- Add auto_start column to quiz_sessions table
ALTER TABLE quiz_sessions 
ADD COLUMN IF NOT EXISTS auto_start BOOLEAN DEFAULT FALSE;

-- Update any existing sessions to have auto_start=false by default
UPDATE quiz_sessions 
SET auto_start = FALSE 
WHERE auto_start IS NULL;