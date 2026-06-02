"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import {
  addLedgerEntry, updateLedgerEntry, deleteLedgerEntry, settleAll, addSavingsPot, contributeToPot,
  deleteSavingsPot, addPotFolder,
} from "./actions";
import { Check, Trash2, Pencil, Repeat } from "lucide-react";
import { useFabSetter } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { OwnerAvatars } from "@/components/ui/owner-avatars";
import { useOwnerIdentity, ownerCardStyle, ownerTint } from "@/lib/owner-identity";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";
import { useScrolled } from "@/lib/use-scrolled";

type Recurrence = "none" | "weekly" | "monthly";

interface Entry {
  id: string;
  title: string;
  amount: string;
  paid_by: string;
  split_ratio: string;
  settled: boolean;
  created_at: string;
  created_by: string;
  category: string | null;
  recurrence: Recurrence;
  settled_at: string | null;
}

interface Pot {
  id: string;
  title: string;
  goal_amount: string;
  his_amount: string;
  hers_amount: string;
  folder_id: string | null;
  created_by?: string | null;
  target_date: string | null;
  currency: string;
}

interface PotFolder {
  id: string;
  name: string;
  emoji: string;
  is_default: boolean;
  sort_order: number;
  created_by: string;
  created_at: string;
}

type LedgerCache = { entries: Entry[]; pots: Pot[]; folders: PotFolder[] };

const CATEGORIES = [
  { id: "food",      emoji: "🍽️", label: "food" },
  { id: "travel",    emoji: "✈️", label: "travel" },
  { id: "home",      emoji: "🏡", label: "home" },
  { id: "fun",       emoji: "🎉", label: "fun" },
  { id: "shopping",  emoji: "🛍️", label: "shopping" },
  { id: "bills",     emoji: "📄", label: "bills" },
  { id: "transport", emoji: "🚗", label: "transport" },
  { id: "other",     emoji: "💸", label: "other" },
] as const;
const catById = (id: string | null) => CATEGORIES.find((c) => c.id === id);

const CURRENCIES = ["£", "$", "€"] as const;
const RECURRENCES: { id: Recurrence; label: string }[] = [
  { id: "none", label: "one-off" },
  { id: "weekly", label: "weekly" },
  { id: "monthly", label: "monthly" },
];


