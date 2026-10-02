-- Seed default coaching and sparrer hourly rate cards.
-- Run with:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/samples/staff_rate_cards_seed.sql
--
-- Rates:
--   Coaches: Standard £25/hr, Premium £40/hr
--   Sparrers: Standard £10/hr, Premium £15/hr
--
-- This script is idempotent: it only inserts rows that do not already exist for the
-- same staff + label + rate + valid_from date.

BEGIN;

insert into mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
select s.organization_id, s.id, 'Standard', 2500, current_date, null
from mentis_staff s
where 'COACH' = any (s.roles)
  and not exists (
    select 1
    from mentis_rate_cards r
    where r.organization_id = s.organization_id
      and r.staff_id = s.id
      and r.label = 'Standard'
      and r.rate_cents = 2500
      and r.valid_from = current_date
      and r.valid_to is null
  );

insert into mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
select s.organization_id, s.id, 'Premium', 4000, current_date, null
from mentis_staff s
where 'COACH' = any (s.roles)
  and not exists (
    select 1
    from mentis_rate_cards r
    where r.organization_id = s.organization_id
      and r.staff_id = s.id
      and r.label = 'Premium'
      and r.rate_cents = 4000
      and r.valid_from = current_date
      and r.valid_to is null
  );

insert into mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
select s.organization_id, s.id, 'Standard', 1000, current_date, null
from mentis_staff s
where 'SPARRER' = any (s.roles)
  and not exists (
    select 1
    from mentis_rate_cards r
    where r.organization_id = s.organization_id
      and r.staff_id = s.id
      and r.label = 'Standard'
      and r.rate_cents = 1000
      and r.valid_from = current_date
      and r.valid_to is null
  );

insert into mentis_rate_cards (organization_id, staff_id, label, rate_cents, valid_from, valid_to)
select s.organization_id, s.id, 'Premium', 1500, current_date, null
from mentis_staff s
where 'SPARRER' = any (s.roles)
  and not exists (
    select 1
    from mentis_rate_cards r
    where r.organization_id = s.organization_id
      and r.staff_id = s.id
      and r.label = 'Premium'
      and r.rate_cents = 1500
      and r.valid_from = current_date
      and r.valid_to is null
  );

COMMIT;
