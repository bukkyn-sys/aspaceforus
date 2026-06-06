-- ════════════════════════════════════════════════════════════════════════════
-- Vault to-dos — "needs both to tick".
-- An item can require BOTH partners to tick it before it counts as done.
-- ticked_by tracks who has ticked; done is derived (needs_both ? both : ≥1).
-- toggle_todo_tick does the read-modify-write atomically (the array is racy from
-- the client) and handles recurring spawn on fresh completion.
-- Idempotent. Run after vault_todos.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table vault_todos add column if not exists needs_both boolean not null default false;
alter table vault_todos add column if not exists ticked_by  uuid[] not null default '{}';

create or replace function toggle_todo_tick(p_id uuid, p_couple_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ticked uuid[]; v_needs boolean; v_done_before boolean; v_members uuid[]; v_done boolean;
  v_recur text; v_parent uuid; v_title text; v_notes text; v_assignee text; v_due date; v_list uuid; v_next date;
begin
  if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  select ticked_by, needs_both, done, recurrence, parent_id, title, notes, assignee, due_date, list_id
    into v_ticked, v_needs, v_done_before, v_recur, v_parent, v_title, v_notes, v_assignee, v_due, v_list
    from vault_todos where id = p_id and couple_id = p_couple_id;
  if v_title is null then return null; end if;

  v_ticked := coalesce(v_ticked, '{}');
  if auth.uid() = any(v_ticked) then v_ticked := array_remove(v_ticked, auth.uid());
  else v_ticked := array_append(v_ticked, auth.uid()); end if;

  select array_agg(id) into v_members from profiles where couple_id = p_couple_id;
  v_done := case when v_needs then (v_members <@ v_ticked)
                 else coalesce(array_length(v_ticked, 1), 0) >= 1 end;

  update vault_todos set ticked_by = v_ticked, done = v_done,
    done_at = case when v_done then now() else null end,
    done_by = case when v_done then auth.uid() else null end,
    updated_at = now()
  where id = p_id and couple_id = p_couple_id;

  -- Recurring: spawn the next occurrence on a fresh completion (top-level only).
  if v_done and not v_done_before and v_recur is not null and v_recur <> 'none' and v_parent is null then
    v_next := case v_recur
      when 'daily'   then coalesce(v_due, current_date) + 1
      when 'weekly'  then coalesce(v_due, current_date) + 7
      when 'monthly' then (coalesce(v_due, current_date) + interval '1 month')::date
      else null end;
    insert into vault_todos (couple_id, list_id, created_by, title, notes, assignee, recurrence, needs_both, due_date)
    values (p_couple_id, v_list, auth.uid(), v_title, v_notes, v_assignee, v_recur, v_needs, v_next);
  end if;

  return jsonb_build_object(
    'done', v_done,
    'i_ticked', auth.uid() = any(v_ticked),
    'became_done', v_done and not v_done_before,
    'needs_more', v_needs and (auth.uid() = any(v_ticked)) and not v_done
  );
end; $$;
