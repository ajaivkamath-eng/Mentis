DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0022_api_role_grants.sql';
END $$;


-- PostgREST connects as `anon` / `authenticated` / `service_role`, never as the
-- table owner. Table-level privileges are therefore a prerequisite for every
-- API call; RLS (0006_rls_matrix.sql) remains the row-level gate on top.
--
-- 0000_reset_public_schema_from_foundation.sql drops the public schema, which
-- also drops Supabase's bootstrap grants. This migration re-establishes them
-- for everything the chain created and for everything created afterwards. It
-- is idempotent and safe to re-run against an already-migrated database.

-- `anon` gets schema usage only: it has no RLS policies, so it can see nothing.
-- `authenticated` gets DML on tables, filtered by RLS.
-- `service_role` bypasses RLS and is used by edge functions and jobs.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN CONTINUE; END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', r);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', r);

    IF r <> 'anon' THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', r);
    END IF;
  END LOOP;
END $$;

-- The grants above are only safe because every base table is RLS-protected.
-- A table added without RLS would become readable by any signed-in user, so
-- fail the migration rather than ship the hole.
DO $$
DECLARE unprotected text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION '%: row level security is disabled on: %', '0022_api_role_grants.sql', unprotected;
  END IF;
END $$;
