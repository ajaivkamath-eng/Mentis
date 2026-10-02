DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0023_staff_rate_cards_defaults.sql';
END $$;

-- Default rate card tiers for all staff in the organization.
-- Standard rate cards are created for all coaches and sparrers.
-- Premium rate cards are also created for all coaches and sparrers.
-- One of the two tiers is then marked as the active default used by the app.
--
-- Rates:
--   Coaches: Standard 2500 cents/hr, Premium 4000 cents/hr
--   Sparrers: Standard 1000 cents/hr, Premium 1500 cents/hr
--
-- This is intentionally idempotent and safe to re-run.

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Standard', 2500, current_date, NULL
FROM mentis_staff s
WHERE 'COACH' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Standard'
      AND r.rate_cents = 2500
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Premium', 4000, current_date, NULL
FROM mentis_staff s
WHERE 'COACH' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Premium'
      AND r.rate_cents = 4000
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Standard', 1000, current_date, NULL
FROM mentis_staff s
WHERE 'SPARRER' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Standard'
      AND r.rate_cents = 1000
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

INSERT INTO mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
SELECT s.organization_id, s.id, 'Premium', 1500, current_date, NULL
FROM mentis_staff s
WHERE 'SPARRER' = ANY (s.roles)
  AND NOT EXISTS (
    SELECT 1
    FROM mentis_rate_cards r
    WHERE r.organization_id = s.organization_id
      AND r.staff_id = s.id
      AND r.label = 'Premium'
      AND r.rate_cents = 1500
      AND r.valid_from = current_date
      AND r.valid_to IS NULL
  );

-- Default active rate selection: Standard is treated as the default tier for all staff.
-- This is represented as a database-level business rule so the app can resolve the current
-- default from the valid date window rather than maintaining a separate is_default flag.
-- If you prefer Premium as the default later, update the label below and keep the same date rule.
CREATE OR REPLACE FUNCTION mentis_default_rate_card_id_for_staff(p_staff_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM mentis_rate_cards
  WHERE staff_id = p_staff_id
    AND label = 'Standard'
    AND valid_from <= current_date
    AND (valid_to IS NULL OR valid_to >= current_date)
  ORDER BY valid_from DESC, id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION mentis_default_rate_card_id_for_staff(uuid) IS
  'Returns the active Standard rate card for a staff member based on the current date and valid_from/valid_to window.';

-- Note:
-- The repo's current schema does not include an explicit 'is_default' flag on mentis_rate_cards.
-- The accepted pattern is to keep both tiers and resolve the default via the latest active
-- Standard card in the valid date window. This helper gives the app and DB a single source of truth.
