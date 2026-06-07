"use server";

import { getUid } from "@/lib/auth-server";
import { notifyPartner } from "@/lib/push";

export async function createTodoList(coupleId: string, title: string, emoji: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data } = await supabase
    .from("vault_todo_lists")
    .insert({ couple_id: coupleId, created_by: uid, title, emoji })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

export async function renameTodoList(id: string, coupleId: string, title: string, emoji: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_todo_lists").update({ title, emoji }).eq("id", id).eq("couple_id", coupleId);
}

export async function deleteTodoList(id: string, coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_todo_lists").delete().eq("id", id).eq("couple_id", coupleId);
}

export async function addTodo(data: {
  coupleId: string;
  listId: string;
  title: string;
  notes?: string;
  dueDate?: string;
  assignee?: string;
  recurrence?: string;
  parentId?: string;
  remind?: boolean;
  needsBoth?: boolean;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data: row } = await supabase
    .from("vault_todos")
    .insert({
      couple_id: data.coupleId,
      list_id: data.listId,
      created_by: uid,
      parent_id: data.parentId || null,
      title: data.title,
      notes: data.notes || null,
      due_date: data.dueDate || null,
      assignee: data.assignee || null,
      recurrence: data.recurrence || "none",
      remind: data.remind || false,
      needs_both: data.needsBoth || false,
    })
    .select("id")
    .single();
  // Only nudge for top-level items (not subtasks).
  if (!data.parentId) {
    await notifyPartner(data.coupleId, uid, "us.", `your partner added "${data.title}" to a to-do list`, "/vault?tab=todos");
  }
  return row?.id as string | undefined;
}

export async function updateTodo(data: {
  id: string;
  coupleId: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  assignee?: string | null;
  recurrence?: string;
  remind?: boolean;
  needsBoth?: boolean;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("vault_todos")
    .update({
      title: data.title,
      notes: data.notes || null,
      due_date: data.dueDate || null,
      assignee: data.assignee || null,
      recurrence: data.recurrence || "none",
      remind: data.remind || false,
      needs_both: data.needsBoth || false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId);
}

// Toggle the caller's tick on a shared item. `done` is derived server-side
// (needs_both ? both partners : ≥1) and recurring spawn is handled atomically.
export async function toggleTodoTick(id: string, coupleId: string, title: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data } = await supabase.rpc("toggle_todo_tick", { p_id: id, p_couple_id: coupleId });
  const res = (data ?? {}) as { done?: boolean; became_done?: boolean; needs_more?: boolean };
  if (res.needs_more) {
    await notifyPartner(coupleId, uid, "us.", `"${title}" needs your tick too`, "/vault?tab=todos");
  } else if (res.became_done) {
    await notifyPartner(coupleId, uid, "us.", `your partner ticked "${title}"`, "/vault?tab=todos");
  }
  return res;
}

export async function deleteTodo(id: string, coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_todos").delete().eq("id", id).eq("couple_id", coupleId);
}

// Pin one list to the Home dashboard (or pass null to unpin).
export async function setPriorityTodoList(coupleId: string, listId: string | null) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // p_list_id is nullable in SQL (null = unpin) but typed non-null by codegen.
  await supabase.rpc("set_priority_todo_list", { p_couple_id: coupleId, p_list_id: listId as string });
}

// Persist a manual order — position = index for each id, in order.
export async function reorderTodos(coupleId: string, orderedIds: string[]) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from("vault_todos").update({ position: i }).eq("id", id).eq("couple_id", coupleId)
  ));
}

export async function clearCompleted(listId: string, coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_todos").delete().eq("list_id", listId).eq("couple_id", coupleId).eq("done", true);
}
