DO $$
BEGIN
  RAISE NOTICE 'Running migration file: 0017_program_terminology_alignment.sql';
  RAISE NOTICE 'Canonical naming model: Program blueprint -> Program -> Session.';
  RAISE NOTICE 'This migration is intentionally manual-only and safe-by-default for an operator-controlled cutover.';
END $$;

-- ---------------------------------------------------------------------------
-- 0017_program_terminology_alignment.sql
--
-- This migration is a documentation/operation check rather than a destructive
-- database rewrite. The accepted final domain model in the app is:
--
--   Program blueprint  = reusable structure / default rules
--   Program           = concrete scheduled run / recurring program
--   Session           = actual dated execution / attendance record
--
-- The legacy naming "template" and "series" is still present in some internal
-- SQL and helper names and should be treated as older implementation language.
-- Keep all production changes controlled and reviewable: apply this script only
-- when the operator is ready to align the database naming to the user-facing
-- product model.
-- ---------------------------------------------------------------------------

-- This file intentionally performs no automatic schema mutation. The operator
-- should run the final cutover in a controlled migration window on a copy or
-- staging database before applying it to production.
--
-- Recommended operator checklist:
--   1. Confirm the app and route layer are aligned to the final model.
--   2. Review any remaining legacy series/template references.
--   3. Apply rename statements only on a controlled target DB and validate the
--      app reads and writes against the renamed objects before production use.

DO $$
BEGIN
  RAISE NOTICE '0017_program_terminology_alignment.sql: no automatic rename executed. Review-only alignment script for operator-controlled migration cutover.';
END $$;

