-- Fix: prevent_locked_invoice_change() referenced old.invoice_id on the invoices
-- table, where the field does not exist (record fields resolve at plan time,
-- so the CASE branch did not protect it). JSONB extraction is table-agnostic.
create or replace function prevent_locked_invoice_change() returns trigger language plpgsql as $$
declare iid uuid;
begin
  iid := coalesce((to_jsonb(old)->>'invoice_id')::uuid, (to_jsonb(old)->>'id')::uuid);
  if exists (select 1 from invoices where id = iid and status in ('approved', 'paid')) then
    raise exception 'approved invoice is locked';
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end $$;
