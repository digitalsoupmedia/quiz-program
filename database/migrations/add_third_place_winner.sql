-- Migration: Add third place winner support
-- This script updates the prize_winners table to allow third place (position 3)

-- Drop the existing constraint
ALTER TABLE prize_winners DROP CONSTRAINT IF EXISTS prize_winners_prize_position_check;

-- Add the new constraint that includes position 3
ALTER TABLE prize_winners ADD CONSTRAINT prize_winners_prize_position_check 
    CHECK (prize_position IN (1, 2, 3));

-- Verify the change
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'prize_winners_prize_position_check';