"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

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
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data: row } = await supabase
    .from("vault_todos")
    .insert({
      couple_id: data.coupleId,
      list_id: data.listId,
      created_by: uid,
      title: data.title,
      notes: data.notes || null,
      due_date: data.dueDate || null,
      assignee: data.assignee || null,
    })
    .select("id")
    .single();
  await notifyPartner(data.coupleId, uid, "us.", `your partner added "${data.title}" to a to-do list`, "/vault?tab=todos");
  return row?.id as string | undefined;
}

export async function updateTodo(data: {
  id: string;
  coupleId: string;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  assignee?: string | null;
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId);
}

// Shared list: either partner may tick any item. done_by records who did.
export async function setTodoDone(id: string, coupleId: string, done: boolean, title: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("vault_todos")
    .update({
      done,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? uid : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("couple_id", coupleId);
  if (done) {
    await notifyPartner(coupleId, uid, "us.", `your partner ticked "${title}"`, "/vault?tab=todos");
  }
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
  await supabase.rpc("set_priority_todo_list", { p_couple_id: coupleId, p_list_id: listId });
}

export async function clearCompleted(listId: string, coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_todos").delete().eq("list_id", listId).eq("couple_id", coupleId).eq("done", true);
}
