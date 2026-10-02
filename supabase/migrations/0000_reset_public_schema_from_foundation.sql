DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0000_reset_public_schema_from_foundation.sql';
END $$;


-- Reset the public schema so the database can be rebuilt from
-- supabase/migrations/0001_foundation.sql.
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/samples/reset_public_schema_from_foundation.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_foundation.sql
--
-- This drops everything in public (tables, views, functions, triggers, sequences,
-- constraints, RLS policies, etc.) so the next migration can start cleanly.

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Dropping the schema also drops Supabase's bootstrap grants and default
-- privileges for the PostgREST roles. Without these every table created by the
-- migrations below is unreachable over the REST API ("permission denied for
-- table ..."), regardless of RLS.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN CONTINUE; END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', r);

    -- `anon` is pre-login and has no RLS policies, so it never gets table DML.
    IF r <> 'anon' THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON SCHEMA public TO service_role';
  END IF;
END $$;

COMMIT;

-- After this, re-run the foundation migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_foundation.sql

