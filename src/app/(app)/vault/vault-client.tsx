"use client";

import { useState, useTransition, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { useScrollLock } from "@/lib/use-scroll-lock";
import {
  addVaultFolder,
  deleteVaultFolder,
  addVaultItem,
  updateVaultStage,
  updateVaultItem,
  deleteVaultItem,
  fetchOgPreview,
} from "./actions";
import { Plus, Trash2, X, Pencil, Link2, ChevronLeft, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

type VaultKind = "date_idea" | "wishlist" | "general";
type Stage = "ideas" | "planned" | "completed";
type SortBy = "newest" | "oldest" | "az" | "price";

interface VaultFolder {
  id: string;
  name: string;
  emoji: string;
  kind: VaultKind;
  is_default: boolean;
  sort_order: number;
  created_by: string;
  created_at: string;
  item_count: number;
}

interface VaultItem {
  id: string;
  folder_id: string;
  owner: string | null;
  title: string;
  url: string | null;
  notes: string | null;
  stage: Stage;
  created_by: string;
  created_at: string;
  price_range: string | null;
  og_image: string | null;
  og_title: string | null;
}

interface OgPreview { image: string | null; title: string | null }

const PRICE_RANGES = ["£", "££", "£££"] as const;

const STAGE_LABEL: Record<Stage, string> = { ideas: "idea", planned: "planned", completed: "done" };
const STAGE_NEXT: Record<Stage, Stage> = { ideas: "planned", planned: "completed", completed: "ideas" };
const STAGE_COLOR: Record<Stage, string> = {
  ideas: "bg-secondary text-muted-foreground",
  planned: "bg-blue-50 text-blue-600",
  completed: "bg-sage-light text-sage",
};

const FOLDER_BG: Record<VaultKind, string> = {
  date_idea: "bg-terracotta-light",
  wishlist: "bg-sage-light",
  general: "bg-secondary",
};

const SORT_LABELS: Record<SortBy, string> = {
  newest: "newest",
  oldest: "oldest",
  az: "a – z",
  price: "price",
};
const SORT_CYCLE: SortBy[] = ["newest", "oldest", "az", "price"];

const EMOJI_OPTIONS = ["📁", "🌹", "🎁", "⭐", "🎯", "✈️", "🍽️", "🎨", "🏡", "🎪", "💫", "📌"];

export default function VaultClient() {
  const { coupleId, me, partner, myName, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const { setAction } = useFab();

  // Navigation
  const [view, setView] = useState<"folders" | "items">("folders");
  const [activeFolder, setActiveFolder] = useState<VaultFolder | null>(null);

  // Data
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Filter / sort
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  // Sheets
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  // New folder form
  const [folderName, setFolderName] = useState("");
  const [folderEmoji, setFolderEmoji] = useState("📁");
  const [folderKind, setFolderKind] = useState<VaultKind>("general");

  // Add item form
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("shared");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [priceRange, setPriceRange] = useState<string | null>(null);
  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);

  // Edit item form
  const [editTitle, setEditTitle] = useState("");
  const [editOwner, setEditOwner] = useState("shared");
  const [editUrl, setEditUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriceRange, setEditPriceRange] = useState<string | null>(null);
  const [editOgPreview, setEditOgPreview] = useState<OgPreview | null>(null);
  const [fetchingEditOg, setFetchingEditOg] = useState(false);

  const [, startTransition] = useTransition();

  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  useScrollLock(showNewFolder || showAdd || editingItem !== null);

  // FAB wires to the correct action per view
  useEffect(() => {
    setAction(view === "folders" ? () => setShowNewFolder(true) : () => setShowAdd(true));
    return () => setAction(null);
  }, [view, setAction]);

  useEffect(() => { markSeen("vault"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load folders + item counts
  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const [{ data: foldersRaw }, { data: countRaw }] = await Promise.all([
        supabase
          .from("vault_folders")
          .select("id, name, emoji, kind, is_default, sort_order, created_by, created_at")
          .eq("couple_id", coupleId)
          .order("sort_order")
          .order("created_at"),
        supabase
          .from("vault_items")
          .select("folder_id")
          .eq("couple_id", coupleId),
      ]);

      let folderList = (foldersRaw ?? []) as Omit<VaultFolder, "item_count">[];

      // Seed defaults for new couples
      if (folderList.length === 0) {
        await addVaultFolder({ coupleId, userId: me.id, name: "Date Ideas", emoji: "🌹", kind: "date_idea", isDefault: true });
        await addVaultFolder({ coupleId, userId: me.id, name: "Wishlist",   emoji: "🎁", kind: "wishlist",  isDefault: true });
        const { data: refetched } = await supabase
          .from("vault_folders")
          .select("id, name, emoji, kind, is_default, sort_order, created_by, created_at")
          .eq("couple_id", coupleId)
          .order("sort_order");
        folderList = (refetched ?? []) as Omit<VaultFolder, "item_count">[];
      }

      const counts = (countRaw ?? []).reduce<Record<string, number>>((acc, i) => {
        if (i.folder_id) acc[i.folder_id] = (acc[i.folder_id] ?? 0) + 1;
        return acc;
      }, {});

      setFolders(folderList.map((f) => ({ ...f, item_count: counts[f.id] ?? 0 })));
      setFoldersLoading(false);
    };
    load();
  }, [coupleId, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load items when folder is opened
  useEffect(() => {
    if (!activeFolder) return;
    setItemsLoading(true);
    const supabase = createClient();
    supabase
      .from("vault_items")
      .select("id, folder_id, owner, title, url, notes, stage, created_by, created_at, price_range, og_image, og_title")
      .eq("couple_id", coupleId)
      .eq("folder_id", activeFolder.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems((data as VaultItem[]) ?? []);
        setItemsLoading(false);
      });
  }, [activeFolder, coupleId]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  function openFolder(folder: VaultFolder) {
    setActiveFolder(folder);
    setOwnerFilter("all");
    setSortBy("newest");
    setView("items");
  }

  function goBack() {
    setView("folders");
    setActiveFolder(null);
    setItems([]);
    // Refresh counts
    createClient()
      .from("vault_items")
      .select("folder_id")
      .eq("couple_id", coupleId)
      .then(({ data }) => {
        const counts = (data ?? []).reduce<Record<string, number>>((acc, i) => {
          if (i.folder_id) acc[i.folder_id] = (acc[i.folder_id] ?? 0) + 1;
          return acc;
        }, {});
        setFolders((prev) => prev.map((f) => ({ ...f, item_count: counts[f.id] ?? 0 })));
      });
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const ownerOptions = [
    { value: "all",    label: "all" },
    { value: "shared", label: "shared" },
    { value: me.id,    label: myName },
    ...(partner ? [{ value: partner.id, label: partnerName }] : []),
  ];

  const filteredItems = items
    .filter((i) => ownerFilter === "all" || i.owner === ownerFilter)
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "az")     return a.title.localeCompare(b.title);
      if (sortBy === "price") {
        const order: Record<string, number> = { "£": 1, "££": 2, "£££": 3 };
        return (order[a.price_range ?? ""] ?? 4) - (order[b.price_range ?? ""] ?? 4);
      }
      return 0;
    });

  function cycleSort() {
    setSortBy((prev) => SORT_CYCLE[(SORT_CYCLE.indexOf(prev) + 1) % SORT_CYCLE.length]);
  }

  function resolveOwnerName(o: string | null) {
    if (!o || o === "shared")                  return "shared";
    if (o === me.id)                           return myName;
    if (partner && o === partner.id)           return partnerName;
    return o; // legacy 'his'/'hers' fallback
  }

  // ── Folder actions ──────────────────────────────────────────────────────────

  function handleAddFolder() {
    if (!folderName.trim()) return;
    const optimistic: VaultFolder = {
      id: crypto.randomUUID(),
      name: folderName.trim(),
      emoji: folderEmoji,
      kind: folderKind,
      is_default: false,
      sort_order: folders.length,
      created_by: me.id,
      created_at: new Date().toISOString(),
      item_count: 0,
    };
    setFolders((prev) => [...prev, optimistic]);
    setShowNewFolder(false);
    setFolderName(""); setFolderEmoji("📁"); setFolderKind("general");
    startTransition(() => {
      addVaultFolder({ coupleId, userId: me.id, name: optimistic.name, emoji: optimistic.emoji, kind: optimistic.kind });
    });
  }

  function handleDeleteFolder(folder: VaultFolder) {
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    startTransition(() => deleteVaultFolder(folder.id, coupleId));
  }

  // ── Item actions ─────────────────────────────────────────────────────────────

  function closeAdd() {
    setShowAdd(false);
    setTitle(""); setUrl(""); setNotes(""); setPriceRange(null); setOgPreview(null);
  }

  async function handleUrlBlur(val: string) {
    if (!val.trim()) { setOgPreview(null); return; }
    setFetchingOg(true);
    setOgPreview(await fetchOgPreview(val.trim()));
    setFetchingOg(false);
  }

  async function handleEditUrlBlur(val: string) {
    if (!val.trim()) { setEditOgPreview(null); return; }
    setFetchingEditOg(true);
    setEditOgPreview(await fetchOgPreview(val.trim()));
    setFetchingEditOg(false);
  }

  function handleAdd() {
    if (!title.trim() || !activeFolder) return;
    const optimistic: VaultItem = {
      id: crypto.randomUUID(),
      folder_id: activeFolder.id,
      owner,
      title: title.trim(),
      url: url.trim() || null,
      notes: notes.trim() || null,
      stage: "ideas",
      created_by: me.id,
      created_at: new Date().toISOString(),
      price_range: priceRange,
      og_image: ogPreview?.image ?? null,
      og_title: ogPreview?.title ?? null,
    };
    setItems((prev) => [optimistic, ...prev]);
    markActivity("vault");
    startTransition(() =>
      addVaultItem({
        coupleId, userId: me.id,
        folderId: activeFolder.id, folderKind: activeFolder.kind,
        title: optimistic.title, owner,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        priceRange: priceRange ?? undefined,
        ogImage: ogPreview?.image ?? undefined,
        ogTitle: ogPreview?.title ?? undefined,
      })
    );
    closeAdd();
  }

  function openEdit(item: VaultItem) {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditOwner(item.owner ?? "shared");
    setEditUrl(item.url ?? "");
    setEditNotes(item.notes ?? "");
    setEditPriceRange(item.price_range ?? null);
    setEditOgPreview(item.og_image ? { image: item.og_image, title: item.og_title } : null);
  }

  function handleEdit() {
    if (!editingItem || !editTitle.trim()) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === editingItem.id
          ? { ...i, title: editTitle.trim(), owner: editOwner, url: editUrl.trim() || null,
              notes: editNotes.trim() || null, price_range: editPriceRange,
              og_image: editOgPreview?.image ?? null, og_title: editOgPreview?.title ?? null }
          : i
      )
    );
    setEditingItem(null);
    startTransition(() =>
      updateVaultItem({
        id: editingItem.id, coupleId,
        title: editTitle.trim(),
        url: editUrl.trim() || undefined,
        notes: editNotes.trim() || undefined,
        owner: editOwner,
        priceRange: editPriceRange,
        ogImage: editOgPreview?.image ?? null,
        ogTitle: editOgPreview?.title ?? null,
      })
    );
  }

  function handleStage(item: VaultItem) {
    const next = STAGE_NEXT[item.stage];
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, stage: next } : i));
    startTransition(() => updateVaultStage(item.id, coupleId, next));
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(() => deleteVaultItem(id, coupleId));
  }

  // ── Shared sub-components ────────────────────────────────────────────────────

  const PriceInput = ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <div className="space-y-2">
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="e.g. £45 or free"
        className="h-11 rounded-xl bg-white border-border/60"
      />
      <div className="flex gap-2">
        {PRICE_RANGES.map((p) => (
          <button key={p} type="button" onClick={() => onChange(value === p ? null : p)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors",
              value === p
                ? "bg-foreground text-background border-foreground"
                : "bg-white text-muted-foreground border-border/60 hover:border-foreground/30"
            )}
          >{p}</button>
        ))}
      </div>
    </div>
  );

  const OgCard = ({ preview, loading }: { preview: OgPreview | null; loading: boolean }) => {
    if (loading) return (
      <div className="flex items-center gap-2 p-2 bg-secondary rounded-xl mt-2">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin flex-shrink-0" />
        <span className="text-xs text-muted-foreground">fetching preview…</span>
      </div>
    );
    if (!preview?.image && !preview?.title) return null;
    return (
      <div className="flex items-center gap-3 p-2.5 bg-secondary rounded-xl mt-2">
        {preview.image && <img src={preview.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
        {preview.title && <p className="text-xs text-muted-foreground leading-tight line-clamp-2">{preview.title}</p>}
      </div>
    );
  };

  const OwnerButtons = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div className="flex gap-2">
      {[
        { value: "shared", label: "shared" },
        { value: me.id,    label: myName },
        ...(partner ? [{ value: partner.id, label: partnerName }] : []),
      ].map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 py-2 text-sm rounded-xl border transition-colors capitalize",
            value === o.value
              ? "bg-foreground text-background border-foreground"
              : "bg-white text-muted-foreground border-border/60"
          )}
        >{o.label}</button>
      ))}
    </div>
  );

  // ── FOLDERS VIEW ─────────────────────────────────────────────────────────────

  if (view === "folders") {
    return (
      <div className="px-4 pt-10 pb-24 max-w-lg mx-auto">
        <h1 className="font-heading text-3xl text-foreground tracking-tight mb-1">vault.</h1>
        <p className="text-sm text-muted-foreground mb-8">your shared space</p>

        {foldersLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => openFolder(folder)}
                  className={cn(
                    "rounded-3xl h-36 p-4 text-left flex flex-col justify-between",
                    "border border-white/60 shadow-sm transition-all active:scale-95",
                    FOLDER_BG[folder.kind]
                  )}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-3xl leading-none">{folder.emoji}</span>
                    {!folder.is_default && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-terracotta hover:bg-white/50 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="font-heading text-base text-foreground leading-tight">{folder.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {folder.item_count} {folder.item_count === 1 ? "item" : "items"}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowNewFolder(true)}
              className="w-full rounded-3xl border-2 border-dashed border-border/40 h-14 flex items-center justify-center gap-2 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/60 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span className="text-sm">new folder</span>
            </button>
          </>
        )}

        {/* New folder sheet */}
        {showNewFolder && (
          <div className="fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowNewFolder(false)} />
            <div
              className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-5"
              style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">new folder</p>
                <button onClick={() => setShowNewFolder(false)} className="text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">emoji</p>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setFolderEmoji(e)}
                      className={cn(
                        "w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all",
                        folderEmoji === e
                          ? "bg-foreground/10 ring-2 ring-foreground/40"
                          : "bg-secondary hover:bg-secondary/70"
                      )}
                    >{e}</button>
                  ))}
                </div>
              </div>

              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="folder name"
                className="h-11 rounded-xl bg-white border-border/60"
                autoFocus
              />

              <div>
                <p className="text-xs text-muted-foreground mb-2">type</p>
                <div className="flex gap-2">
                  {([
                    { value: "date_idea" as VaultKind, label: "dates" },
                    { value: "wishlist"  as VaultKind, label: "wishlist" },
                    { value: "general"   as VaultKind, label: "general" },
                  ]).map((k) => (
                    <button
                      key={k.value}
                      onClick={() => setFolderKind(k.value)}
                      className={cn(
                        "flex-1 py-2 text-sm rounded-xl border transition-colors",
                        folderKind === k.value
                          ? "bg-foreground text-background border-foreground"
                          : "bg-white text-muted-foreground border-border/60"
                      )}
                    >{k.label}</button>
                  ))}
                </div>
              </div>

              <Button onClick={handleAddFolder} disabled={!folderName.trim()} className="w-full h-11 rounded-xl">
                create folder
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── ITEMS VIEW ───────────────────────────────────────────────────────────────

  return (
    <div className="px-4 pt-10 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={goBack}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1 flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-heading text-2xl text-foreground tracking-tight flex-1 truncate">
          {activeFolder?.emoji} {activeFolder?.name}
        </h1>
        <button
          onClick={cycleSort}
          className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-full hover:text-foreground transition-colors flex-shrink-0"
        >
          <ArrowUpDown className="w-3 h-3" />
          {SORT_LABELS[sortBy]}
        </button>
      </div>

      {/* Owner filter */}
      <div className="flex gap-2 mb-5">
        {ownerOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setOwnerFilter(value)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all",
              ownerFilter === value ? "text-white" : "bg-secondary text-muted-foreground"
            )}
            style={ownerFilter === value ? { backgroundColor: myAccent.hex } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {itemsLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">nothing here yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            tap + to add your first{" "}
            {activeFolder?.kind === "date_idea" ? "date idea" : activeFolder?.kind === "wishlist" ? "wishlist item" : "item"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const itemAccent = item.created_by === me.id ? myAccent : partnerAccent;
            return (
              <div
                key={item.id}
                className="bg-white border border-border/40 rounded-2xl p-4 shadow-sm flex items-start gap-3"
                style={{ borderLeftColor: itemAccent.hex, borderLeftWidth: "3px" }}
              >
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-sm font-medium text-foreground text-left w-full hover:text-foreground/70 transition-colors"
                  >
                    {item.title}
                  </button>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{item.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {resolveOwnerName(item.owner)}
                    </span>
                    {item.price_range && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
                        {item.price_range}
                      </span>
                    )}
                    {activeFolder?.kind === "date_idea" && (
                      <button
                        onClick={() => handleStage(item)}
                        className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-colors", STAGE_COLOR[item.stage])}
                      >
                        {STAGE_LABEL[item.stage]}
                      </button>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link2 className="w-2.5 h-2.5" />
                        link
                      </a>
                    )}
                  </div>
                </div>
                {item.og_image && (
                  <img src={item.og_image} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                )}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add item sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={closeAdd} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">add to {activeFolder?.name}</p>
              <button onClick={closeAdd} className="text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="title"
              className="h-11 rounded-xl bg-white border-border/60"
              autoFocus
            />
            <div>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={(e) => handleUrlBlur(e.target.value)}
                placeholder="url (optional)"
                className="h-11 rounded-xl bg-white border-border/60"
                type="url"
              />
              <OgCard preview={ogPreview} loading={fetchingOg} />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="notes (optional)"
              className="w-full h-20 px-3 py-2.5 text-sm rounded-xl bg-white border border-border/60 resize-none outline-none placeholder:text-muted-foreground/50"
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">budget?</p>
              <PriceInput value={priceRange} onChange={setPriceRange} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">for?</p>
              <OwnerButtons value={owner} onChange={setOwner} />
            </div>
            <Button onClick={handleAdd} disabled={!title.trim()} className="w-full h-11 rounded-xl">add</Button>
          </div>
        </div>
      )}

      {/* Edit item sheet */}
      {editingItem && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingItem(null)} />
          <div
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">edit</p>
              <button onClick={() => setEditingItem(null)} className="text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="title"
              className="h-11 rounded-xl bg-white border-border/60"
              autoFocus
            />
            <div>
              <Input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                onBlur={(e) => handleEditUrlBlur(e.target.value)}
                placeholder="url (optional)"
                className="h-11 rounded-xl bg-white border-border/60"
                type="url"
              />
              <OgCard preview={editOgPreview} loading={fetchingEditOg} />
            </div>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="notes (optional)"
              className="w-full h-20 px-3 py-2.5 text-sm rounded-xl bg-white border border-border/60 resize-none outline-none placeholder:text-muted-foreground/50"
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">budget?</p>
              <PriceInput value={editPriceRange} onChange={setEditPriceRange} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">for?</p>
              <OwnerButtons value={editOwner} onChange={setEditOwner} />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => { handleDelete(editingItem.id); setEditingItem(null); }}
                variant="outline"
                className="flex-1 h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
              >
                delete
              </Button>
              <Button onClick={handleEdit} disabled={!editTitle.trim()} className="flex-1 h-11 rounded-xl">
                save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