// Group settled expenses into "receipts" — one per settle-up batch (shared
// settled_at). Older rows without a timestamp fall into one "earlier" group.
function groupSettlements(entries: Entry[]) {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.settled_at ?? "legacy";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries())
    .map(([key, es]) => ({
      key,
      date: key === "legacy" ? null : new Date(key).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      entries: es,
      total: es.reduce((s, e) => s + parseFloat(e.amount), 0),
    }))
    .sort((a, b) => (a.key === "legacy" ? 1 : b.key === "legacy" ? -1 : b.key.localeCompare(a.key)));
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function potPace(saved: number, goal: number, target: string | null, cur: string): string | null {
  if (saved >= goal) return "goal reached 🎉";
  if (!target) return null;
  const daysLeft = Math.ceil((new Date(target + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (daysLeft <= 0) return "target date passed";
  const perWeek = (goal - saved) / (daysLeft / 7);
  return `${cur}${perWeek.toFixed(0)}/wk to reach by ${fmtDate(target)}`;
}

type Accent = { hex: string };
type ResolveOwner = ReturnType<typeof useOwnerIdentity>;

// Module-level so they keep a stable component identity across renders (a nested
// definition would remount the whole subtree every render).
function PotCard({ pot, meId, myName, partnerName, myAccent, partnerAccent, onSelect }: {
  pot: Pot; meId: string; myName: string; partnerName: string;
  myAccent: Accent; partnerAccent: Accent; onSelect: (pot: Pot) => void;
}) {
  const goal = parseFloat(pot.goal_amount);
  const his = parseFloat(pot.his_amount ?? "0");
  const hers = parseFloat(pot.hers_amount ?? "0");
  const total = his + hers;
  const cur = pot.currency ?? "£";
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const iAmCreator = pot.created_by === meId;
  const creatorAccent = iAmCreator ? myAccent : partnerAccent;
  const otherAccent = iAmCreator ? partnerAccent : myAccent;
  const hisW = Math.min(100, (his / goal) * 100);
  const hersW = Math.min(100 - hisW, (hers / goal) * 100);
  const myAmount = iAmCreator ? his : hers;
  const theirAmount = iAmCreator ? hers : his;
  const paceText = potPace(total, goal, pot.target_date, cur);
  return (
    <button
      onClick={() => onSelect(pot)}
      className="w-full card-row p-4 text-left active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-foreground">{pot.title}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums">{cur}{total.toFixed(0)} / {cur}{goal.toFixed(0)}</p>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2 flex">
        <div className="h-full transition-all" style={{ width: `${hisW}%`, backgroundColor: creatorAccent.hex }} />
        <div className="h-full transition-all" style={{ width: `${hersW}%`, backgroundColor: otherAccent.hex }} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex gap-2">
          <span>{myName}: {cur}{myAmount.toFixed(0)}</span>
          <span>·</span>
          <span>{partnerName}: {cur}{theirAmount.toFixed(0)}</span>
        </div>
        <span className="font-medium text-foreground/70 tabular-nums">{pct}%</span>
      </div>
      {paceText && <p className="text-[11px] text-muted-foreground/60 mt-1.5">{paceText}</p>}
    </button>
  );
}

function ExpenseRow({ e, meId, myName, partnerName, cur, resolveOwner, onSelect }: {
  e: Entry; meId: string; myName: string; partnerName: string; cur: string;
  resolveOwner: ResolveOwner; onSelect: (e: Entry) => void;
}) {
  const amt = parseFloat(e.amount);
  const ratio = parseFloat(e.split_ratio ?? "0.5");
  const paidByMe = e.paid_by === meId;
  const myShare = paidByMe ? amt * (1 - ratio) : amt * ratio;
  const o = resolveOwner(e.paid_by);
  const cat = catById(e.category);
  const mine = e.created_by === meId;
  return (
    <div
      onClick={() => mine && onSelect(e)}
      className={cn("card-row overflow-hidden p-4 flex items-center gap-3", mine && "cursor-pointer active:scale-[0.99] transition-transform")}
      style={ownerCardStyle(o)}
    >
      {cat && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: ownerTint(o.people[0].hex) }}>{cat.emoji}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
          {e.recurrence !== "none" && <Repeat className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <OwnerAvatars people={o.people} />
          <p className="text-xs text-muted-foreground">
            {paidByMe ? myName : partnerName} paid {cur}{amt.toFixed(2)} · your share {cur}{myShare.toFixed(2)}
          </p>
        </div>
      </div>
      <div className={cn("text-sm font-semibold flex-shrink-0", paidByMe ? "text-sage" : "text-terracotta")}>
        {paidByMe ? `+${cur}${(amt * (1 - ratio)).toFixed(2)}` : `-${cur}${(amt * ratio).toFixed(2)}`}
      </div>
    </div>
  );
}

export default function LedgerClient() {
  const { coupleId, me, partner, myName, partnerName, currency } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const setAction = useFabSetter();
  const resolveOwner = useOwnerIdentity();
  const router = useRouter();
  const searchParams = useSearchParams();
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);
  const scrolled = useScrolled();

  const cached = getCache<LedgerCache>(`ledger:${coupleId}`);
  const [entries, setEntries] = useState<Entry[]>(() => cached?.entries ?? []);
  const [pots, setPots] = useState<Pot[]>(() => cached?.pots ?? []);
  const [folders, setFolders] = useState<PotFolder[]>(() => cached?.folders ?? []);
  const [loading, setLoading] = useState(() => cached === undefined);
  const [rtick, setRtick] = useState(0);
  const [tab, setTabState] = useState<"entries" | "pots">(() => searchParams.get("tab") === "pots" ? "pots" : "entries");
  const [, startTransition] = useTransition();

  // Keep the tab in the URL so a refresh stays on the same view.
  function setTab(t: "entries" | "pots") {
    setTabState(t);
    router.replace(t === "pots" ? "/ledger?tab=pots" : "/ledger", { scroll: false });
  }

  // Expense filters / history
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showHistory, setShowHistory] = useState(false);
  const [settledEntries, setSettledEntries] = useState<Entry[] | null>(null);

  // Sheets
  const [showAdd, setShowAdd] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [actionEntry, setActionEntry] = useState<Entry | null>(null);
  const [showPot, setShowPot] = useState(false);
  const [selectedPot, setSelectedPot] = useState<Pot | null>(null);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);

  // Add entry form
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<"me" | "partner">("me");
  const [split, setSplit] = useState("50");
  const [category, setCategory] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence>("none");

  // Add pot form
  const [potTitle, setPotTitle] = useState("");
  const [potGoal, setPotGoal] = useState("");
  const [potFolderId, setPotFolderId] = useState<string | null>(null);
  const [potTarget, setPotTarget] = useState("");
  const [potCurrency, setPotCurrency] = useState<string>(currency);

  // Contribute sheet
  const [contribDelta, setContribDelta] = useState("");
  const [contribMode, setContribMode] = useState<"add" | "withdraw">("add");

  const defaultFolderId = folders.find((f) => f.is_default)?.id ?? folders[0]?.id ?? null;


  useEffect(() => { markSeen("ledger"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates — partner adding expenses / contributing to pots.
  useEffect(() => {
    const supabase = createClient();
    const bump = () => setRtick((t) => t + 1);
    const channel = supabase.channel(`ledger-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries", filter: `couple_id=eq.${coupleId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings_pots",   filter: `couple_id=eq.${coupleId}` }, bump)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [coupleId]);

  useEffect(() => {
    setAction(() => {
      if (tab === "entries") { resetEntryForm(); setEditingEntryId(null); setShowAdd(true); return; }
      setPotFolderId(defaultFolderId);
      setShowPot(true);
    });
    return () => setAction(null);
  }, [tab, defaultFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("ledger_entries").select("*").eq("couple_id", coupleId).eq("settled", false).order("created_at", { ascending: false }),
      supabase.from("savings_pots").select("id, title, goal_amount, his_amount, hers_amount, folder_id, created_by, target_date, currency").eq("couple_id", coupleId).order("created_at", { ascending: false }),
      supabase.from("pot_folders").select("id, name, emoji, is_default, sort_order, created_by, created_at").eq("couple_id", coupleId).order("sort_order").order("created_at"),
    ]).then(async ([{ data: e }, { data: p }, { data: f }]) => {
      const entries = (e as Entry[]) ?? [];
      const pots = (p as Pot[]) ?? [];
      let folders = (f as PotFolder[]) ?? [];

      if (folders.length === 0) {
        await addPotFolder({ coupleId, userId: me.id, name: "savings", emoji: "🫙", isDefault: true });
        const { data: refetched } = await supabase
          .from("pot_folders").select("id, name, emoji, is_default, sort_order, created_by, created_at")
          .eq("couple_id", coupleId).order("sort_order");
        folders = (refetched as PotFolder[]) ?? [];
      }

      setEntries(entries);
      setPots(pots);
      setFolders(folders);
      setLoading(false);
      setCache(`ledger:${coupleId}`, { entries, pots, folders });

      // Open a specific pot if linked from the home dashboard (?pot=<id>).
      const potParam = searchParams.get("pot");
      if (potParam) {
        const p = pots.find((x) => x.id === potParam);
        if (p) { setSelectedPot(p); setContribDelta(""); setContribMode("add"); }
      }
    });
  }, [coupleId, rtick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory() {
    if (settledEntries) return;
    const { data } = await createClient()
      .from("ledger_entries").select("*").eq("couple_id", coupleId).eq("settled", true)
      .order("created_at", { ascending: false }).limit(100);
    setSettledEntries((data as Entry[]) ?? []);
  }

  // Net balance (unsettled only)
  let youOwe = 0, theyOwe = 0;
  for (const e of entries) {
    const amt = parseFloat(e.amount);
    const ratio = parseFloat(e.split_ratio ?? "0.5");
    if (e.paid_by !== me.id) youOwe += amt * ratio;
    else theyOwe += amt * (1 - ratio);
  }
  const net = theyOwe - youOwe;
  const balanced = Math.abs(net) < 0.01;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function resetEntryForm() {
    setTitle(""); setAmount(""); setPaidBy("me"); setSplit("50"); setCategory(null); setRecurrence("none");
  }

  function handleSaveEntry() {
    if (!title.trim() || !amount) return;
    const amt = parseFloat(amount);
    const ratio = parseFloat(split) / 100;
    const paidById = paidBy === "me" ? me.id : partner?.id ?? me.id;
    const t = title.trim();
    if (editingEntryId) {
      const id = editingEntryId;
      setEntries((prev) => prev.map((e) => e.id === id
        ? { ...e, title: t, amount: amt.toString(), paid_by: paidById, split_ratio: ratio.toString(), category, recurrence }
        : e));
      startTransition(() => { updateLedgerEntry({ id, coupleId, userId: me.id, title: t, amount: amt, paidBy: paidById, splitRatio: ratio, category, recurrence }); });
    } else {
      const optimistic: Entry = {
        id: crypto.randomUUID(), title: t, amount: amt.toString(),
        paid_by: paidById, split_ratio: ratio.toString(), settled: false,
        created_at: new Date().toISOString(), created_by: me.id, category, recurrence, settled_at: null,
      };
      setEntries((prev) => [optimistic, ...prev]);
      markActivity("ledger");
      startTransition(() => { addLedgerEntry({ coupleId, userId: me.id, title: t, amount: amt, paidBy: paidById, splitRatio: ratio, category, recurrence }); });
    }
    resetEntryForm(); setEditingEntryId(null); setShowAdd(false);
  }

  function openEditEntry(e: Entry) {
    setActionEntry(null);
    setEditingEntryId(e.id);
    setTitle(e.title);
    setAmount(e.amount);
    setPaidBy(e.paid_by === me.id ? "me" : "partner");
    setSplit(String(Math.round(parseFloat(e.split_ratio ?? "0.5") * 100)));
    setCategory(e.category);
    setRecurrence(e.recurrence);
    setShowAdd(true);
  }

  function handleDeleteEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setActionEntry(null);
    startTransition(() => { deleteLedgerEntry(id, coupleId, me.id); });
  }

  function handleSettle() {
    // Only non-recurring entries clear; recurring stay as ongoing splits.
    setEntries((prev) => prev.filter((e) => e.recurrence !== "none"));
    setSettledEntries(null); // invalidate history cache
    setShowSettleConfirm(false);
    startTransition(() => { settleAll(coupleId); });
  }

  function handleAddPot() {
    const folderId = potFolderId ?? defaultFolderId;
    if (!potTitle.trim() || !potGoal || !folderId) return;
    const goal = parseFloat(potGoal);
    const optimistic: Pot = {
      id: crypto.randomUUID(), title: potTitle.trim(), goal_amount: goal.toString(),
      his_amount: "0", hers_amount: "0", folder_id: folderId, created_by: me.id,
      target_date: potTarget || null, currency: potCurrency,
    };
    setPots((prev) => [optimistic, ...prev]);
    setPotTitle(""); setPotGoal(""); setPotTarget(""); setPotCurrency(currency); setShowPot(false);
    markActivity("ledger");
    startTransition(() => { addSavingsPot({ coupleId, userId: me.id, title: optimistic.title, goalAmount: goal, folderId, targetDate: potTarget || null, currency: potCurrency }); });
  }

  function handleContribute() {
    if (!selectedPot || !contribDelta) return;
    const magnitude = Math.abs(parseFloat(contribDelta));
    const delta = contribMode === "add" ? magnitude : -magnitude;
    const iAmCreator = selectedPot.created_by === me.id;
    setPots((prev) => prev.map((p) => {
      if (p.id !== selectedPot.id) return p;
      const cur = parseFloat((iAmCreator ? p.his_amount : p.hers_amount) ?? "0");
      const next = Math.max(0, cur + delta).toString();
      return iAmCreator ? { ...p, his_amount: next } : { ...p, hers_amount: next };
    }));
    setSelectedPot(null); setContribDelta("");
    startTransition(() => { contributeToPot(selectedPot.id, coupleId, me.id, delta); });
  }

  function handleDeletePot(pot: Pot) {
    setPots((prev) => prev.filter((p) => p.id !== pot.id));
    setSelectedPot(null);
    startTransition(() => { deleteSavingsPot(pot.id, coupleId); });
  }

  // ── Sheets (shared) ──────────────────────────────────────────────────────────

  function renderSheets() {
    return (
      <>
        {/* Add / edit entry */}
        <BottomSheet open={showAdd} onClose={() => { setShowAdd(false); setEditingEntryId(null); }}
          title={editingEntryId ? "edit expense" : "log expense"}
          footer={<Button onClick={handleSaveEntry} disabled={!title.trim() || !amount} className="w-full h-11 rounded-xl">{editingEntryId ? "save" : "add"}</Button>}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what for?" className="h-11 rounded-xl bg-card border-border/60" />
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount (${currency})`} type="number" min="0" step="0.01" className="h-11 rounded-xl bg-card border-border/60" />
          <div>
            <p className="text-xs text-muted-foreground mb-2">category</p>
            <div className="flex gap-1.5 overflow-x-auto py-0.5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => setCategory(category === c.id ? null : c.id)}
                  className={cn("flex-shrink-0 px-2.5 py-1.5 rounded-xl text-sm border transition-colors flex items-center gap-1",
                    category === c.id ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border/60"
                  )}><span>{c.emoji}</span>{c.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">who paid?</p>
            <div className="flex gap-2">
              {([["me", myName], ["partner", partnerName]] as ["me" | "partner", string][]).map(([v, l]) => {
                const selected = paidBy === v;
                const accent = v === "me" ? myAccent.hex : partnerAccent.hex;
                return (
                  <button key={v} onClick={() => setPaidBy(v)} aria-pressed={selected}
                    className={cn("flex-1 py-2 text-sm rounded-xl border-2 transition-colors",
                      selected ? "bg-foreground text-background" : "bg-card text-muted-foreground border-border/60"
                    )}
                    style={selected ? { borderColor: accent } : undefined}
                  >{l}</button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">your share: {split}%</p>
            <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(e.target.value)} className="w-full accent-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">repeats?</p>
            <div className="flex gap-2">
              {RECURRENCES.map((r) => (
                <button key={r.id} onClick={() => setRecurrence(r.id)} aria-pressed={recurrence === r.id}
                  className={cn("flex-1 py-2 text-sm rounded-xl border transition-colors",
                    recurrence === r.id ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border/60"
                  )}>{r.label}</button>
              ))}
            </div>
            {recurrence !== "none" && <p className="text-[11px] text-muted-foreground/50 mt-1.5">recurring expenses stay on the ledger after you settle up</p>}
          </div>
        </BottomSheet>

        {/* Contribute / manage pot */}
        {selectedPot && (() => {
          const goal = parseFloat(selectedPot.goal_amount);
          const cur = selectedPot.currency ?? "£";
          const iAmCreator = selectedPot.created_by === me.id;
          const myCurrent = parseFloat((iAmCreator ? selectedPot.his_amount : selectedPot.hers_amount) ?? "0");
          const theirAmt = parseFloat((iAmCreator ? selectedPot.hers_amount : selectedPot.his_amount) ?? "0");
          const magnitude = Math.abs(parseFloat(contribDelta || "0"));
          const delta = contribMode === "add" ? magnitude : -magnitude;
          const myNew = Math.max(0, myCurrent + delta);
          const totalNew = myNew + theirAmt;
          const pct = Math.min(100, Math.round((totalNew / goal) * 100));
          const paceText = potPace(totalNew, goal, selectedPot.target_date, cur);
          return (
            <BottomSheet open onClose={() => setSelectedPot(null)} title={selectedPot.title}
              footer={
                <div className="space-y-2">
                  <Button onClick={handleContribute} disabled={!magnitude} className="w-full h-11 rounded-xl">
                    {contribMode === "add" ? "add to pot" : "withdraw"}
                  </Button>
                  <button onClick={() => handleDeletePot(selectedPot)}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground/60 hover:text-terracotta transition-colors py-1">
                    <Trash2 className="w-3.5 h-3.5" /> delete pot
                  </button>
                </div>
              }>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{cur}{totalNew.toFixed(0)} saved · {pct}%</span>
                  <span>goal {cur}{goal.toFixed(0)}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                {paceText && <p className="text-[11px] text-muted-foreground/60 mt-1.5">{paceText}</p>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">you&apos;ve put in {cur}{myCurrent.toFixed(0)}</p>
                <div className="flex gap-2 mb-2">
                  {(["add", "withdraw"] as const).map((m) => (
                    <button key={m} onClick={() => setContribMode(m)} aria-pressed={contribMode === m}
                      className={cn("flex-1 py-2 text-sm rounded-xl border transition-colors capitalize",
                        contribMode === m ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border/60"
                      )}>{m}</button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground/60 pointer-events-none select-none">{cur}</span>
                  <Input value={contribDelta} onChange={(e) => setContribDelta(e.target.value)} type="number" min="0" step="0.01" placeholder="0" className="h-11 rounded-xl bg-card border-border/60 pl-8" />
                </div>
              </div>
              <div className="text-xs text-muted-foreground bg-secondary rounded-xl px-3 py-2.5">
                {partnerName}: {cur}{theirAmt.toFixed(0)}
              </div>
            </BottomSheet>
          );
        })()}

        {/* Add pot */}
        <BottomSheet open={showPot} onClose={() => setShowPot(false)} title="new savings pot"
          footer={<Button onClick={handleAddPot} disabled={!potTitle.trim() || !potGoal} className="w-full h-11 rounded-xl">create pot</Button>}>
          <Input value={potTitle} onChange={(e) => setPotTitle(e.target.value)} placeholder="what are you saving for?" className="h-11 rounded-xl bg-card border-border/60" />
          <div>
            <p className="text-xs text-muted-foreground mb-2">currency</p>
            <div className="flex gap-2">
              {CURRENCIES.map((c) => (
                <button key={c} onClick={() => setPotCurrency(c)}
                  className={cn("w-11 h-11 rounded-xl text-sm font-bold border transition-colors",
                    potCurrency === c ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border/60"
                  )}>{c}</button>
              ))}
            </div>
          </div>
          <Input value={potGoal} onChange={(e) => setPotGoal(e.target.value)} placeholder={`goal amount (${potCurrency})`} type="number" min="0" className="h-11 rounded-xl bg-card border-border/60" />
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">target date <span className="opacity-50">(optional)</span></p>
            <Input value={potTarget} onChange={(e) => setPotTarget(e.target.value)} type="date" className="h-11 rounded-xl bg-card border-border/60" />
          </div>
        </BottomSheet>

        {/* Expense action prompt — creator only */}
        <Dialog open={actionEntry !== null} onClose={() => setActionEntry(null)}>
          {actionEntry && (
            <>
              <p className="font-semibold text-foreground text-center truncate">{actionEntry.title}</p>
              <p className="text-sm text-muted-foreground text-center mt-1 mb-5">what would you like to do?</p>
              <div className="space-y-2">
                <Button onClick={() => openEditEntry(actionEntry)} className="w-full h-11 rounded-xl">
                  <Pencil className="w-4 h-4 mr-1.5" /> edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleDeleteEntry(actionEntry.id)}
                  className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> remove
                </Button>
                <button onClick={() => setActionEntry(null)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
              </div>
            </>
          )}
        </Dialog>

        {/* Settle-up confirmation */}
        <Dialog open={showSettleConfirm} onClose={() => setShowSettleConfirm(false)}>
          <p className="font-semibold text-foreground text-center">settle up?</p>
          <p className="text-sm text-muted-foreground text-center mt-2 mb-5 leading-relaxed">
            this clears all one-off expenses and records them as settled. recurring expenses stay. this can&apos;t be undone.
          </p>
          <div className="space-y-2">
            <Button onClick={handleSettle} className="w-full h-11 rounded-xl">
              <Check className="w-4 h-4 mr-1.5" /> settle up
            </Button>
            <button onClick={() => setShowSettleConfirm(false)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
          </div>
        </Dialog>
      </>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────

  const presentCategories = Array.from(new Set(entries.map((e) => e.category).filter(Boolean))) as string[];
  const visibleEntries = categoryFilter === "all" ? entries : entries.filter((e) => e.category === categoryFilter);

  return (
    <div className="px-4 pb-6 max-w-lg mx-auto">
      <div className={cn("sticky top-0 z-30 bg-background -mx-4 px-4 pt-10 pb-3 mb-4 border-b transition-[border-color,box-shadow]", scrolled ? "border-border/60 shadow-soft" : "border-transparent")}>
        <h1 className="font-heading text-3xl text-foreground tracking-tight">ledger.</h1>
        <p className="text-sm text-muted-foreground mt-0.5">shared expenses &amp; savings</p>
      </div>

      {/* Balance — slim pill when settled, full card when owing */}
      {!loading && (
        balanced ? (
          <div className="flex items-center justify-center gap-2 bg-secondary rounded-2xl py-3 mb-5">
            <Check className="w-4 h-4 text-sage" />
            <p className="text-sm font-medium text-muted-foreground">all settled up</p>
          </div>
        ) : (
          <div className={cn("rounded-3xl p-5 mb-5", net > 0 ? "bg-sage-light" : "bg-terracotta-light")}>
            <p className="text-xs text-muted-foreground font-medium tracking-wide mb-1">balance</p>
            <p className={cn("text-4xl font-bold tabular-nums mb-1", net > 0 ? "text-sage" : "text-terracotta")}>
              {net > 0 ? `+${currency}${net.toFixed(2)}` : `-${currency}${Math.abs(net).toFixed(2)}`}
            </p>
            <p className="text-sm text-muted-foreground">{net > 0 ? `${partnerName} owes you` : `you owe ${partnerName}`}</p>
            <button onClick={() => setShowSettleConfirm(true)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground bg-card/70 rounded-xl px-3 py-1.5">
              <Check className="w-3 h-3" /> settle up
            </button>
          </div>
        )
      )}

      {/* Tabs */}
      <div className="flex bg-secondary rounded-2xl p-1 mb-4">
        {([["entries", "expenses"], ["pots", "savings pots"]] as ["entries" | "pots", string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            className={cn("flex-1 py-2 text-sm font-medium rounded-xl transition-all",
              tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}>{l}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
      ) : tab === "entries" ? (
        <>
          {/* History toggle */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground font-medium tracking-wide">
              {showHistory ? "settled history" : "active expenses"}
            </p>
            <button
              onClick={() => { const next = !showHistory; setShowHistory(next); if (next) loadHistory(); }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showHistory ? "← back to active" : "history"}
            </button>
          </div>

          {showHistory ? (
            settledEntries === null ? (
              <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
            ) : settledEntries.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground text-sm">nothing settled yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupSettlements(settledEntries).map((s) => (
                  <div key={s.key} className="card-row p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-sm font-semibold text-foreground">{s.date ? `settled ${s.date}` : "earlier settlements"}</p>
                      <p className="text-sm font-semibold text-muted-foreground tabular-nums">{currency}{s.total.toFixed(2)}</p>
                    </div>
                    <div className="space-y-1.5">
                      {s.entries.map((e) => {
                        const cat = catById(e.category);
                        const paidByName = e.paid_by === me.id ? myName : partnerName;
                        return (
                          <div key={e.id} className="flex items-center gap-2 text-xs">
                            {cat && <span className="text-sm leading-none flex-shrink-0">{cat.emoji}</span>}
                            <span className="text-foreground truncate flex-1">{e.title}</span>
                            <span className="text-muted-foreground/70 flex-shrink-0 tabular-nums">{paidByName} · {currency}{parseFloat(e.amount).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : entries.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-sm">no unsettled expenses</p>
              <p className="text-muted-foreground/60 text-xs mt-1">tap + to log one</p>
            </div>
          ) : (
            <>
              {presentCategories.length > 0 && (
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                  <button onClick={() => setCategoryFilter("all")}
                    className={cn("flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all",
                      categoryFilter === "all" ? "bg-foreground text-background" : "bg-card border border-border/50 text-muted-foreground"
                    )}>all</button>
                  {presentCategories.map((cid) => {
                    const c = catById(cid);
                    return (
                      <button key={cid} onClick={() => setCategoryFilter(cid)}
                        className={cn("flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1",
                          categoryFilter === cid ? "bg-foreground text-background" : "bg-card border border-border/50 text-muted-foreground"
                        )}><span>{c?.emoji}</span>{c?.label ?? cid}</button>
                    );
                  })}
                </div>
              )}
              <div className="space-y-2">
                {visibleEntries.map((e) => (
                  <ExpenseRow key={e.id} e={e} meId={me.id} myName={myName} partnerName={partnerName}
                    cur={currency} resolveOwner={resolveOwner} onSelect={(en) => setActionEntry(en)} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        // ── Savings pots (flat list) ──
        pots.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">no savings pots yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">tap + to create one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pots.map((pot) => (
              <PotCard key={pot.id} pot={pot} meId={me.id} myName={myName} partnerName={partnerName}
                myAccent={myAccent} partnerAccent={partnerAccent}
                onSelect={(p) => { setSelectedPot(p); setContribDelta(""); setContribMode("add"); }} />
            ))}
          </div>
        )
      )}

      {renderSheets()}
    </div>
  );
}
