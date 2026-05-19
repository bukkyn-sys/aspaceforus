"use client";

import { useState, useTransition, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { getCache, setCache } from "@/lib/data-cache";
import { addVaultItem, updateVaultStage, updateVaultItem, deleteVaultItem, fetchOgPreview } from "./actions";
import { Plus, Trash2, X, Pencil, Link2 } from "lucide-react";
import { useRegisterFab } from "@/contexts/fab-context";
import { useNotifications } from "@/contexts/notification-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

type VaultType = "date_idea" | "wishlist";
type Owner = "shared" | "his" | "hers";
type Stage = "ideas" | "planned" | "completed";

interface VaultItem {
  id: string;
  type: VaultType;
  owner: Owner | null;
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

interface OgPreview { image: string | null; title: string | null; }

const stageLabel: Record<Stage, string> = { ideas: "idea", planned: "planned", completed: "done" };
const stageNext: Record<Stage, Stage> = { ideas: "planned", planned: "completed", completed: "ideas" };
const stageColor: Record<Stage, string> = {
  ideas: "bg-secondary text-muted-foreground",
  planned: "bg-blue-50 text-blue-600",
  completed: "bg-sage-light text-sage",
};

const PRICE_RANGES = ["£", "££", "£££"] as const;

const OWNER_FILTERS: { value: Owner | "all"; label: string }[] = [
  { value: "all", label: "all" },
  { value: "shared", label: "shared" },
  { value: "his", label: "his" },
  { value: "hers", label: "hers" },
];

export default function VaultClient() {
  const { coupleId, me, partner } = useCouple();
  const { markSeen, markActivity } = useNotifications();
  const [tab, setTab] = useState<VaultType>("date_idea");
  const [ownerFilter, setOwnerFilter] = useState<Owner | "all">("all");
  const [items, setItems] = useState<VaultItem[]>(() => getCache<VaultItem[]>(`vault:${coupleId}`) ?? []);
  const [loading, setLoading] = useState(() => getCache<VaultItem[]>(`vault:${coupleId}`) === undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  // Add form
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<Owner>("shared");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [priceRange, setPriceRange] = useState<string | null>(null);
  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);

  // Edit form
  const [editTitle, setEditTitle] = useState("");
  const [editOwner, setEditOwner] = useState<Owner>("shared");
  const [editUrl, setEditUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriceRange, setEditPriceRange] = useState<string | null>(null);
  const [editOgPreview, setEditOgPreview] = useState<OgPreview | null>(null);
  const [fetchingEditOg, setFetchingEditOg] = useState(false);

  const [, startTransition] = useTransition();

  useEffect(() => { markSeen("vault"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("vault_items")
      .select("id, type, owner, title, url, notes, stage, created_by, created_at, price_range, og_image, og_title")
      .eq("couple_id", coupleId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const result = (data as VaultItem[]) ?? [];
        setItems(result);
        setLoading(false);
        setCache(`vault:${coupleId}`, result);
      });
  }, [coupleId]);

  useRegisterFab(() => setShowAdd(true));

  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const filtered = items.filter((i) => {
    if (i.type !== tab) return false;
    if (ownerFilter !== "all" && i.owner !== ownerFilter) return false;
    return true;
  });

  function closeAdd() {
    setShowAdd(false);
    setTitle(""); setUrl(""); setNotes("");
    setPriceRange(null); setOgPreview(null);
  }

  async function handleUrlBlur(val: string) {
    if (!val.trim()) { setOgPreview(null); return; }
    setFetchingOg(true);
    const preview = await fetchOgPreview(val.trim());
    setOgPreview(preview);
    setFetchingOg(false);
  }

  async function handleEditUrlBlur(val: string) {
    if (!val.trim()) { setEditOgPreview(null); return; }
    setFetchingEditOg(true);
    const preview = await fetchOgPreview(val.trim());
    setEditOgPreview(preview);
    setFetchingEditOg(false);
  }

  function handleAdd() {
    if (!title.trim()) return;
    const optimistic: VaultItem = {
      id: crypto.randomUUID(),
      type: tab,
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
    startTransition(() => {
      addVaultItem({
        coupleId, userId: me.id, type: tab,
        title: optimistic.title, owner,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        priceRange: priceRange ?? undefined,
        ogImage: ogPreview?.image ?? undefined,
        ogTitle: ogPreview?.title ?? undefined,
      });
    });
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
    setItems((prev) => prev.map((i) =>
      i.id === editingItem.id
        ? {
            ...i,
            title: editTitle.trim(),
            owner: editOwner,
            url: editUrl.trim() || null,
            notes: editNotes.trim() || null,
            price_range: editPriceRange,
            og_image: editOgPreview?.image ?? null,
            og_title: editOgPreview?.title ?? null,
          }
        : i
    ));
    setEditingItem(null);
    startTransition(() => {
      updateVaultItem({
        id: editingItem.id, coupleId,
        title: editTitle.trim(),
        url: editUrl.trim() || undefined,
        notes: editNotes.trim() || undefined,
        owner: editOwner,
        priceRange: editPriceRange,
        ogImage: editOgPreview?.image ?? null,
        ogTitle: editOgPreview?.title ?? null,
      });
    });
  }

  function handleStage(item: VaultItem) {
    const next = stageNext[item.stage];
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, stage: next } : i));
    startTransition(() => { updateVaultStage(item.id, coupleId, next); });
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    startTransition(() => { deleteVaultItem(id, coupleId); });
  }

  const PriceChips = ({
    value, onChange
  }: { value: string | null; onChange: (v: string | null) => void }) => (
    <div className="flex gap-2">
      {PRICE_RANGES.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(value === p ? null : p)}
          className={cn(
            "px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors",
            value === p
              ? "bg-foreground text-background border-foreground"
              : "bg-white text-muted-foreground border-border/60 hover:border-foreground/30"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );

  const OgPreviewCard = ({ preview, loading }: { preview: OgPreview | null; loading: boolean }) => {
    if (loading) return (
      <div className="flex items-center gap-2 p-2 bg-secondary rounded-xl">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin flex-shrink-0" />
        <span className="text-xs text-muted-foreground">fetching preview…</span>
      </div>
    );
    if (!preview?.image && !preview?.title) return null;
    return (
      <div className="flex items-center gap-3 p-2.5 bg-secondary rounded-xl">
        {preview.image && (
          <img src={preview.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        )}
        {preview.title && (
          <p className="text-xs text-muted-foreground leading-tight line-clamp-2">{preview.title}</p>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 pt-10 pb-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-heading text-3xl text-foreground tracking-tight">vault.</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 rounded-xl bg-foreground text-background flex items-center justify-center shadow-sm active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">date ideas &amp; wishlists</p>

      {/* Type tabs */}
      <div className="flex bg-secondary rounded-2xl p-1 mb-3">
        {([["date_idea", "date ideas"], ["wishlist", "wishlist"]] as [VaultType, string][]).map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-xl transition-all",
              tab === t ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Owner filter chips */}
      <div className="flex gap-2 mb-5">
        {OWNER_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setOwnerFilter(value)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all",
              ownerFilter === value
                ? "text-white"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            )}
            style={ownerFilter === value ? { backgroundColor: myAccent.hex } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">nothing here yet</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            tap + to add your first {tab === "date_idea" ? "date idea" : "wishlist item"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const itemAccent = item.created_by === me.id ? myAccent : partnerAccent;
            return (
              <div key={item.id}
                className="bg-white border border-border/50 rounded-2xl p-4 shadow-card flex items-start gap-3"
                style={{ borderLeftColor: itemAccent.hex, borderLeftWidth: "3px" }}
              >
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-sm font-medium text-foreground truncate text-left w-full hover:text-foreground/70 transition-colors"
                  >
                    {item.title}
                  </button>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{item.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground capitalize">{item.owner ?? "shared"}</span>
                    {item.price_range && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
                        {item.price_range}
                      </span>
                    )}
                    {tab === "date_idea" && (
                      <button
                        onClick={() => handleStage(item)}
                        className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md", stageColor[item.stage])}
                        style={{ boxShadow: `0 0 0 1.5px ${myAccent.hex}50, 0 0 6px ${myAccent.hex}30` }}
                      >
                        {stageLabel[item.stage]}
                      </button>
                    )}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-blue-500 flex items-center gap-0.5"
                      >
                        <Link2 className="w-2.5 h-2.5" />
                        link
                      </a>
                    )}
                  </div>
                </div>
                {item.og_image && (
                  <img
                    src={item.og_image}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                  />
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

      {/* Add sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeAdd} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">
                add {tab === "date_idea" ? "date idea" : "wishlist item"}
              </p>
              <button onClick={closeAdd} className="text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
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
              <OgPreviewCard preview={ogPreview} loading={fetchingOg} />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="notes (optional)"
              className="w-full h-20 px-3 py-2.5 text-sm rounded-xl bg-white border border-border/60 resize-none outline-none placeholder:text-muted-foreground/50"
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">budget?</p>
              <PriceChips value={priceRange} onChange={setPriceRange} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">whose list?</p>
              <div className="flex gap-2">
                {(["shared", "his", "hers"] as Owner[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOwner(o)}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-xl border transition-colors",
                      owner === o ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground border-border/60"
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleAdd} disabled={!title.trim()} className="w-full h-11 rounded-xl">
              add
            </Button>
          </div>
        </div>
      )}

      {/* Edit sheet */}
      {editingItem && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingItem(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-3xl p-6 space-y-4"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">edit</p>
              <button onClick={() => setEditingItem(null)} className="text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
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
              <OgPreviewCard preview={editOgPreview} loading={fetchingEditOg} />
            </div>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="notes (optional)"
              className="w-full h-20 px-3 py-2.5 text-sm rounded-xl bg-white border border-border/60 resize-none outline-none placeholder:text-muted-foreground/50"
            />
            <div>
              <p className="text-xs text-muted-foreground mb-2">budget?</p>
              <PriceChips value={editPriceRange} onChange={setEditPriceRange} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">whose list?</p>
              <div className="flex gap-2">
                {(["shared", "his", "hers"] as Owner[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setEditOwner(o)}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-xl border transition-colors",
                      editOwner === o ? "bg-foreground text-background border-foreground" : "bg-white text-muted-foreground border-border/60"
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
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
