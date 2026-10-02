drop trigger if exists audit_staff_roles on mentis_staff;
drop trigger if exists audit_medical_write on mentis_member_medical;
drop trigger if exists audit_task_approval on mentis_tasks;
drop trigger if exists audit_invoice_approval on mentis_invoices;
drop trigger if exists audit_charge_move on mentis_customer_charges;

create or replace function audit_write() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  act text;
  eid uuid;
  nj jsonb;
  oj jsonb;
begin
  act := TG_ARGV[0];
  nj := to_jsonb(new);
  oj := to_jsonb(old);

  if TG_TABLE_NAME = 'mentis_member_medical' then
    eid := coalesce((nj->>'member_id')::uuid, (oj->>'member_id')::uuid);
    select organization_id into org
    from mentis_members
    where id = eid;
  else
    org := coalesce((nj->>'organization_id')::uuid, (oj->>'organization_id')::uuid);
    eid := coalesce((nj->>'id')::uuid, (oj->>'id')::uuid);
  end if;

  insert into mentis_audit_log (
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  )
  values (
    org,
    auth.uid(),
    act,
    TG_TABLE_NAME,
    eid,
    jsonb_build_object(
      'op', TG_OP,
      'old_roles', oj->'roles',
      'new_roles', nj->'roles'
    )
  );

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

create trigger audit_staff_roles
after update or delete on mentis_staff
for each row
execute function audit_write('role.change');

create trigger audit_medical_write
after insert or update or delete on mentis_member_medical
for each row
execute function audit_write('medical.write');

create trigger audit_task_approval
after update on mentis_tasks
for each row
when (old.approved_at is distinct from new.approved_at)
execute function audit_write('task.approval');

create trigger audit_invoice_approval
after update on mentis_invoices
for each row
when (old.status is distinct from new.status)
execute function audit_write('invoice.status');

create trigger audit_charge_move
after insert or update on mentis_customer_charges
for each row
execute function audit_write('charge.move');