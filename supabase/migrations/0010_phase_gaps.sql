-- Mentis phase-gap schema: work notes, review SLA offsets, member self-service
-- codes, device push tokens, and org-level policy key/values.
alter table tasks add column if not exists work_notes text;
alter table action_types add column if not exists review_offset interval;
alter table members add column if not exists member_code text unique;
alter table devices add column if not exists push_token text;
alter table devices add column if not exists platform text;

create table if not exists organization_policies (
  organization_id uuid not null references organizations(id),
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);
alter table organization_policies enable row level security;
drop policy if exists opp_select on organization_policies;
create policy opp_select on organization_policies for select using (is_staff(organization_id));
drop policy if exists opp_write on organization_policies;
create policy opp_write on organization_policies for all using (is_admin(organization_id));

-- Backfill stable 6-char member codes for micro-flow / booking auth.
update members set member_code = upper(substring(md5(id::text) from 1 for 6))
where member_code is null;

insert into organization_policies (organization_id, key, value) values
  ('00000000-0000-0000-0000-000000000001', 'escalationFrequencyDays', '7'),
  ('00000000-0000-0000-0000-000000000001', 'breachNotify', 'true'),
  ('00000000-0000-0000-0000-000000000001', 'progressReportDay', '1')
on conflict (organization_id, key) do nothing;

-- Hourly task-reminder scheduler (enable per environment with the real functions URL).
select cron.schedule('mentis-task-reminders', '0 * * * *',
  $$ select net.http_post('https://project.functions.supabase.co/task-reminders',
    '{}', '{"Content-Type":"application/json"}') $$) where false;
