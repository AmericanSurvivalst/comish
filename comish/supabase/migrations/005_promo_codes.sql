-- Add promo_code column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS promo_code TEXT;

-- Create index for promo code lookups
CREATE INDEX IF NOT EXISTS idx_profiles_promo_code ON profiles(promo_code);
