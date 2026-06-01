"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useFabSetter } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import {
  addVaultFolder,
  deleteVaultFolder,
  addVaultItem,
  updateVaultStage,
  updateVaultItem,
  deleteVaultItem,
  fetchOgPreview,
} from "./actions";
import { Plus, X, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown, Camera, Pencil, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { OwnerAvatars } from "@/components/ui/owner-avatars";
import { useOwnerIdentity, cardOmbre } from "@/lib/owner-identity";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

function proxyImg(src: string | null | undefined): string | null {
  if (!src) return null;
  // Supabase storage URLs are already on our domain — serve directly.
  if (src.includes("supabase.co") || src.startsWith("/")) return src;
  return `/api/img-proxy?src=${encodeURIComponent(src)}`;
}

type VaultKind = "date_idea" | "wishlist" | "general";
type Stage = "ideas" | "planned" | "completed";
type SortBy = "newest" | "oldest" | "az" | "za" | "price_low" | "price_high";

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
  item_emoji: string | null;
}

interface OgPreview { image: string | null; title: string | null }

const CURRENCIES = ["£", "$", "€"] as const;
type Currency = typeof CURRENCIES[number];

const STAGE_LABEL: Record<Stage, string> = { ideas: "idea", planned: "planned", completed: "done" };
const STAGE_NEXT: Record<Stage, Stage> = { ideas: "planned", planned: "completed", completed: "ideas" };
const STAGE_COLOR: Record<Stage, string> = {
  ideas: "bg-secondary text-muted-foreground",
  planned: "bg-blue-50 text-blue-600",
  completed: "bg-sage-light text-sage",
};

// Custom palette for folder emoji panels — avoids Tailwind purge issues with dynamic classes
const GENERAL_PANEL_COLORS = ["#EDE9F5", "#F5EDD3", "#E3EEF8", "#FDEDF5"];

function folderPanelColor(folder: VaultFolder): string {
  if (folder.kind === "date_idea") return "#F5E8E2";
  if (folder.kind === "wishlist")  return "#E8F0EA";
  return GENERAL_PANEL_COLORS[folder.sort_order % GENERAL_PANEL_COLORS.length];
}

const SORT_LABELS: Record<SortBy, string> = {
  newest: "newest",
  oldest: "oldest",
  az: "a – z",
  za: "z – a",
  price_low: "price: low → high",
  price_high: "price: high → low",
};
const SORT_CYCLE: SortBy[] = ["newest", "oldest", "az", "za", "price_low", "price_high"];

