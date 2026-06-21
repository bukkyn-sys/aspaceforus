"use client";

import { useState, useEffect, useTransition, useRef, type PointerEvent as RPointerEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useFabSetter } from "@/contexts/fab-context";
import { useEntitlement } from "@/contexts/entitlement-context";
import { getCache, setCache } from "@/lib/data-cache";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { Field, FieldLabel, ChipRow } from "@/components/ui/form";
import { PersonPicker } from "@/components/ui/person-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { SignedImg } from "@/components/signed-img";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Plus, Check, ChevronLeft, ChevronRight, X, Trash2, ChevronDown, Pin, Repeat, GripVertical, Lock } from "lucide-react";
import {
  createTodoList, renameTodoList, deleteTodoList,
  addTodo, updateTodo, toggleTodoTick, deleteTodo, clearCompleted, setPriorityTodoList, reorderTodos,
} from "./todo-actions";

interface TodoList { id: string; title: string; emoji: string; created_by: string; created_at: string; total: number; done: number; }
interface Todo {
  id: string; list_id: string; title: string; notes: string | null;
  done: boolean; done_at: string | null; done_by: string | null;
  due_date: string | null; assignee: string | null; created_by: string; created_at: string;
  parent_id: string | null; recurrence: string; remind: boolean; position: number;
  needs_both: boolean; ticked_by: string[];
}

const RECUR_LABEL: Record<string, string> = { none: "no repeat", daily: "daily", weekly: "weekly", monthly: "monthly" };
const RECUR_OPTS = ["none", "daily", "weekly", "monthly"];

const LIST_EMOJIS = ["🛒", "🧳", "🎁", "🏡", "🍽️", "💸", "💡", "✅"];

