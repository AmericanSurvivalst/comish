-- Add payout_date and paid_date columns to deals table
-- payout_date: When the commission was actually received
-- paid_date: When the customer paid the invoice
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payout_date DATE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS paid_date DATE;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_deals_payout_date ON deals(payout_date);
CREATE INDEX IF NOT EXISTS idx_deals_paid_date ON deals(paid_date);
