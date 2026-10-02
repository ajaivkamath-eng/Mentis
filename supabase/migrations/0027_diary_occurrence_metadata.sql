-- Diary metadata needed by the calendar-first workspace.
-- `all_day` preserves the user's all-day choice (timestamps alone cannot tell
-- an all-day vacation from a timed entry); `occurrence_start_time` identifies
-- the exact generated window a planner exception replaces when a rule has
-- multiple windows on the same weekday.

ALTER TABLE mentis_staff_availability
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

ALTER TABLE mentis_staff_availability
  ADD COLUMN IF NOT EXISTS occurrence_start_time time without time zone;

COMMENT ON COLUMN mentis_staff_availability.all_day IS
  'True when the diary entry spans whole local calendar days; starts_at / ends_at still hold the inclusive display range.';

COMMENT ON COLUMN mentis_staff_availability.occurrence_start_time IS
  'Original local start time for a planner-generated occurrence exception; pairs with rule_id and occurrence_date.';