// Numeric value of a stored price string ("£45", "free", "$10") for sorting.
function priceValue(p: string | null): number {
  if (!p) return Number.POSITIVE_INFINITY; // unpriced items sink to the bottom
  if (p === "free") return 0;
  const n = parseFloat(p.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

const EMOJI_OPTIONS = ["📁", "🌹", "🎁", "⭐", "🎯", "✈️", "🍽️", "🎨", "🏡", "🎪", "💫", "📌"];
const ITEM_EMOJIS   = ["🌹", "🎁", "⭐", "🎯", "✈️", "🍽️", "🎨", "🏡", "🎭", "🎬", "🛍️", "📚", "🎵", "🍷", "💎", "🎮", "🌿", "🧁"];

// ── Module-level sub-components (must NOT be inside VaultClient — inline
//    definitions get a new reference every render, causing unmount/remount) ──

function PriceInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const currency: Currency = (CURRENCIES.find((c) => value?.startsWith(c)) ?? "£") as Currency;
  const amount = value === "free" ? ""
    : value ? (CURRENCIES.some((c) => value.startsWith(c)) ? value.slice(currency.length) : value)
    : "";

  function update(c: Currency, a: string) { onChange(a.trim() ? c + a.trim() : null); }

  return (
    <div className="space-y-2.5">
      {/* Currency selector */}
      <div className="flex gap-2">
        {CURRENCIES.map((c) => (
          <button key={c} type="button"
            onClick={() => update(c, amount)}
            className={cn(
              "w-11 h-11 rounded-xl text-sm font-bold border transition-colors",
              value !== "free" && currency === c
                ? "bg-foreground text-background border-foreground"
                : "bg-white text-muted-foreground border-border/60"
            )}
          >{c}</button>
        ))}
        <button type="button"
          onClick={() => onChange(value === "free" ? null : "free")}
          className={cn(
            "flex-1 h-11 rounded-xl text-sm font-medium border transition-colors",
            value === "free"
              ? "bg-foreground text-background border-foreground"
              : "bg-white text-muted-foreground border-border/60"
          )}
        >free</button>
      </div>

      {/* Amount input — hidden when free */}
      {value !== "free" && (
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground/60 pointer-events-none select-none">
            {currency}
          </span>
          <Input
            value={amount}
            onChange={(e) => update(currency, e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="h-11 rounded-xl bg-white border-border/60 pl-8"
          />
        </div>
      )}
    </div>
  );
}

function VisualPicker({
  emoji, onEmojiChange, image, imageTitle, scraping, uploading, error, onPickFile, onRemoveImage,
}: {
  emoji: string | null;
  onEmojiChange: (v: string | null) => void;
  image: string | null;
  imageTitle: string | null;
  scraping?: boolean;
  uploading?: boolean;
  error?: string | null;
  onPickFile: (file: File) => void;
  onRemoveImage: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      {/* Photo — auto from a link's preview, or upload your own */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }}
        />
        {scraping || uploading ? (
          <div className="flex items-center gap-2 p-2.5 bg-secondary rounded-xl">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{uploading ? "uploading…" : "fetching preview…"}</span>
          </div>
        ) : image ? (
          <div className="flex items-center gap-3 p-2.5 bg-secondary rounded-xl">
            <img src={proxyImg(image) ?? ""} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {imageTitle && <p className="text-xs text-muted-foreground leading-tight line-clamp-2">{imageTitle}</p>}
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-medium text-foreground mt-0.5">change photo</button>
            </div>
            <button type="button" onClick={onRemoveImage} className="w-7 h-7 rounded-full bg-white/70 flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border/60 text-muted-foreground hover:border-border/90 transition-colors">
            <Camera className="w-4 h-4" />
            <span className="text-sm">{error ? "try another photo" : "add a photo"}</span>
          </button>
        )}
        {error && <p className="text-[11px] text-terracotta mt-1.5 px-0.5">{error}</p>}
      </div>

      {/* Emoji — shown on the card tile */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">emoji</p>
        <div className="grid grid-cols-6 gap-2">
          {ITEM_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onEmojiChange(emoji === e ? null : e)}
              className={cn(
                "aspect-square rounded-xl text-xl flex items-center justify-center transition-all",
                emoji === e
                  ? "bg-foreground/10 ring-2 ring-foreground/40"
                  : "bg-secondary hover:bg-secondary/70"
              )}
            >{e}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OwnerButtons({
  value, onChange, meId, myName, partner, partnerName,
}: {
  value: string;
  onChange: (v: string) => void;
  meId: string;
  myName: string;
  partner: { id: string } | null;
  partnerName: string;
}) {
  return (
    <div className="flex gap-2">
      {[
        { value: "shared", label: "shared" },
        { value: meId,     label: myName },
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
}

export default function VaultClient() {
  const { coupleId, me, partner, myName, partnerName } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const setAction = useFabSetter();
  const resolveOwner = useOwnerIdentity();
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [showSort, setShowSort] = useState(false);

  // Sheets
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [actionItem, setActionItem] = useState<VaultItem | null>(null);

  // New folder form
  const [folderName, setFolderName] = useState("");
  const [folderEmoji, setFolderEmoji] = useState("📁");

  // Add item form
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("shared");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [priceRange, setPriceRange] = useState<string | null>(null);
  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  // Edit item form
  const [editTitle, setEditTitle] = useState("");
  const [editOwner, setEditOwner] = useState("shared");
  const [editUrl, setEditUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriceRange, setEditPriceRange] = useState<string | null>(null);
  const [editOgPreview, setEditOgPreview] = useState<OgPreview | null>(null);
  const [fetchingEditOg, setFetchingEditOg] = useState(false);
  const [editUploadingImg, setEditUploadingImg] = useState(false);
  const [editEmoji, setEditEmoji] = useState<string | null>(null);
  const [editStage, setEditStage] = useState<Stage>("ideas");

  const [, startTransition] = useTransition();

  const myAccent = getAccent(me.accent_color);


  // FAB wires to the correct action per view
  useEffect(() => {
    setAction(view === "folders" ? () => setShowNewFolder(true) : () => setShowAdd(true));
    return () => setAction(null);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

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
        await addVaultFolder({ coupleId, userId: me.id, name: "date ideas", emoji: "🌹", kind: "date_idea", isDefault: true });
        await addVaultFolder({ coupleId, userId: me.id, name: "wishlist",  emoji: "🎁", kind: "wishlist",  isDefault: true });
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

      const withCounts = folderList.map((f) => ({ ...f, item_count: counts[f.id] ?? 0 }));
      setFolders(withCounts);

      // Restore the open folder from the URL so a refresh stays in the folder.
      const folderParam = searchParams.get("folder");
      if (folderParam) {
        const f = withCounts.find((x) => x.id === folderParam);
        if (f) { setActiveFolder(f); setView("items"); }
      }
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
      .select("id, folder_id, owner, title, url, notes, stage, created_by, created_at, price_range, og_image, og_title, item_emoji")
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
    router.replace(`/vault?folder=${folder.id}`, { scroll: false });
  }

  function goBack() {
    setView("folders");
    setActiveFolder(null);
    setItems([]);
    router.replace("/vault", { scroll: false });
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
      switch (sortBy) {
        case "newest":     return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":     return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "az":         return a.title.localeCompare(b.title);
        case "za":         return b.title.localeCompare(a.title);
        case "price_low":  return priceValue(a.price_range) - priceValue(b.price_range);
        case "price_high": return priceValue(b.price_range) - priceValue(a.price_range);
        default:           return 0;
      }
    });



  // ── Folder actions ──────────────────────────────────────────────────────────

  function handleAddFolder() {
    if (!folderName.trim()) return;
    const optimistic: VaultFolder = {
      id: crypto.randomUUID(),
      name: folderName.trim(),
      emoji: folderEmoji,
      kind: "general" as VaultKind,
      is_default: false,
      sort_order: folders.length,
      created_by: me.id,
      created_at: new Date().toISOString(),
      item_count: 0,
    };
    setFolders((prev) => [...prev, optimistic]);
    setShowNewFolder(false);
    setFolderName(""); setFolderEmoji("📁");
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
    setTitle(""); setUrl(""); setNotes(""); setPriceRange(null);
    setOgPreview(null); setEmoji(null); setUploadingImg(false); setImgError(null);
  }

  async function uploadVaultImage(file: File): Promise<{ url: string | null; error: string | null }> {
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${coupleId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("vault")
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (error) return { url: null, error: error.message };
    return { url: supabase.storage.from("vault").getPublicUrl(path).data.publicUrl, error: null };
  }

  async function handlePickFile(file: File, isEdit: boolean) {
    setImgError(null);
    if (isEdit) setEditUploadingImg(true); else setUploadingImg(true);
    const { url, error } = await uploadVaultImage(file);
    if (url) {
      if (isEdit) setEditOgPreview({ image: url, title: null });
      else setOgPreview({ image: url, title: null });
    } else {
      setImgError(error ?? "upload failed — please try again");
    }
    if (isEdit) setEditUploadingImg(false); else setUploadingImg(false);
  }

  // Auto-fill the photo from a link's preview only when one isn't already set.
  async function handleUrlBlur(val: string) {
    if (!val.trim() || ogPreview) return;
    setFetchingOg(true);
    const preview = await fetchOgPreview(val.trim());
    if (preview?.image) setOgPreview(preview);
    setFetchingOg(false);
  }

  async function handleEditUrlBlur(val: string) {
    if (!val.trim() || editOgPreview) return;
    setFetchingEditOg(true);
    const preview = await fetchOgPreview(val.trim());
    if (preview?.image) setEditOgPreview(preview);
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
      item_emoji: emoji,
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
        itemEmoji: emoji ?? undefined,
      })
    );
    closeAdd();
  }

  function openEdit(item: VaultItem) {
    setActionItem(null);
    setEditingItem(item);
    setEditTitle(item.title);
    setEditOwner(item.owner ?? "shared");
    setEditUrl(item.url ?? "");
    setEditNotes(item.notes ?? "");
    setEditPriceRange(item.price_range ?? null);
    setEditOgPreview(item.og_image ? { image: item.og_image, title: item.og_title } : null);
    setEditEmoji(item.item_emoji);
    setEditStage(item.stage);
    setEditUploadingImg(false);
  }

  function handleEdit() {
    if (!editingItem || !editTitle.trim()) return;
    const stageChanged = editStage !== editingItem.stage;
    setItems((prev) =>
      prev.map((i) =>
        i.id === editingItem.id
          ? { ...i, title: editTitle.trim(), owner: editOwner, url: editUrl.trim() || null,
              notes: editNotes.trim() || null, price_range: editPriceRange,
              og_image: editOgPreview?.image ?? null, og_title: editOgPreview?.title ?? null,
              item_emoji: editEmoji, stage: editStage }
          : i
      )
    );
    const id = editingItem.id;
    setEditingItem(null);
    startTransition(() => {
      updateVaultItem({
        id, coupleId, userId: me.id,
        title: editTitle.trim(),
        url: editUrl.trim() || undefined,
        notes: editNotes.trim() || undefined,
        owner: editOwner,
        priceRange: editPriceRange,
        ogImage: editOgPreview?.image ?? null,
        ogTitle: editOgPreview?.title ?? null,
        itemEmoji: editEmoji,
      });
      if (stageChanged) updateVaultStage(id, coupleId, me.id, editStage);
    });
  }

  function handleStage(item: VaultItem) {
    if (item.created_by !== me.id) return; // only the creator can advance stage
    const next = STAGE_NEXT[item.stage];
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, stage: next } : i));
    startTransition(() => updateVaultStage(item.id, coupleId, me.id, next));
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setActionItem(null);
    startTransition(() => deleteVaultItem(id, coupleId, me.id));
  }

  // Tap a card: the creator gets the edit/remove prompt; anyone else can only
  // open the link (they can't edit a partner's entry).
  function handleCardTap(item: VaultItem) {
    if (item.created_by === me.id) { setActionItem(item); return; }
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  }

  // ── FOLDERS VIEW ─────────────────────────────────────────────────────────────

  if (view === "folders") {
    return (
      <div className="px-4 pt-10 pb-24 max-w-lg mx-auto">
        <div className="mb-8">
          <h1 className="font-heading text-3xl text-foreground tracking-tight">vault.</h1>
          <p className="text-sm text-muted-foreground mt-0.5">your shared space</p>
        </div>

        {foldersLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
        ) : (
          <div className="space-y-2.5">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => openFolder(folder)}
                className="w-full card-row overflow-hidden flex items-center text-left active:scale-[0.99] transition-transform"
                style={{ background: `linear-gradient(100deg, ${folderPanelColor(folder)} 0%, #ffffff 46%)` }}
              >
                {/* Emoji tile */}
                <div className="flex-shrink-0 pl-3.5 py-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] leading-none"
                    style={{ backgroundColor: folderPanelColor(folder) }}
                  >
                    {folder.emoji}
                  </div>
                </div>

                {/* Name + count */}
                <div className="flex-1 min-w-0 px-3 py-3">
                  <p className="text-sm font-semibold text-foreground leading-snug">{folder.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {folder.item_count === 0
                      ? "nothing added yet"
                      : `${folder.item_count} ${folder.item_count === 1 ? "item" : "items"}`}
                  </p>
                </div>

                {/* Delete + chevron — fixed width so chevron is always aligned */}
                <div className="flex items-center pr-3.5 gap-1 flex-shrink-0">
                  {!folder.is_default ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="w-7" />
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                </div>
              </button>
            ))}

            {/* New folder */}
            <button
              onClick={() => setShowNewFolder(true)}
              className="w-full rounded-2xl border border-dashed border-border/50 h-[66px] flex items-center justify-center gap-2 text-muted-foreground/60 hover:text-muted-foreground hover:border-border/80 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span className="text-sm font-medium">new folder</span>
            </button>
          </div>
        )}

        {/* New folder sheet */}
        <BottomSheet
          open={showNewFolder}
          onClose={() => setShowNewFolder(false)}
          title="new folder"
          footer={
            <Button onClick={handleAddFolder} disabled={!folderName.trim()} className="w-full h-11 rounded-xl">
              create folder
            </Button>
          }
        >
          <div>
            <p className="text-xs text-muted-foreground mb-2">emoji</p>
            <div className="grid grid-cols-6 gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setFolderEmoji(e)}
                  className={cn(
                    "aspect-square rounded-xl text-xl flex items-center justify-center transition-all",
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
        </BottomSheet>
      </div>
    );
  }

  // ── ITEMS VIEW ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-10 pb-5">
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={goBack}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors -ml-1 flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-foreground flex-1 truncate">
            <span className="mr-1.5">{activeFolder?.emoji}</span>{activeFolder?.name}
          </h1>
        </div>

        {/* Filter + sort on one row */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {ownerOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setOwnerFilter(value)}
                className={cn(
                  "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                  ownerFilter === value
                    ? "text-white shadow-sm"
                    : "bg-white border border-border/50 text-muted-foreground hover:border-border/80"
                )}
                style={ownerFilter === value ? { backgroundColor: myAccent.hex } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Sort dropdown */}
          <div className="relative flex-shrink-0">
            {showSort && (
              <div className="fixed inset-0 z-10" onClick={() => setShowSort(false)} />
            )}
            <button
              onClick={() => setShowSort((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-white border border-border/50 px-3 py-1.5 rounded-full hover:border-border/80 transition-colors whitespace-nowrap"
            >
              <ArrowUpDown className="w-3 h-3" />
              {SORT_LABELS[sortBy]}
              <ChevronDown className={cn("w-3 h-3 transition-transform", showSort && "rotate-180")} />
            </button>
            {showSort && (
              <div className="absolute right-0 top-full mt-1.5 bg-white rounded-2xl shadow-lg border border-border/30 py-1.5 z-20 min-w-[110px]">
                {SORT_CYCLE.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSortBy(s); setShowSort(false); }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors",
                      sortBy === s ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="px-4 pb-24">
        {itemsLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3 text-2xl opacity-60">{activeFolder?.emoji}</div>
            <p className="text-muted-foreground text-sm">nothing here yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              tap + to add your first{" "}
              {activeFolder?.kind === "date_idea" ? "date idea" : activeFolder?.kind === "wishlist" ? "wishlist item" : "item"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const o = resolveOwner(item.owner);
              const isMine = item.created_by === me.id;
              return (
                <div key={item.id}
                  onClick={() => handleCardTap(item)}
                  className="card-row overflow-hidden flex items-center cursor-pointer active:scale-[0.99] transition-transform"
                  style={{ background: cardOmbre(o) }}
                >
                  {/* Emoji tile (kept even when a photo is set) */}
                  {item.item_emoji && (
                    <div className="flex-shrink-0 pl-3.5 py-3">
                      <div
                        className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center text-[22px] leading-none"
                        style={{ background: o.shared ? undefined : o.people[0].light }}
                      >
                        {item.item_emoji}
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div className={cn("flex-1 min-w-0 py-3", item.item_emoji ? "px-3" : "px-4")}>
                    <p className="text-sm font-semibold text-foreground leading-snug truncate">{item.title}</p>
                    {item.notes && <p className="text-xs text-muted-foreground/50 line-clamp-1 mt-0.5">{item.notes}</p>}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <OwnerAvatars people={o.people} />
                      {item.price_range && (
                        <>
                          <span className="text-muted-foreground/25 text-[10px]">·</span>
                          <span className="text-xs font-semibold text-foreground/70">{item.price_range}</span>
                        </>
                      )}
                      {/* Only surface a stage once it's past the default "idea" */}
                      {activeFolder?.kind === "date_idea" && item.stage !== "ideas" && (
                        <>
                          <span className="text-muted-foreground/25 text-[10px]">·</span>
                          {isMine ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStage(item); }}
                              className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors", STAGE_COLOR[item.stage])}
                            >
                              {STAGE_LABEL[item.stage]}
                            </button>
                          ) : (
                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", STAGE_COLOR[item.stage])}>
                              {STAGE_LABEL[item.stage]}
                            </span>
                          )}
                        </>
                      )}
                      {item.url && (
                        <>
                          <span className="text-muted-foreground/25 text-[10px]">·</span>
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
                          >link</a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail (smaller — sits alongside the emoji) */}
                  {item.og_image && (
                    <img src={proxyImg(item.og_image) ?? ""} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 mr-2.5" />
                  )}

                  {isMine ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground/25 flex-shrink-0 mr-3.5" />
                  ) : item.url ? (
                    <Link2 className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 mr-3.5" />
                  ) : (
                    <div className="mr-3.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add item sheet */}
      <BottomSheet
        open={showAdd}
        onClose={closeAdd}
        title={`add to ${activeFolder?.name ?? ""}`}
        footer={<Button onClick={handleAdd} disabled={!title.trim()} className="w-full h-11 rounded-xl">add</Button>}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="title"
          className="h-11 rounded-xl bg-white border-border/60"
          autoFocus
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={(e) => handleUrlBlur(e.target.value)}
          placeholder="url (optional)"
          className="h-11 rounded-xl bg-white border-border/60"
          type="url"
        />
        <div>
          <p className="text-xs text-muted-foreground mb-2">photo &amp; emoji <span className="opacity-50">(optional)</span></p>
          <VisualPicker
            emoji={emoji}
            onEmojiChange={setEmoji}
            image={ogPreview?.image ?? null}
            imageTitle={ogPreview?.title ?? null}
            scraping={fetchingOg}
            uploading={uploadingImg}
            error={imgError}
            onPickFile={(f) => handlePickFile(f, false)}
            onRemoveImage={() => setOgPreview(null)}
          />
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
          <OwnerButtons value={owner} onChange={setOwner} meId={me.id} myName={myName} partner={partner} partnerName={partnerName} />
        </div>
      </BottomSheet>

      {/* Edit item sheet */}
      <BottomSheet
        open={editingItem !== null}
        onClose={() => setEditingItem(null)}
        title="edit"
        footer={
          <div className="flex gap-3">
            <Button
              onClick={() => { if (editingItem) { handleDelete(editingItem.id); setEditingItem(null); } }}
              variant="outline"
              className="flex-1 h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
            >
              delete
            </Button>
            <Button onClick={handleEdit} disabled={!editTitle.trim()} className="flex-1 h-11 rounded-xl">
              save
            </Button>
          </div>
        }
      >
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="title"
          className="h-11 rounded-xl bg-white border-border/60"
          autoFocus
        />
        <Input
          value={editUrl}
          onChange={(e) => setEditUrl(e.target.value)}
          onBlur={(e) => handleEditUrlBlur(e.target.value)}
          placeholder="url (optional)"
          className="h-11 rounded-xl bg-white border-border/60"
          type="url"
        />
        <div>
          <p className="text-xs text-muted-foreground mb-2">photo &amp; emoji <span className="opacity-50">(optional)</span></p>
          <VisualPicker
            emoji={editEmoji}
            onEmojiChange={setEditEmoji}
            image={editOgPreview?.image ?? null}
            imageTitle={editOgPreview?.title ?? null}
            scraping={fetchingEditOg}
            uploading={editUploadingImg}
            error={imgError}
            onPickFile={(f) => handlePickFile(f, true)}
            onRemoveImage={() => setEditOgPreview(null)}
          />
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
          <OwnerButtons value={editOwner} onChange={setEditOwner} meId={me.id} myName={myName} partner={partner} partnerName={partnerName} />
        </div>
        {activeFolder?.kind === "date_idea" && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">stage</p>
            <div className="flex gap-2">
              {(["ideas", "planned", "completed"] as Stage[]).map((s) => (
                <button key={s} onClick={() => setEditStage(s)}
                  className={cn(
                    "flex-1 py-2 text-sm rounded-xl border transition-colors",
                    editStage === s ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground border-border/60"
                  )}
                >{STAGE_LABEL[s]}</button>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Action prompt — creator only (edit / remove) */}
      <Dialog open={actionItem !== null} onClose={() => setActionItem(null)}>
        {actionItem && (
          <>
            <p className="font-semibold text-foreground text-center truncate">{actionItem.title}</p>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-5">what would you like to do?</p>
            <div className="space-y-2">
              <Button onClick={() => openEdit(actionItem)} className="w-full h-11 rounded-xl">
                <Pencil className="w-4 h-4 mr-1.5" /> edit
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDelete(actionItem.id)}
                className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> remove from list
              </Button>
              <button onClick={() => setActionItem(null)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
