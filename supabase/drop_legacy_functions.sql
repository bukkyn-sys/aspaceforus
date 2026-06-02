-- ════════════════════════════════════════════════════════════════════════════
-- Drop legacy, unused, unguarded SECURITY DEFINER functions (security plan H1).
-- The app drives all this CRUD through direct table access + RLS instead, so
-- these are unreachable from the UI and just attack surface. Safe to run.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'add_countdown','add_event','add_ledger_entry','add_savings_pot','add_vault_item',
        'contribute_to_pot','delete_countdown','delete_event','delete_savings_pot',
        'delete_vault_item','settle_all','update_my_role','update_vault_item','update_vault_stage')
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- Drop ONLY the legacy 4-arg push overload (KEEP the 3-arg jsonb one the app uses).
drop function if exists save_push_subscription(uuid, text, text, text);

-- Re-verify — should now return ONLY: handle_new_user
select p.proname as unguarded_security_definer_function
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
order by p.proname;
