DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0024_rate_cards_valid_to.sql';
END $$;

ALTER TABLE mentis_rate_cards
  ADD COLUMN IF NOT EXISTS valid_to date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mentis_rate_cards'
      AND column_name = 'valid_to'
  ) THEN
    ALTER TABLE mentis_rate_cards
      DROP CONSTRAINT IF EXISTS mentis_rate_cards_valid_to_check;

    ALTER TABLE mentis_rate_cards
      ADD CONSTRAINT mentis_rate_cards_valid_to_check
      CHECK (valid_to IS NULL OR valid_to >= valid_from);
  END IF;
END $$;

-- Backfill existing rows with a null end date so prior cards remain active indefinitely.
UPDATE mentis_rate_cards
SET valid_to = NULL
WHERE valid_to IS NULL;
