-- Add payout_date column to deals table
-- This tracks when the commission was actually received (separate from deal paid status)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payout_date DATE;

-- Create index for filtering by payout status
CREATE INDEX IF NOT EXISTS idx_deals_payout_date ON deals(payout_date);