function localToday(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Calm due styling — "overdue" is muted terracotta, never alarming. No streaks.
function dueMeta(due: string | null): { label: string; tone: "muted" | "today" | "over" } | null {
  if (!due) return null;
  const today = localToday(0);
  const tomorrow = localToday(1);
  if (due < today) return { label: "overdue", tone: "over" };
  if (due === today) return { label: "today", tone: "today" };
  if (due === tomorrow) return { label: "tomorrow", tone: "muted" };
  return { label: new Date(due + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tone: "muted" };
}

export default function VaultTodos({ live = true }: { live?: boolean }) {
  const { coupleId, me, partner, myName, partnerName } = useCouple();
  const setAction = useFabSetter();
  const { premium, openPaywall } = useEntitlement();
  const [, startTransition] = useTransition();

  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const [view, setView] = useState<"lists" | "items">("lists");
  const [activeList, setActiveList] = useState<TodoList | null>(null);
  const [lists, setLists] = useState<TodoList[]>(() => getCache<TodoList[]>(`vtodo:${coupleId}`) ?? []);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [listsLoading, setListsLoading] = useState(() => getCache<TodoList[]>(`vtodo:${coupleId}`) === undefined);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [rtick, setRtick] = useState(0);
  // Completed items stay visible by default — seeing progress is motivating.
  const [showDone, setShowDone] = useState(true);
  const [priorityListId, setPriorityListId] = useState<string | null>(null);
  // Drag-reorder (undone items)
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Sheets
  const [showNewList, setShowNewList] = useState(false);
  const [editingList, setEditingList] = useState<TodoList | null>(null);
  const [showItem, setShowItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Todo | null>(null);
  const [confirmDeleteList, setConfirmDeleteList] = useState<TodoList | null>(null);

  // List form
  const [listTitle, setListTitle] = useState("");
  const [listEmoji, setListEmoji] = useState("✅");

  // Item form
  const [itemTitle, setItemTitle] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemDue, setItemDue] = useState("");
  const [itemAssignee, setItemAssignee] = useState<string | null>(null);
  const [itemRecurrence, setItemRecurrence] = useState("none");
  const [itemRemind, setItemRemind] = useState(false);
  const [itemNeedsBoth, setItemNeedsBoth] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  // ── Loads ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "lists") return;
    if (!live) return; // far panes keep cached lists; fetch in the live window
    const supabase = createClient();
    Promise.all([
      supabase.from("vault_todo_lists").select("id,title,emoji,created_by,created_at").eq("couple_id", coupleId).order("created_at", { ascending: true }),
      supabase.from("vault_todos").select("list_id,done").eq("couple_id", coupleId),
      supabase.from("couples").select("priority_todo_list_id").eq("id", coupleId).single(),
    ]).then(([{ data: ls }, { data: ts }, { data: cp }]) => {
      const counts: Record<string, { total: number; done: number }> = {};
      ((ts as { list_id: string; done: boolean }[]) ?? []).forEach((t) => {
        const c = (counts[t.list_id] ??= { total: 0, done: 0 });
        c.total++; if (t.done) c.done++;
      });
      const next: TodoList[] = ((ls as Omit<TodoList, "total" | "done">[]) ?? []).map((l) => ({
        ...l, total: counts[l.id]?.total ?? 0, done: counts[l.id]?.done ?? 0,
      }));
      setLists(next); setListsLoading(false); setCache(`vtodo:${coupleId}`, next);
      setPriorityListId((cp as { priority_todo_list_id: string | null } | null)?.priority_todo_list_id ?? null);
    });
  }, [coupleId, view, rtick, live]);

  useEffect(() => {
    if (view !== "items" || !activeList) return;
    const cached = getCache<Todo[]>(`vtodoItems:${activeList.id}`);
    if (cached) { setTodos(cached); setItemsLoading(false); } else { setItemsLoading(true); }
    if (!live) return; // far panes show cache; fetch in the live window
    const supabase = createClient();
    supabase.from("vault_todos").select("*").eq("list_id", activeList.id).order("created_at", { ascending: true })
      .then(({ data }) => {
        const next = (data as Todo[]) ?? [];
        setTodos(next); setItemsLoading(false); setCache(`vtodoItems:${activeList.id}`, next);
      });
  }, [activeList, view, rtick, live]);

  // Realtime — partner changes (live window only; skip our own inserts).
  useEffect(() => {
    if (!live) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChange = (p: any) => {
      if (p.eventType === "INSERT" && p.new?.created_by === me.id) return;
      setRtick((t) => t + 1);
    };
    const ch = supabase.channel(`vtodo-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_todos", filter: `couple_id=eq.${coupleId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_todo_lists", filter: `couple_id=eq.${coupleId}` }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [coupleId, me.id, live]);

  // FAB — new list at lists level, add item inside a list. Re-registers when the
  // list count / premium changes so the gate reads live values.
  useEffect(() => {
    setAction(view === "lists" ? () => openNewList() : () => openAddItem());
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeList, premium, lists.length]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function openNewList() {
    // Free plan: 1 list.
    if (!premium && lists.length >= 1) { openPaywall("lists"); return; }
    setEditingList(null); setListTitle(""); setListEmoji("✅"); setShowNewList(true);
  }
  function openEditList(l: TodoList) { setEditingList(l); setListTitle(l.title); setListEmoji(l.emoji); setShowNewList(true); }

  function handleSaveList() {
    const title = listTitle.trim();
    if (!title) return;
    if (editingList) {
      const id = editingList.id;
      setLists((prev) => prev.map((l) => l.id === id ? { ...l, title, emoji: listEmoji } : l));
      startTransition(() => { renameTodoList(id, coupleId, title, listEmoji); });
    } else {
      const tempId = crypto.randomUUID();
      const optimistic: TodoList = { id: tempId, title, emoji: listEmoji, created_by: me.id, created_at: new Date().toISOString(), total: 0, done: 0 };
      setLists((prev) => [...prev, optimistic]);
      track("todo_list_created");
      // Insert with the temp id as the real id so the list exists in the DB
      // immediately (items added right after reference a real list row).
      createTodoList(coupleId, title, listEmoji, tempId);
    }
    setShowNewList(false); setEditingList(null);
  }

  function handleDeleteList(l: TodoList) {
    setLists((prev) => prev.filter((x) => x.id !== l.id));
    setConfirmDeleteList(null);
    startTransition(() => { deleteTodoList(l.id, coupleId); });
  }

  function togglePriority(l: TodoList) {
    const next = priorityListId === l.id ? null : l.id;
    setPriorityListId(next);
    startTransition(() => { setPriorityTodoList(coupleId, next); });
  }

  // Completed items stay visible by default — seeing what's done is reassuring,
  // and it lets ticks made from the Home pinned card show up here too.
  function openList(l: TodoList) { setActiveList(l); setView("items"); setShowDone(true); }
  function backToLists() { setView("lists"); setActiveList(null); }

  function openAddItem() { setEditingItem(null); setItemTitle(""); setItemNotes(""); setItemDue(""); setItemAssignee(null); setItemRecurrence("none"); setItemRemind(false); setItemNeedsBoth(false); setSubtaskDraft(""); setShowItem(true); }
  function openEditItem(t: Todo) {
    setEditingItem(t);
    setItemTitle(t.title); setItemNotes(t.notes ?? ""); setItemDue(t.due_date ?? ""); setItemAssignee(t.assignee);
    setItemRecurrence(t.recurrence ?? "none"); setItemRemind(t.remind ?? false); setItemNeedsBoth(t.needs_both ?? false); setSubtaskDraft("");
    setShowItem(true);
  }

  function handleSaveItem() {
    const title = itemTitle.trim();
    if (!title || !activeList) return;
    const due = itemDue || null;
    const notes = itemNotes.trim() || null;
    if (editingItem) {
      const id = editingItem.id;
      setTodos((prev) => prev.map((t) => t.id === id ? { ...t, title, notes, due_date: due, assignee: itemAssignee, recurrence: itemRecurrence, remind: itemRemind, needs_both: itemNeedsBoth } : t));
      startTransition(() => { updateTodo({ id, coupleId, title, notes, dueDate: due, assignee: itemAssignee, recurrence: itemRecurrence, remind: itemRemind, needsBoth: itemNeedsBoth }); });
    } else {
      const tempId = crypto.randomUUID();
      const maxPos = todos.reduce((m, t) => Math.max(m, t.position ?? 0), 0);
      const optimistic: Todo = {
        id: tempId, list_id: activeList.id, title, notes, done: false, done_at: null, done_by: null,
        due_date: due, assignee: itemAssignee, created_by: me.id, created_at: new Date().toISOString(),
        parent_id: null, recurrence: itemRecurrence, remind: itemRemind, position: maxPos + 1,
        needs_both: itemNeedsBoth, ticked_by: [],
      };
      setTodos((prev) => [...prev, optimistic]);
      track("todo_added");
      addTodo({ id: tempId, coupleId, listId: activeList.id, title, notes: notes ?? undefined, dueDate: due ?? undefined, assignee: itemAssignee ?? undefined, recurrence: itemRecurrence, remind: itemRemind, needsBoth: itemNeedsBoth });
    }
    setShowItem(false); setEditingItem(null);
  }

  function toggle(t: Todo) {
    const ticked = t.ticked_by ?? [];
    const iTicked = ticked.includes(me.id);
    const nextTicked = iTicked ? ticked.filter((x) => x !== me.id) : [...ticked, me.id];
    const members = partner ? [me.id, partner.id] : [me.id];
    const done = t.needs_both ? members.every((m) => nextTicked.includes(m)) : nextTicked.length >= 1;
    setTodos((prev) => prev.map((x) => x.id === t.id
      ? { ...x, ticked_by: nextTicked, done, done_at: done ? new Date().toISOString() : null, done_by: done ? me.id : null }
      : x));
    if (done && !t.done) track("todo_completed");
    startTransition(() => { toggleTodoTick(t.id, coupleId, t.title); });
  }

  function handleDeleteItem(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    setShowItem(false); setEditingItem(null);
    startTransition(() => { deleteTodo(t.id, coupleId); });
  }

  function handleClearCompleted() {
    if (!activeList) return;
    setTodos((prev) => prev.filter((t) => !t.done));
    startTransition(() => { clearCompleted(activeList.id, coupleId); });
  }

  function addSubtask() {
    const t = subtaskDraft.trim();
    if (!t || !editingItem || !activeList) return;
    const tempId = crypto.randomUUID();
    const optimistic: Todo = {
      id: tempId, list_id: activeList.id, title: t, notes: null, done: false, done_at: null, done_by: null,
      due_date: null, assignee: null, created_by: me.id, created_at: new Date().toISOString(),
      parent_id: editingItem.id, recurrence: "none", remind: false, position: 0,
      needs_both: false, ticked_by: [],
    };
    setTodos((prev) => [...prev, optimistic]);
    addTodo({ id: tempId, coupleId, listId: activeList.id, title: t, parentId: editingItem.id });
    setSubtaskDraft("");
  }

  function deleteSub(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    startTransition(() => { deleteTodo(t.id, coupleId); });
  }

  // assignee → people to render
  function assigneePeople(assignee: string | null) {
    if (assignee === me.id) return [{ url: me.avatar_url, name: myName, hex: myAccent.hex }];
    if (partner && assignee === partner.id) return [{ url: partner.avatar_url, name: partnerName, hex: partnerAccent.hex }];
    if (assignee === "both") return [
      { url: me.avatar_url, name: myName, hex: myAccent.hex },
      { url: partner?.avatar_url ?? null, name: partnerName, hex: partnerAccent.hex },
    ];
    return [];
  }

  const topLevel = todos.filter((t) => !t.parent_id);
  const undoneSorted = topLevel.filter((t) => !t.done)
    .sort((a, b) => (a.position - b.position) || a.created_at.localeCompare(b.created_at));
  // During a drag, render the live `order`; otherwise the sorted list.
  const undone = order
    ? (order.map((id) => undoneSorted.find((t) => t.id === id)).filter(Boolean) as Todo[])
    : undoneSorted;
  const doneItems = topLevel.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const subsOf = (id: string) => todos.filter((s) => s.parent_id === id);

  function onDragStart(e: RPointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
    setOrder(undoneSorted.map((t) => t.id));
  }
  function onDragMove(e: RPointerEvent<HTMLButtonElement>) {
    if (!dragId || !order) return;
    const y = e.clientY;
    let target = order.length - 1;
    for (let i = 0; i < order.length; i++) {
      const el = rowRefs.current.get(order[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = i; break; }
    }
    const cur = order.indexOf(dragId);
    if (cur < 0 || cur === target) return;
    const next = [...order];
    next.splice(cur, 1);
    next.splice(target, 0, dragId);
    setOrder(next);
  }
  function onDragEnd() {
    if (dragId && order) {
      const ids = order;
      setTodos((prev) => prev.map((t) => { const i = ids.indexOf(t.id); return i >= 0 ? { ...t, position: i } : t; }));
      startTransition(() => { reorderTodos(coupleId, ids); });
    }
    setDragId(null); setOrder(null);
  }

  // ── LISTS VIEW ───────────────────────────────────────────────────────────────
  if (view === "lists") {
    // Behind glass: free keeps the single newest list open; older ones lock
    // (view-only, tap → paywall) but can still be deleted to get back under cap.
    const keptListId = !premium && lists.length > 1
      ? [...lists].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].id
      : null;
    return (
      <div className="px-4 pb-24 pt-3">
        {listsLoading ? <SkeletonRows count={3} /> : lists.length === 0 ? (
          <button onClick={openNewList} className="w-full rounded-3xl border border-dashed border-border/60 p-8 text-center hover:border-border bg-secondary/40 transition-colors">
            <p className="text-sm text-muted-foreground">no to-do lists yet</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">tap to make one — groceries, trip prep, anything</p>
          </button>
        ) : (
          <div className="space-y-2.5">
            {lists.map((l) => {
              const pct = l.total > 0 ? Math.round((l.done / l.total) * 100) : 0;
              const locked = keptListId !== null && l.id !== keptListId;
              return (
                <button
                  key={l.id}
                  onClick={() => locked ? openPaywall("lists") : openList(l)}
                  onContextMenu={(e) => { e.preventDefault(); if (!locked) openEditList(l); }}
                  className="w-full card-row overflow-hidden flex items-center text-left px-4 py-3.5 active:scale-[0.99] transition-transform"
                >
                  <span className={cn("text-2xl flex-shrink-0 mr-3 leading-none", locked && "opacity-40")}>{l.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-semibold truncate", locked ? "text-muted-foreground" : "text-foreground")}>{l.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {locked ? "locked · re-unlock premium" : l.total === 0 ? "nothing yet" : `${l.done}/${l.total} done`}
                    </p>
                    {!locked && l.total > 0 && (
                      <div className="h-1 bg-foreground/10 rounded-full overflow-hidden mt-1.5 max-w-[140px]">
                        <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center pl-2 gap-1 flex-shrink-0">
                    {!locked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePriority(l); }}
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                          priorityListId === l.id ? "text-foreground" : "text-muted-foreground/35 hover:text-muted-foreground hover:bg-secondary"
                        )}
                        aria-label={priorityListId === l.id ? "unpin from home" : "pin to home"}
                      >
                        <Pin className={cn("w-3.5 h-3.5", priorityListId === l.id && "fill-current")} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteList(l); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors"
                      aria-label="delete list"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {locked ? <Lock className="w-3.5 h-3.5 text-muted-foreground/40" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/30" />}
                  </div>
                </button>
              );
            })}
            <button onClick={openNewList} className="w-full rounded-2xl border border-dashed border-border/50 h-[60px] flex items-center justify-center gap-2 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/80 transition-colors">
              <Plus className="w-4 h-4" strokeWidth={2} /><span className="text-sm font-medium">new list</span>
            </button>
          </div>
        )}

        {/* New / edit list sheet */}
        <BottomSheet
          open={showNewList}
          onClose={() => { setShowNewList(false); setEditingList(null); }}
          title={editingList ? "edit list" : "new list"}
          footer={<Button onClick={handleSaveList} disabled={!listTitle.trim()} className="w-full h-11 rounded-xl">{editingList ? "save" : "create list"}</Button>}
        >
          <Field label="emoji">
            <ChipRow>
              {LIST_EMOJIS.map((e) => (
                <button key={e} onClick={() => setListEmoji(e)} className={cn("w-11 h-11 rounded-xl text-xl flex items-center justify-center transition-all", listEmoji === e ? "bg-foreground/10 ring-2 ring-foreground/40" : "bg-secondary hover:bg-secondary/70")}>{e}</button>
              ))}
            </ChipRow>
          </Field>
          <Input value={listTitle} onChange={(e) => setListTitle(e.target.value)} placeholder="list name" className="h-11 rounded-xl bg-card border-border/60" />
        </BottomSheet>

        {/* Delete list confirm */}
        <Dialog open={confirmDeleteList !== null} onClose={() => setConfirmDeleteList(null)}>
          {confirmDeleteList && (
            <>
              <p className="font-semibold text-foreground text-center truncate">{confirmDeleteList.emoji} {confirmDeleteList.title}</p>
              <p className="text-sm text-muted-foreground text-center mt-1 mb-5">delete this list and everything in it?</p>
              <div className="space-y-2">
                <Button variant="outline" onClick={() => handleDeleteList(confirmDeleteList)} className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light">
                  <Trash2 className="w-4 h-4 mr-1.5" /> delete list
                </Button>
                <button onClick={() => setConfirmDeleteList(null)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
              </div>
            </>
          )}
        </Dialog>
      </div>
    );
  }

  // ── ITEMS VIEW ───────────────────────────────────────────────────────────────
  return (
    <div className="px-4 pb-24 pt-3">
      {/* Header */}
      <div className="hdr-float flex items-center gap-2 mb-3">
        <button onClick={backToLists} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1 flex-shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold text-foreground flex-1 truncate">
          <span className="mr-1.5">{activeList?.emoji}</span>{activeList?.title}
        </h1>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{doneItems.length}/{topLevel.length}</span>
      </div>

      {itemsLoading ? <SkeletonRows count={4} /> : topLevel.length === 0 ? (
        <button onClick={openAddItem} className="w-full rounded-3xl border border-dashed border-border/60 p-8 text-center hover:border-border bg-secondary/40 transition-colors mt-2">
          <p className="text-sm text-muted-foreground">nothing on this list yet</p>
          <p className="text-xs text-muted-foreground/40 mt-0.5">tap + to add the first thing</p>
        </button>
      ) : (
        <div className="space-y-0.5">
          {undone.map((t) => {
            const subs = subsOf(t.id);
            return <TodoRow key={t.id} t={t} meId={me.id} onToggle={toggle} onTap={openEditItem} people={assigneePeople(t.assignee)}
              recurring={t.recurrence !== "none"} subProgress={subs.length ? { done: subs.filter((s) => s.done).length, total: subs.length } : undefined}
              dragging={dragId === t.id}
              onHandleDown={(e) => onDragStart(e, t.id)}
              onHandleMove={onDragMove}
              onHandleUp={onDragEnd}
              rowRef={(el) => { if (el) rowRefs.current.set(t.id, el); else rowRefs.current.delete(t.id); }}
            />;
          })}

          {doneItems.length > 0 && (
            <div className="pt-2">
              <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 py-2">
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !showDone && "-rotate-90")} />
                done ({doneItems.length})
              </button>
              {showDone && (
                <div className="space-y-0.5">
                  {doneItems.map((t) => (
                    <TodoRow key={t.id} t={t} meId={me.id} onToggle={toggle} onTap={openEditItem} people={assigneePeople(t.assignee)}
                      doneByName={t.done_by === me.id ? myName : t.done_by ? partnerName : null} />
                  ))}
                  <button onClick={handleClearCompleted} className="text-xs text-muted-foreground/50 hover:text-muted-foreground py-2 pl-1">clear completed</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add / edit item sheet */}
      <BottomSheet
        open={showItem}
        onClose={() => { setShowItem(false); setEditingItem(null); }}
        title={editingItem ? "edit" : "add to-do"}
        footer={
          <div className="flex gap-2">
            {editingItem && (
              <Button variant="outline" onClick={() => handleDeleteItem(editingItem)} className="h-11 px-4 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button onClick={handleSaveItem} disabled={!itemTitle.trim()} className="flex-1 h-11 rounded-xl">{editingItem ? "save" : "add"}</Button>
          </div>
        }
      >
        <Input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="what needs doing?" className="h-11 rounded-xl bg-card border-border/60" />
        <textarea value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} placeholder="notes (optional)" rows={2}
          className="w-full text-sm text-foreground placeholder:text-muted-foreground/40 bg-card border border-border/60 rounded-xl px-3.5 py-2.5 resize-none outline-none leading-relaxed" />
        <div>
          <FieldLabel>due date <span className="font-normal opacity-50">(optional)</span></FieldLabel>
          <DateField value={itemDue} onChange={setItemDue} placeholder="no due date" />
          {itemDue && (
            <button onClick={() => { setItemDue(""); setItemRemind(false); }} className="flex items-center justify-center gap-1 w-full text-xs font-medium text-muted-foreground/70 hover:text-foreground mt-1.5 transition-colors">
              <X className="w-3 h-3" /> remove due date
            </button>
          )}
          {itemDue && (
            <button type="button" onClick={() => setItemRemind((v) => !v)}
              className={cn("flex items-center justify-between w-full rounded-xl px-3.5 h-10 mt-2 transition-colors", itemRemind ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
              <span className="text-xs font-medium">remind us when it&apos;s due</span>
              <span className={cn("relative w-8 h-[18px] rounded-full transition-colors", itemRemind ? "bg-background/30" : "bg-foreground/15")}>
                <span className={cn("absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all", itemRemind ? "left-[18px] bg-background" : "left-0.5 bg-foreground/50")} />
              </span>
            </button>
          )}
        </div>
        <div>
          <FieldLabel>for</FieldLabel>
          <PersonPicker
            value={itemAssignee}
            onChange={setItemAssignee}
            choices={[
              { value: null, label: "anyone" },
              { value: me.id, label: myName, personId: me.id },
              ...(partner ? [{ value: partner.id, label: partnerName, personId: partner.id }, { value: "both", label: "both" }] : []),
            ]}
          />
        </div>
        <div>
          <FieldLabel>repeats</FieldLabel>
          <div className="flex gap-1.5">
            {RECUR_OPTS.map((r) => (
              <button key={r} onClick={() => setItemRecurrence(r)}
                className={cn("flex-1 h-9 rounded-xl text-xs font-medium transition-colors", itemRecurrence === r ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
                {r === "none" ? "never" : RECUR_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        {partner && (
          <button type="button" onClick={() => setItemNeedsBoth((v) => !v)}
            className={cn("flex items-center justify-between w-full rounded-xl px-3.5 h-11 transition-colors", itemNeedsBoth ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
            <span className="text-xs font-medium">both of us must tick it off</span>
            <span className={cn("relative w-8 h-[18px] rounded-full transition-colors", itemNeedsBoth ? "bg-background/30" : "bg-foreground/15")}>
              <span className={cn("absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all", itemNeedsBoth ? "left-[18px] bg-background" : "left-0.5 bg-foreground/50")} />
            </span>
          </button>
        )}
        {editingItem && (
          <div>
            <FieldLabel>subtasks</FieldLabel>
            {subsOf(editingItem.id).length > 0 && (
              <div className="space-y-1.5 mb-2">
                {subsOf(editingItem.id).map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5">
                    <button onClick={() => toggle(s)} className={cn("w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0", s.done ? "bg-sage" : "border-[1.5px] border-muted-foreground/30")}>
                      {s.done && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </button>
                    <span className={cn("text-sm flex-1 truncate", s.done ? "line-through text-muted-foreground/50" : "text-foreground")}>{s.title}</span>
                    <button onClick={() => deleteSub(s)} className="text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={subtaskDraft} onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                placeholder="add a subtask" className="h-9 rounded-xl bg-card border-border/60 text-sm flex-1" />
              <Button onClick={addSubtask} disabled={!subtaskDraft.trim()} className="h-9 px-3 rounded-xl"><Plus className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function TodoRow({ t, meId, onToggle, onTap, people, doneByName, recurring, subProgress, dragging, onHandleDown, onHandleMove, onHandleUp, rowRef }: {
  t: Todo;
  meId: string;
  onToggle: (t: Todo) => void;
  onTap: (t: Todo) => void;
  people: { url: string | null; name: string; hex: string }[];
  doneByName?: string | null;
  recurring?: boolean;
  subProgress?: { done: number; total: number };
  dragging?: boolean;
  onHandleDown?: (e: RPointerEvent<HTMLButtonElement>) => void;
  onHandleMove?: (e: RPointerEvent<HTMLButtonElement>) => void;
  onHandleUp?: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const due = dueMeta(t.due_date);
  const iTicked = (t.ticked_by ?? []).includes(meId);
  return (
    <div ref={rowRef} className={cn("flex items-start gap-3 py-2.5 px-1 rounded-xl transition-shadow", dragging && "bg-card shadow-md relative z-10")}>
      <button
        onClick={() => onToggle(t)}
        aria-pressed={t.done}
        aria-label={t.done ? "mark not done" : "mark done"}
        className={cn(
          "w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
          t.done ? "bg-sage" : iTicked ? "border-[1.5px] border-sage" : "border-[1.5px] border-muted-foreground/30 hover:border-muted-foreground/60"
        )}
      >
        {t.done ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /> : iTicked ? <Check className="w-3 h-3 text-sage" strokeWidth={3} /> : null}
      </button>
      <button onClick={() => onTap(t)} className="flex-1 min-w-0 text-left">
        <p className={cn("text-sm leading-snug", t.done ? "line-through text-muted-foreground/50" : "text-foreground")}>{t.title}</p>
        {t.notes && !t.done && <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{t.notes}</p>}
        {(due || people.length > 0 || doneByName || recurring || subProgress || t.needs_both) && (
          <div className="flex items-center gap-2 mt-1">
            {due && !t.done && (
              <span className={cn("text-[11px] font-medium", due.tone === "over" ? "text-terracotta/80" : due.tone === "today" ? "text-sage" : "text-muted-foreground/50")}>
                {due.label}
              </span>
            )}
            {!t.done && t.needs_both && <span className="text-[11px] text-muted-foreground/50 tabular-nums">{(t.ticked_by ?? []).length}/2 ticked</span>}
            {!t.done && recurring && <Repeat className="w-3 h-3 text-muted-foreground/45" />}
            {!t.done && subProgress && <span className="text-[11px] text-muted-foreground/50 tabular-nums">{subProgress.done}/{subProgress.total}</span>}
            {!t.done && people.map((p, i) => (
              <span key={i} className="w-4 h-4 rounded-full overflow-hidden bg-secondary inline-flex items-center justify-center flex-shrink-0" style={{ boxShadow: `0 0 0 1.5px ${p.hex}` }}>
                {p.url ? <SignedImg src={p.url} className="w-full h-full object-cover" /> : <span className="text-[8px] font-semibold text-muted-foreground">{p.name[0]?.toUpperCase()}</span>}
              </span>
            ))}
            {doneByName && <span className="text-[10px] text-muted-foreground/40">done by {doneByName}</span>}
          </div>
        )}
      </button>
      {onHandleDown && (
        <button
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          style={{ touchAction: "none" }}
          aria-label="drag to reorder"
          className="flex-shrink-0 mt-0.5 -mr-1 p-1 text-muted-foreground/30 hover:text-muted-foreground/60 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
