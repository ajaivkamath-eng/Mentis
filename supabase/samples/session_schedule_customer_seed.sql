BEGIN;

-- Create parent / guardian customer rows for the members created by the session schedule import.
-- This is additive only: it does not modify the existing seed/import SQL in the sample script.
WITH member_targets AS (
  SELECT
    m.id AS member_id,
    m.organization_id,
    'Parent of ' || m.name AS customer_name,
    lower(regexp_replace(m.name, '[^a-z0-9]+', '_', 'g')) || '_parent@example.com' AS customer_email,
    '+44' || lpad((abs(hashtext(m.id::text)) % 900000000 + 100000000)::text, 9, '0') AS customer_phone
  FROM public.mentis_members m
  WHERE m.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND m.customer_id IS NULL
),
new_customers AS (
  INSERT INTO public.mentis_customers (
    organization_id,
    name,
    email,
    phone
  )
  SELECT
    mt.organization_id,
    mt.customer_name,
    mt.customer_email,
    mt.customer_phone
  FROM member_targets mt
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.mentis_customers c
    WHERE c.organization_id = mt.organization_id
      AND c.name = mt.customer_name
  )
  RETURNING id, organization_id, name
)
UPDATE public.mentis_members m
SET customer_id = c.id
FROM member_targets mt
JOIN public.mentis_customers c
  ON c.organization_id = mt.organization_id
 AND c.name = mt.customer_name
WHERE m.id = mt.member_id
  AND m.customer_id IS NULL;

COMMIT;
