ALTER TABLE IF EXISTS organizations RENAME TO mentis_organizations;
ALTER TABLE IF EXISTS venues RENAME TO mentis_venues;
ALTER TABLE IF EXISTS customers RENAME TO mentis_customers;
ALTER TABLE IF EXISTS members RENAME TO mentis_members;
ALTER TABLE IF EXISTS sessions RENAME TO mentis_sessions;
ALTER TABLE IF EXISTS enrollments RENAME TO mentis_enrollments;
ALTER TABLE IF EXISTS attendance_records RENAME TO mentis_attendance_records;
ALTER TABLE IF EXISTS audit_log RENAME TO mentis_audit_log;

ALTER TABLE IF EXISTS holiday_calendar RENAME TO mentis_holiday_calendar;
ALTER TABLE IF EXISTS weekly_schedules RENAME TO mentis_weekly_schedules;
ALTER TABLE IF EXISTS rate_cards RENAME TO mentis_rate_cards;
ALTER TABLE IF EXISTS schedule_staff RENAME TO mentis_schedule_staff;
ALTER TABLE IF EXISTS schedule_overrides RENAME TO mentis_schedule_overrides;
ALTER TABLE IF EXISTS session_staffing RENAME TO mentis_session_staffing;
ALTER TABLE IF EXISTS staff_availability RENAME TO mentis_staff_availability;
ALTER TABLE IF EXISTS tasks RENAME TO mentis_tasks;
ALTER TABLE IF EXISTS staff_time_entries RENAME TO mentis_staff_time_entries;
ALTER TABLE IF EXISTS invoices RENAME TO mentis_invoices;
ALTER TABLE IF EXISTS invoice_lines RENAME TO mentis_invoice_lines;
ALTER TABLE IF EXISTS action_types RENAME TO mentis_action_types;
ALTER TABLE IF EXISTS pending_actions RENAME TO mentis_pending_actions;

ALTER TABLE IF EXISTS sport_profiles RENAME TO mentis_sport_profiles;
ALTER TABLE IF EXISTS member_medical RENAME TO mentis_member_medical;
ALTER TABLE IF EXISTS session_segments RENAME TO mentis_session_segments;
ALTER TABLE IF EXISTS prospects RENAME TO mentis_prospects;
ALTER TABLE IF EXISTS groups RENAME TO mentis_groups;
ALTER TABLE IF EXISTS group_members RENAME TO mentis_group_members;
ALTER TABLE IF EXISTS member_goals RENAME TO mentis_member_goals;

ALTER TABLE IF EXISTS events RENAME TO mentis_events;
ALTER TABLE IF EXISTS sub_events RENAME TO mentis_sub_events;
ALTER TABLE IF EXISTS event_entries RENAME TO mentis_event_entries;
ALTER TABLE IF EXISTS matches RENAME TO mentis_matches;
ALTER TABLE IF EXISTS rankings RENAME TO mentis_rankings;
ALTER TABLE IF EXISTS player_feedback RENAME TO mentis_player_feedback;

ALTER TABLE IF EXISTS billing_ledger RENAME TO mentis_billing_ledger;
ALTER TABLE IF EXISTS customer_charges RENAME TO mentis_customer_charges;
ALTER TABLE IF EXISTS communication_log RENAME TO mentis_communication_log;
ALTER TABLE IF EXISTS booking_slots RENAME TO mentis_booking_slots;
ALTER TABLE IF EXISTS bookings RENAME TO mentis_bookings;
ALTER TABLE IF EXISTS progress_reports RENAME TO mentis_progress_reports;
ALTER TABLE IF EXISTS devices RENAME TO mentis_devices;

ALTER TABLE IF EXISTS organization_policies RENAME TO mentis_organization_policies;