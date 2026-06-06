"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useFabSetter } from "@/contexts/fab-context";
import { getCache, setCache } from "@/lib/data-cache";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { SignedImg } from "@/components/signed-img";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Plus, Check, ChevronLeft, ChevronRight, X, Trash2, ChevronDown } from "lucide-react";
import {
  createTodoList, renameTodoList, deleteTodoList,
  addTodo, updateTodo, setTodoDone, deleteTodo, clearCompleted,
} from "./todo-actions";

interface TodoList { id: string; title: string; emoji: string; created_by: string; created_at: string; total: number; done: number; }
interface Todo {
  id: string; list_id: string; title: string; notes: string | null;
  done: boolean; done_at: string | null; done_by: string | null;
  due_date: string | null; assignee: string | null; created_by: string; created_at: string;
}

const LIST_EMOJIS = ["✅", "🛒", "🧳", "🏡", "🎁", "🗓️", "💡", "🧹", "🍽️", "💸", "📋", "⭐"];

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

export default function VaultTodos() {
  const { coupleId, me, partner, myName, partnerName } = useCouple();
  const setAction = useFabSetter();
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
  const [showDone, setShowDone] = useState(false);

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

  // ── Loads ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== "lists") return;
    const supabase = createClient();
    Promise.all([
      supabase.from("vault_todo_lists").select("id,title,emoji,created_by,created_at").eq("couple_id", coupleId).order("created_at", { ascending: true }),
      supabase.from("vault_todos").select("list_id,done").eq("couple_id", coupleId),
    ]).then(([{ data: ls }, { data: ts }]) => {
      const counts: Record<string, { total: number; done: number }> = {};
      ((ts as { list_id: string; done: boolean }[]) ?? []).forEach((t) => {
        const c = (counts[t.list_id] ??= { total: 0, done: 0 });
        c.total++; if (t.done) c.done++;
      });
      const next: TodoList[] = ((ls as Omit<TodoList, "total" | "done">[]) ?? []).map((l) => ({
        ...l, total: counts[l.id]?.total ?? 0, done: counts[l.id]?.done ?? 0,
      }));
      setLists(next); setListsLoading(false); setCache(`vtodo:${coupleId}`, next);
    });
  }, [coupleId, view, rtick]);

  useEffect(() => {
    if (view !== "items" || !activeList) return;
    const cached = getCache<Todo[]>(`vtodoItems:${activeList.id}`);
    if (cached) { setTodos(cached); setItemsLoading(false); } else { setItemsLoading(true); }
    const supabase = createClient();
    supabase.from("vault_todos").select("*").eq("list_id", activeList.id).order("created_at", { ascending: true })
      .then(({ data }) => {
        const next = (data as Todo[]) ?? [];
        setTodos(next); setItemsLoading(false); setCache(`vtodoItems:${activeList.id}`, next);
      });
  }, [activeList, view, rtick]);

  // Realtime — partner changes (skip our own inserts; optimistic already shows them).
  useEffect(() => {
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
  }, [coupleId, me.id]);

  // FAB — new list at lists level, add item inside a list.
  useEffect(() => {
    setAction(view === "lists" ? () => openNewList() : () => openAddItem());
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeList]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function openNewList() { setEditingList(null); setListTitle(""); setListEmoji("✅"); setShowNewList(true); }
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
      // Reconcile the temp id with the real one (own inserts are skipped by realtime).
      createTodoList(coupleId, title, listEmoji).then((realId) => {
        if (realId) setLists((prev) => prev.map((l) => l.id === tempId ? { ...l, id: realId } : l));
      });
    }
    setShowNewList(false); setEditingList(null);
  }

  function handleDeleteList(l: TodoList) {
    setLists((prev) => prev.filter((x) => x.id !== l.id));
    setConfirmDeleteList(null);
    startTransition(() => { deleteTodoList(l.id, coupleId); });
  }

  function openList(l: TodoList) { setActiveList(l); setView("items"); setShowDone(false); }
  function backToLists() { setView("lists"); setActiveList(null); }

  function openAddItem() { setEditingItem(null); setItemTitle(""); setItemNotes(""); setItemDue(""); setItemAssignee(null); setShowItem(true); }
  function openEditItem(t: Todo) {
    setEditingItem(t);
    setItemTitle(t.title); setItemNotes(t.notes ?? ""); setItemDue(t.due_date ?? ""); setItemAssignee(t.assignee);
    setShowItem(true);
  }

  function handleSaveItem() {
    const title = itemTitle.trim();
    if (!title || !activeList) return;
    const due = itemDue || null;
    const notes = itemNotes.trim() || null;
    if (editingItem) {
      const id = editingItem.id;
      setTodos((prev) => prev.map((t) => t.id === id ? { ...t, title, notes, due_date: due, assignee: itemAssignee } : t));
      startTransition(() => { updateTodo({ id, coupleId, title, notes, dueDate: due, assignee: itemAssignee }); });
    } else {
      const tempId = crypto.randomUUID();
      const optimistic: Todo = {
        id: tempId, list_id: activeList.id, title, notes, done: false, done_at: null, done_by: null,
        due_date: due, assignee: itemAssignee, created_by: me.id, created_at: new Date().toISOString(),
      };
      setTodos((prev) => [...prev, optimistic]);
      track("todo_added");
      addTodo({ coupleId, listId: activeList.id, title, notes: notes ?? undefined, dueDate: due ?? undefined, assignee: itemAssignee ?? undefined })
        .then((realId) => { if (realId) setTodos((prev) => prev.map((t) => t.id === tempId ? { ...t, id: realId } : t)); });
    }
    setShowItem(false); setEditingItem(null);
  }

  function toggle(t: Todo) {
    const done = !t.done;
    setTodos((prev) => prev.map((x) => x.id === t.id ? { ...x, done, done_at: done ? new Date().toISOString() : null, done_by: done ? me.id : null } : x));
    if (done) track("todo_completed");
    startTransition(() => { setTodoDone(t.id, coupleId, done, t.title); });
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

  const undone = todos.filter((t) => !t.done);
  const doneItems = todos.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  // ── LISTS VIEW ───────────────────────────────────────────────────────────────
  if (view === "lists") {
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
              return (
                <button
                  key={l.id}
                  onClick={() => openList(l)}
                  onContextMenu={(e) => { e.preventDefault(); openEditList(l); }}
                  className="w-full card-row overflow-hidden flex items-center text-left px-4 py-3.5 active:scale-[0.99] transition-transform"
                >
                  <span className="text-2xl flex-shrink-0 mr-3 leading-none">{l.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{l.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.total === 0 ? "nothing yet" : `${l.done}/${l.total} done`}
                    </p>
                    {l.total > 0 && (
                      <div className="h-1 bg-foreground/10 rounded-full overflow-hidden mt-1.5 max-w-[140px]">
                        <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center pl-2 gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteList(l); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors"
                      aria-label="delete list"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
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
          <div>
            <p className="text-xs text-muted-foreground mb-2">emoji</p>
            <div className="flex gap-2 overflow-x-auto py-1 px-1 -mx-1" style={{ scrollbarWidth: "none" }}>
              {LIST_EMOJIS.map((e) => (
                <button key={e} onClick={() => setListEmoji(e)} className={cn("w-11 h-11 rounded-xl text-xl flex items-center justify-center flex-shrink-0 transition-all", listEmoji === e ? "bg-foreground/10 ring-2 ring-foreground/40" : "bg-secondary hover:bg-secondary/70")}>{e}</button>
              ))}
            </div>
          </div>
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
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{doneItems.length}/{todos.length}</span>
      </div>

      {itemsLoading ? <SkeletonRows count={4} /> : todos.length === 0 ? (
        <button onClick={openAddItem} className="w-full rounded-3xl border border-dashed border-border/60 p-8 text-center hover:border-border bg-secondary/40 transition-colors mt-2">
          <p className="text-sm text-muted-foreground">nothing on this list yet</p>
          <p className="text-xs text-muted-foreground/40 mt-0.5">tap + to add the first thing</p>
        </button>
      ) : (
        <div className="space-y-0.5">
          {undone.map((t) => <TodoRow key={t.id} t={t} onToggle={toggle} onTap={openEditItem} people={assigneePeople(t.assignee)} />)}

          {doneItems.length > 0 && (
            <div className="pt-2">
              <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 py-2">
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !showDone && "-rotate-90")} />
                done ({doneItems.length})
              </button>
              {showDone && (
                <div className="space-y-0.5">
                  {doneItems.map((t) => (
                    <TodoRow key={t.id} t={t} onToggle={toggle} onTap={openEditItem} people={assigneePeople(t.assignee)}
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
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">due date <span className="font-normal opacity-50">(optional)</span></p>
          <DateField value={itemDue} onChange={setItemDue} placeholder="no due date" />
          {itemDue && <button onClick={() => setItemDue("")} className="text-xs text-muted-foreground/50 mt-1.5">clear date</button>}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground tracking-wide mb-2">for</p>
          <div className="flex gap-1.5">
            {[{ v: null, label: "anyone" }, { v: me.id, label: myName }, ...(partner ? [{ v: partner.id, label: partnerName }, { v: "both", label: "both" }] : [])].map((o) => (
              <button key={String(o.v)} onClick={() => setItemAssignee(o.v)}
                className={cn("flex-1 h-9 rounded-xl text-xs font-medium transition-colors capitalize", itemAssignee === o.v ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function TodoRow({ t, onToggle, onTap, people, doneByName }: {
  t: Todo;
  onToggle: (t: Todo) => void;
  onTap: (t: Todo) => void;
  people: { url: string | null; name: string; hex: string }[];
  doneByName?: string | null;
}) {
  const due = dueMeta(t.due_date);
  return (
    <div className="flex items-start gap-3 py-2.5">
      <button
        onClick={() => onToggle(t)}
        aria-pressed={t.done}
        aria-label={t.done ? "mark not done" : "mark done"}
        className={cn(
          "w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
          t.done ? "bg-sage" : "border-[1.5px] border-muted-foreground/30 hover:border-muted-foreground/60"
        )}
      >
        {t.done && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
      </button>
      <button onClick={() => onTap(t)} className="flex-1 min-w-0 text-left">
        <p className={cn("text-sm leading-snug", t.done ? "line-through text-muted-foreground/50" : "text-foreground")}>{t.title}</p>
        {t.notes && !t.done && <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{t.notes}</p>}
        {(due || people.length > 0 || doneByName) && (
          <div className="flex items-center gap-2 mt-1">
            {due && !t.done && (
              <span className={cn("text-[11px] font-medium", due.tone === "over" ? "text-terracotta/80" : due.tone === "today" ? "text-sage" : "text-muted-foreground/50")}>
                {due.label}
              </span>
            )}
            {!t.done && people.map((p, i) => (
              <span key={i} className="w-4 h-4 rounded-full overflow-hidden bg-secondary inline-flex items-center justify-center flex-shrink-0" style={{ boxShadow: `0 0 0 1.5px ${p.hex}` }}>
                {p.url ? <SignedImg src={p.url} className="w-full h-full object-cover" /> : <span className="text-[8px] font-semibold text-muted-foreground">{p.name[0]?.toUpperCase()}</span>}
              </span>
            ))}
            {doneByName && <span className="text-[10px] text-muted-foreground/40">done by {doneByName}</span>}
          </div>
        )}
      </button>
    </div>
  );
}
