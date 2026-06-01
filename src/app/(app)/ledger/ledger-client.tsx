"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import {
  addLedgerEntry, settleAll, addSavingsPot, contributeToPot, deleteSavingsPot,
  addPotFolder, deletePotFolder,
} from "./actions";
import { Plus, X, Check, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useFabSetter } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

interface Entry {
  id: string;
  title: string;
  amount: string;
  paid_by: string;
  split_ratio: string;
  settled: boolean;
  created_at: string;
}

interface Pot {
  id: string;
  title: string;
  goal_amount: string;
  his_amount: string;
  hers_amount: string;
  folder_id: string | null;
  created_by?: string | null;
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

const FOLDER_EMOJIS = ["🫙", "💰", "🏦", "✈️", "🏡", "💍", "🎓", "🚗", "🎁", "🏖️", "💻", "🛋️"];
const POT_PANEL_COLORS = ["#E8F0EA", "#F5EDD3", "#E3EEF8", "#EDE9F5", "#F5E3E5"];
const potPanelColor = (sortOrder: number) => POT_PANEL_COLORS[sortOrder % POT_PANEL_COLORS.length];

export default function LedgerClient() {
  const { coupleId, me, partner, myName, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const setAction = useFabSetter();
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const cached = getCache<LedgerCache>(`ledger:${coupleId}`);
  const [entries, setEntries] = useState<Entry[]>(() => cached?.entries ?? []);
  const [pots, setPots] = useState<Pot[]>(() => cached?.pots ?? []);
  const [folders, setFolders] = useState<PotFolder[]>(() => cached?.folders ?? []);
  const [loading, setLoading] = useState(() => cached === undefined);
  const [tab, setTab] = useState<"entries" | "pots">("entries");
  const [, startTransition] = useTransition();

  // Pot folder navigation
  const [activePotFolder, setActivePotFolder] = useState<PotFolder | null>(null);

  // Sheets
  const [showAdd, setShowAdd] = useState(false);
  const [showPot, setShowPot] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [selectedPot, setSelectedPot] = useState<Pot | null>(null);

  // Add entry form
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<"me" | "partner">("me");
  const [split, setSplit] = useState("50");

  // Add pot form
  const [potTitle, setPotTitle] = useState("");
  const [potGoal, setPotGoal] = useState("");
  const [potFolderId, setPotFolderId] = useState<string | null>(null);

  // New folder form
  const [folderName, setFolderName] = useState("");
  const [folderEmoji, setFolderEmoji] = useState("🫙");

  // Contribute sheet
  const [myContrib, setMyContrib] = useState("");

  const defaultFolderId = folders.find((f) => f.is_default)?.id ?? folders[0]?.id ?? null;

  useScrollLock(showAdd || showPot || showFolder || selectedPot !== null);

  useEffect(() => { markSeen("ledger"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // FAB: expenses → expense form, pots → pot form (targeting current/default folder)
  useEffect(() => {
    setAction(() => {
      if (tab === "entries") { setShowAdd(true); return; }
      setPotFolderId(activePotFolder?.id ?? defaultFolderId);
      setShowPot(true);
    });
    return () => setAction(null);
  }, [tab, activePotFolder, defaultFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("ledger_entries").select("*").eq("couple_id", coupleId).eq("settled", false).order("created_at", { ascending: false }),
      supabase.from("savings_pots").select("id, title, goal_amount, his_amount, hers_amount, folder_id, created_by").eq("couple_id", coupleId).order("created_at", { ascending: false }),
      supabase.from("pot_folders").select("id, name, emoji, is_default, sort_order, created_by, created_at").eq("couple_id", coupleId).order("sort_order").order("created_at"),
    ]).then(async ([{ data: e }, { data: p }, { data: f }]) => {
      const entries = (e as Entry[]) ?? [];
      const pots = (p as Pot[]) ?? [];
      let folders = (f as PotFolder[]) ?? [];

      // Seed default folder for couples that don't have one yet
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
    });
  }, [coupleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Net balance
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

  function handleAddEntry() {
    if (!title.trim() || !amount) return;
    const amt = parseFloat(amount);
    const ratio = parseFloat(split) / 100;
    const paidById = paidBy === "me" ? me.id : partner?.id ?? me.id;
    const optimistic: Entry = {
      id: crypto.randomUUID(), title: title.trim(), amount: amt.toString(),
      paid_by: paidById, split_ratio: ratio.toString(), settled: false, created_at: new Date().toISOString(),
    };
    setEntries((prev) => [optimistic, ...prev]);
    setTitle(""); setAmount(""); setSplit("50"); setShowAdd(false);
    markActivity("ledger");
    startTransition(() => { addLedgerEntry({ coupleId, userId: me.id, title: optimistic.title, amount: amt, paidBy: paidById, splitRatio: ratio }); });
  }

  function handleSettle() {
    setEntries([]);
    startTransition(() => { settleAll(coupleId); });
  }

  function handleAddPot() {
    const folderId = potFolderId ?? defaultFolderId;
    if (!potTitle.trim() || !potGoal || !folderId) return;
    const goal = parseFloat(potGoal);
    const optimistic: Pot = {
      id: crypto.randomUUID(), title: potTitle.trim(), goal_amount: goal.toString(),
      his_amount: "0", hers_amount: "0", folder_id: folderId, created_by: me.id,
    };
    setPots((prev) => [optimistic, ...prev]);
    setPotTitle(""); setPotGoal(""); setShowPot(false);
    markActivity("ledger");
    startTransition(() => { addSavingsPot({ coupleId, userId: me.id, title: optimistic.title, goalAmount: goal, folderId }); });
  }

  function handleContribute() {
    if (!selectedPot || !myContrib) return;
    const amount = parseFloat(myContrib);
    const iAmCreator = selectedPot.created_by === me.id;
    setPots((prev) => prev.map((p) =>
      p.id === selectedPot.id
        ? iAmCreator ? { ...p, his_amount: amount.toString() } : { ...p, hers_amount: amount.toString() }
        : p
    ));
    setSelectedPot(null); setMyContrib("");
    startTransition(() => { contributeToPot(selectedPot.id, coupleId, me.id, amount); });
  }

  function handleDeletePot(pot: Pot) {
    setPots((prev) => prev.filter((p) => p.id !== pot.id));
    setSelectedPot(null);
    startTransition(() => { deleteSavingsPot(pot.id, coupleId); });
  }

  function handleAddFolder() {
    if (!folderName.trim()) return;
    const optimistic: PotFolder = {
      id: crypto.randomUUID(), name: folderName.trim(), emoji: folderEmoji,
      is_default: false, sort_order: folders.length, created_by: me.id, created_at: new Date().toISOString(),
    };
    setFolders((prev) => [...prev, optimistic]);
    setShowFolder(false); setFolderName(""); setFolderEmoji("🫙");
    startTransition(() => { addPotFolder({ coupleId, userId: me.id, name: optimistic.name, emoji: optimistic.emoji }); });
  }

  function handleDeleteFolder(folder: PotFolder) {
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setPots((prev) => prev.filter((p) => p.folder_id !== folder.id));
    startTransition(() => { deletePotFolder(folder.id, coupleId); });
  }

  // ── Detail view: pots within a folder ───────────────────────────────────────

  if (tab === "pots" && activePotFolder) {
    const folderPots = pots.filter((p) => p.folder_id === activePotFolder.id);
    return (
      <div className="px-4 pt-10 pb-24 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setActivePotFolder(null)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1 flex-shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-foreground flex-1 truncate">
            <span className="mr-1.5">{activePotFolder.emoji}</span>{activePotFolder.name}
          </h1>
        </div>

        {folderPots.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">no pots in here yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">tap + to create one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {folderPots.map((pot) => <PotCard key={pot.id} pot={pot} />)}
          </div>
        )}

        {renderSheets()}
      </div>
    );
  }

  // ── Pot card (shared) ───────────────────────────────────────────────────────

  function PotCard({ pot }: { pot: Pot }) {
    const goal = parseFloat(pot.goal_amount);
    const his = parseFloat(pot.his_amount ?? "0");
    const hers = parseFloat(pot.hers_amount ?? "0");
    const total = his + hers;
    const pct = Math.min(100, (total / goal) * 100);
    const iAmCreator = pot.created_by === me.id;
    const myAmount = iAmCreator ? his : hers;
    const theirAmount = iAmCreator ? hers : his;
    return (
      <button
        onClick={() => { setSelectedPot(pot); setMyContrib(myAmount.toString()); }}
        className="w-full bg-white border border-border/50 rounded-2xl p-4 shadow-card text-left active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-foreground">{pot.title}</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">£{total.toFixed(0)} / £{goal.toFixed(0)}</p>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
          <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex gap-2">
            <span>{myName}: £{myAmount.toFixed(0)}</span>
            <span>·</span>
            <span>{partnerName}: £{theirAmount.toFixed(0)}</span>
          </div>
          <span className="text-muted-foreground/50">tap to update</span>
        </div>
      </button>
    );
  }

  // ── Sheets (shared across views) ────────────────────────────────────────────

  function renderSheets() {
    return (
      <>
        {/* Add entry */}
        {showAdd && (
          <div className="fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
              style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">log expense</p>
                <button onClick={() => setShowAdd(false)} className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors -mr-2"><X className="w-5 h-5" /></button>
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what for?" className="h-11 rounded-xl bg-white border-border/60" autoFocus />
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="amount (£)" type="number" min="0" step="0.01" className="h-11 rounded-xl bg-white border-border/60" />
              <div>
                <p className="text-xs text-muted-foreground mb-2">who paid?</p>
                <div className="flex gap-2">
                  {([["me", myName], ["partner", partnerName]] as ["me" | "partner", string][]).map(([v, l]) => (
                    <button key={v} onClick={() => setPaidBy(v)}
                      className={cn("flex-1 py-2 text-sm rounded-xl border transition-colors",
                        paidBy === v ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground border-border/60"
                      )}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">your share: {split}%</p>
                <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(e.target.value)} className="w-full accent-foreground" />
              </div>
              <Button onClick={handleAddEntry} disabled={!title.trim() || !amount} className="w-full h-11 rounded-xl">add</Button>
            </div>
          </div>
        )}

        {/* Contribute / manage pot */}
        {selectedPot && (() => {
          const goal = parseFloat(selectedPot.goal_amount);
          const iAmCreator = selectedPot.created_by === me.id;
          const myAmt = parseFloat(myContrib || "0");
          const theirAmt = iAmCreator ? parseFloat(selectedPot.hers_amount ?? "0") : parseFloat(selectedPot.his_amount ?? "0");
          const pct = Math.min(100, ((myAmt + theirAmt) / goal) * 100);
          return (
            <div className="fixed inset-0 z-[60]">
              <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedPot(null)} />
              <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
                style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{selectedPot.title}</p>
                  <button onClick={() => setSelectedPot(null)} className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors -mr-2"><X className="w-5 h-5" /></button>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>£{(myAmt + theirAmt).toFixed(0)} saved</span>
                    <span>goal £{goal.toFixed(0)}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">your contribution (£)</p>
                  <Input value={myContrib} onChange={(e) => setMyContrib(e.target.value)} type="number" min="0" step="0.01" className="h-11 rounded-xl bg-white border-border/60" autoFocus />
                </div>
                <div className="text-xs text-muted-foreground bg-secondary rounded-xl px-3 py-2.5">
                  {partnerName}: £{theirAmt.toFixed(0)}
                </div>
                <Button onClick={handleContribute} disabled={!myContrib} className="w-full h-11 rounded-xl">save</Button>
                <button onClick={() => handleDeletePot(selectedPot)}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground/60 hover:text-terracotta transition-colors py-1">
                  <Trash2 className="w-3.5 h-3.5" /> delete pot
                </button>
              </div>
            </div>
          );
        })()}

        {/* Add pot */}
        {showPot && (
          <div className="fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowPot(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
              style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">new savings pot</p>
                <button onClick={() => setShowPot(false)} className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors -mr-2"><X className="w-5 h-5" /></button>
              </div>
              <Input value={potTitle} onChange={(e) => setPotTitle(e.target.value)} placeholder="what are you saving for?" className="h-11 rounded-xl bg-white border-border/60" autoFocus />
              <Input value={potGoal} onChange={(e) => setPotGoal(e.target.value)} placeholder="goal amount (£)" type="number" min="0" className="h-11 rounded-xl bg-white border-border/60" />
              <div>
                <p className="text-xs text-muted-foreground mb-2">folder</p>
                <div className="flex gap-2 flex-wrap">
                  {folders.map((f) => (
                    <button key={f.id} onClick={() => setPotFolderId(f.id)}
                      className={cn("px-3 py-1.5 rounded-xl text-sm border transition-colors flex items-center gap-1.5",
                        (potFolderId ?? defaultFolderId) === f.id ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground border-border/60"
                      )}>
                      <span>{f.emoji}</span>{f.name}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={handleAddPot} disabled={!potTitle.trim() || !potGoal} className="w-full h-11 rounded-xl">create pot</Button>
            </div>
          </div>
        )}

        {/* New folder */}
        {showFolder && (
          <div className="fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowFolder(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-5"
              style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">new folder</p>
                <button onClick={() => setShowFolder(false)} className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors -mr-2"><X className="w-5 h-5" /></button>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">emoji</p>
                <div className="grid grid-cols-6 gap-2">
                  {FOLDER_EMOJIS.map((e) => (
                    <button key={e} onClick={() => setFolderEmoji(e)}
                      className={cn("aspect-square rounded-xl text-xl flex items-center justify-center transition-all",
                        folderEmoji === e ? "bg-foreground/10 ring-2 ring-foreground/40" : "bg-secondary hover:bg-secondary/70"
                      )}>{e}</button>
                  ))}
                </div>
              </div>
              <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="folder name" className="h-11 rounded-xl bg-white border-border/60" autoFocus />
              <Button onClick={handleAddFolder} disabled={!folderName.trim()} className="w-full h-11 rounded-xl">create folder</Button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────

  return (
    <div className="px-4 pt-10 pb-6 max-w-lg mx-auto">
      <h1 className="font-heading text-3xl text-foreground tracking-tight mb-6">ledger.</h1>

      {/* Balance card */}
      {!loading && (
        <div className={cn("rounded-3xl p-5 mb-5", balanced ? "bg-secondary" : net > 0 ? "bg-sage-light" : "bg-terracotta-light")}>
          <p className="text-xs text-muted-foreground font-medium tracking-wide mb-1">balance</p>
          <p className={cn("text-4xl font-bold tabular-nums mb-1", balanced ? "text-muted-foreground" : net > 0 ? "text-sage" : "text-terracotta")}>
            {balanced ? "all clear" : net > 0 ? `+£${net.toFixed(2)}` : `-£${Math.abs(net).toFixed(2)}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {balanced ? "you're all settled up" : net > 0 ? `${partnerName} owes you` : `you owe ${partnerName}`}
          </p>
          {!balanced && (
            <button onClick={handleSettle} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-foreground bg-white/70 rounded-xl px-3 py-1.5">
              <Check className="w-3 h-3" /> settle up
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-secondary rounded-2xl p-1 mb-4">
        {([["entries", "expenses"], ["pots", "savings pots"]] as ["entries" | "pots", string][]).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2 text-sm font-medium rounded-xl transition-all",
              tab === t ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
            )}>{l}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
      ) : tab === "entries" ? (
        entries.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">no unsettled expenses</p>
            <p className="text-muted-foreground/60 text-xs mt-1">tap + to log one</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => {
              const amt = parseFloat(e.amount);
              const ratio = parseFloat(e.split_ratio ?? "0.5");
              const paidByMe = e.paid_by === me.id;
              const myShare = paidByMe ? amt * (1 - ratio) : amt * ratio;
              const payerAccent = e.paid_by === me.id ? myAccent : partnerAccent;
              return (
                <div key={e.id} className="bg-white border border-border/50 rounded-2xl p-4 shadow-card flex items-center gap-3"
                  style={{ borderLeftColor: payerAccent.hex, borderLeftWidth: "3px" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {paidByMe ? myName : partnerName} paid £{amt.toFixed(2)} · your share £{myShare.toFixed(2)}
                    </p>
                  </div>
                  <div className={cn("text-sm font-semibold flex-shrink-0", paidByMe ? "text-sage" : "text-terracotta")}>
                    {paidByMe ? `+£${(amt * (1 - ratio)).toFixed(2)}` : `-£${(amt * ratio).toFixed(2)}`}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // ── Pot folders list ──
        <div className="space-y-2.5">
          {folders.map((folder) => {
            const folderPots = pots.filter((p) => p.folder_id === folder.id);
            const saved = folderPots.reduce((s, p) => s + parseFloat(p.his_amount ?? "0") + parseFloat(p.hers_amount ?? "0"), 0);
            return (
              <button key={folder.id} onClick={() => setActivePotFolder(folder)}
                className="w-full bg-white rounded-2xl shadow-sm overflow-hidden flex items-stretch text-left active:scale-[0.99] transition-transform">
                <div className="w-[76px] flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: potPanelColor(folder.sort_order) }}>
                  <span className="text-4xl leading-none">{folder.emoji}</span>
                </div>
                <div className="flex-1 min-w-0 px-4 py-4">
                  <p className="text-base font-semibold text-foreground leading-snug">{folder.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {folderPots.length === 0 ? "no pots yet" : `${folderPots.length} ${folderPots.length === 1 ? "pot" : "pots"} · £${saved.toFixed(0)} saved`}
                  </p>
                </div>
                <div className="flex items-center pr-3 gap-1 flex-shrink-0">
                  {!folder.is_default ? (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : <div className="w-7" />}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                </div>
              </button>
            );
          })}

          <button onClick={() => setShowFolder(true)}
            className="w-full rounded-2xl border border-dashed border-border/50 h-[66px] flex items-center justify-center gap-2 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/80 transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span className="text-sm font-medium">new folder</span>
          </button>
        </div>
      )}

      {renderSheets()}
    </div>
  );
}
