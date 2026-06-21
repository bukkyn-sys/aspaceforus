"use client";

import { useState, useEffect, useRef, type TouchEvent as RTouchEvent } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useFabSetter } from "@/contexts/fab-context";
import { useEntitlement } from "@/contexts/entitlement-context";
import { getCache, setCache } from "@/lib/data-cache";
import { track } from "@/lib/analytics";
import { toast, undoableDelete } from "@/lib/toast";
import { validateImage } from "@/lib/validate-image";
import { useSignedUrl } from "@/lib/use-signed-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet, Dialog } from "@/components/ui/sheet";
import { X, Trash2, Download, ChevronLeft, ChevronRight, Pencil, ImagePlus, Check, FolderInput, Plus, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { addPhoto, updatePhotoCaption, deletePhoto, setPhotoFavorite, createAlbum, renameAlbum, deleteAlbum, movePhotoToAlbum } from "./photo-actions";

interface Photo {
  id: string;
  path: string;
  width: number;
  height: number;
  caption: string | null;
  created_by: string;
  created_at: string;
  album_id: string | null;
  favorite: boolean;
  local?: string; // object URL for optimistic tiles still uploading
}
interface Album { id: string; name: string; created_at: string; }

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// A storage URL SignedImg can parse + sign (the bucket is private; the "public"
// path form is just what the signer matches on — it never loads unsigned).
function photoUrl(path: string): string {
  return `${SUPA}/storage/v1/object/public/photos/${path}`;
}

const SIGN_EXPIRY = 60 * 60 * 8; // 8h

// Decode → cap longest edge at 2048 → re-encode JPEG. Returns the downscaled blob
// and its final dimensions (used for masonry layout).
async function processImage(file: File, max = 2048): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode failed"));
      i.src = url;
    });
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const scale = Math.min(1, max / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw; canvas.height = th;
    canvas.getContext("2d")!.drawImage(img, 0, 0, tw, th);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
    return { blob, width: tw, height: th };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function VaultPhotos({ live = true }: { live?: boolean }) {
  const { coupleId, me } = useCouple();
  const setAction = useFabSetter();
  const { premium, openPaywall } = useEntitlement();
  const supabase = useRef(createClient()).current;

  const [photos, setPhotos] = useState<Photo[]>(() => getCache<Photo[]>(`vphotos:${coupleId}`) ?? []);
  const [loading, setLoading] = useState(() => getCache<Photo[]>(`vphotos:${coupleId}`) === undefined);
  const [rtick, setRtick] = useState(0);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<string | null>(null); // null = all
  const [favFilter, setFavFilter] = useState(false);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [editAlbumName, setEditAlbumName] = useState("");
  const [movingPhoto, setMovingPhoto] = useState<Photo | null>(null);

  // Thumbnails are signed in ONE batched request (not one per tile) — a wall of
  // per-image signs used to race/throttle and leave broken tiles until you opened
  // the lightbox. path → signed URL.
  const [signed, setSigned] = useState<Record<string, string>>({});
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  // Load (photos + albums); archived photos excluded everywhere.
  useEffect(() => {
    // Far panes keep their cached photos; fetch in the live window.
    if (!live) return;
    Promise.all([
      supabase.from("vault_photos").select("id,path,width,height,caption,created_by,created_at,album_id,favorite")
        .eq("couple_id", coupleId).is("archived_at", null).order("created_at", { ascending: false }),
      supabase.from("vault_albums").select("id,name,created_at").eq("couple_id", coupleId).order("created_at", { ascending: true }),
    ]).then(([{ data: ph, error: phErr }, { data: al }]) => {
      setLoading(false);
      // A query error (e.g. a column from a not-yet-run migration) must NOT wipe
      // already-loaded photos or the cache — that's what made photos "vanish".
      if (phErr) { console.error("vault photos load failed", phErr); return; }
      const next = (ph as Photo[]) ?? [];
      setPhotos(next); setAlbums((al as Album[]) ?? []); setCache(`vphotos:${coupleId}`, next);
    });
  }, [coupleId, rtick, supabase, live]);

  // Batch-sign any not-yet-signed photo paths (one request) for the wall.
  useEffect(() => {
    const fresh = photos.filter((p) => !p.local && !requested.current.has(p.path)).map((p) => p.path);
    if (fresh.length === 0) return;
    fresh.forEach((p) => requested.current.add(p));
    let alive = true;
    supabase.storage.from("photos").createSignedUrls(fresh, SIGN_EXPIRY).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { fresh.forEach((p) => requested.current.delete(p)); return; } // let a later pass retry
      setSigned((prev) => {
        const n = { ...prev };
        for (const d of data) { if (d.path && d.signedUrl) n[d.path] = d.signedUrl; }
        return n;
      });
    });
    return () => { alive = false; };
  }, [photos, supabase]);

  // A thumbnail that fails to load (e.g. a stale signed URL) re-signs itself once
  // or twice — a fresh token changes the src and forces a reload.
  const retries = useRef<Map<string, number>>(new Map());
  function reSign(path: string) {
    const n = (retries.current.get(path) ?? 0) + 1;
    if (n > 2) return;
    retries.current.set(path, n);
    supabase.storage.from("photos").createSignedUrls([path], SIGN_EXPIRY).then(({ data }) => {
      const u = data?.[0]?.signedUrl;
      if (u) setSigned((prev) => ({ ...prev, [path]: u }));
    });
  }

  // Realtime — partner uploads / deletes (live window only)
  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChange = (p: any) => {
      if (p.eventType === "INSERT" && p.new?.created_by === me.id) return;
      setRtick((t) => t + 1);
    };
    const ch = supabase.channel(`vphoto-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_photos", filter: `couple_id=eq.${coupleId}` }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [coupleId, me.id, supabase, live]);

  // Free plan: 25 photos. Refs keep the FAB action reading live values.
  const PHOTO_LIMIT = 25;
  const photosRef = useRef(photos); photosRef.current = photos;
  const premiumRef = useRef(premium); premiumRef.current = premium;
  function requestAddPhoto() {
    if (!premiumRef.current && photosRef.current.length >= PHOTO_LIMIT) { openPaywall("photos"); return; }
    fileRef.current?.click();
  }

  // Albums are a premium feature (free = the shared wall only).
  function requestNewAlbum() {
    if (!premium) { openPaywall("albums"); return; }
    setMovingPhoto(null); setAlbumName(""); setShowNewAlbum(true);
  }

  // FAB → open the picker (gated by the free photo limit)
  useEffect(() => {
    setAction(() => requestAddPhoto());
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadCount((c) => c + list.length);
    for (const file of list) {
      const err = validateImage(file);
      if (err) { toast(err); setUploadCount((c) => c - 1); continue; }
      let blob: Blob, width: number, height: number, ext = "jpg", contentType = "image/jpeg";
      try {
        const p = await processImage(file);
        blob = p.blob; width = p.width; height = p.height;
      } catch {
        // Undecodable here (e.g. HEIC/ProRAW on a browser that can't decode it) —
        // upload the original as-is so it isn't lost; keep its real type/extension.
        blob = file; width = 0; height = 0;
        ext = (file.name.includes(".") ? file.name.split(".").pop() : "") || (file.type.split("/")[1]) || "jpg";
        contentType = file.type || "application/octet-stream";
      }

      const tempId = crypto.randomUUID();
      const local = URL.createObjectURL(blob);
      const path = `${coupleId}/${crypto.randomUUID()}.${ext.toLowerCase()}`;
      setPhotos((prev) => [{ id: tempId, path, width, height, caption: null, created_by: me.id, created_at: new Date().toISOString(), album_id: activeAlbum, favorite: false, local }, ...prev]);

      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType, upsert: false });
      setUploadCount((c) => c - 1);
      if (error) { toast("a photo failed to upload"); setPhotos((prev) => prev.filter((p) => p.id !== tempId)); continue; }
      track("photo_added");
      const realId = await addPhoto({ coupleId, path, width, height, albumId: activeAlbum });
      setPhotos((prev) => prev.map((p) => p.id === tempId ? { ...p, id: realId ?? p.id, local: undefined } : p));
    }
  }

  function removePhoto(p: Photo) {
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    setLightboxId(null);
    undoableDelete({
      message: "photo deleted",
      commit: () => deletePhoto(p.id, coupleId, p.path),
      restore: () => setPhotos((prev) => [p, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at))),
    });
  }

  function saveCaption(p: Photo, caption: string) {
    setPhotos((prev) => prev.map((x) => x.id === p.id ? { ...x, caption: caption || null } : x));
    updatePhotoCaption(p.id, coupleId, caption);
  }

  function handleCreateAlbum() {
    const name = albumName.trim();
    if (!name) return;
    const tempId = crypto.randomUUID();
    setAlbums((prev) => [...prev, { id: tempId, name, created_at: new Date().toISOString() }]);
    track("album_created");
    createAlbum(coupleId, name).then((realId) => { if (realId) setAlbums((prev) => prev.map((a) => a.id === tempId ? { ...a, id: realId } : a)); });
    setShowNewAlbum(false); setAlbumName("");
  }

  function handleRenameAlbum() {
    if (!editAlbum) return;
    const name = editAlbumName.trim();
    if (!name) return;
    const id = editAlbum.id;
    setAlbums((prev) => prev.map((a) => a.id === id ? { ...a, name } : a));
    setEditAlbum(null);
    renameAlbum(id, coupleId, name);
  }

  function handleDeleteAlbum(a: Album) {
    setAlbums((prev) => prev.filter((x) => x.id !== a.id));
    setPhotos((prev) => prev.map((p) => p.album_id === a.id ? { ...p, album_id: null } : p));
    if (activeAlbum === a.id) setActiveAlbum(null);
    setEditAlbum(null);
    deleteAlbum(a.id, coupleId);
  }

  function handleMove(photo: Photo, albumId: string | null) {
    setPhotos((prev) => prev.map((p) => p.id === photo.id ? { ...p, album_id: albumId } : p));
    setMovingPhoto(null);
    movePhotoToAlbum(photo.id, coupleId, albumId);
  }

  function handleFavorite(photo: Photo) {
    const fav = !photo.favorite;
    setPhotos((prev) => prev.map((p) => p.id === photo.id ? { ...p, favorite: fav } : p));
    setPhotoFavorite(photo.id, coupleId, fav);
  }

  const shown = favFilter ? photos.filter((p) => p.favorite)
    : activeAlbum ? photos.filter((p) => p.album_id === activeAlbum) : photos;

  // Greedy 2-column masonry — push each photo to the currently shorter column.
  const cols: Photo[][] = [[], []];
  const colH = [0, 0];
  for (const p of shown) {
    const ratio = (p.height || 1) / (p.width || 1);
    const i = colH[0] <= colH[1] ? 0 : 1;
    cols[i].push(p); colH[i] += ratio;
  }

  const lightboxIndex = lightboxId ? shown.findIndex((p) => p.id === lightboxId) : -1;
  const lightbox = lightboxIndex >= 0 ? shown[lightboxIndex] : null;

  return (
    <div className="px-3 pb-24 pt-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      {uploadCount > 0 && (
        <p className="text-xs text-muted-foreground/60 text-center mb-2">uploading {uploadCount} photo{uploadCount !== 1 ? "s" : ""}…</p>
      )}

      {/* Album chips — all · {albums} · + (long-press an album to delete) */}
      {(albums.length > 0 || photos.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-2.5 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          <AlbumChip active={activeAlbum === null && !favFilter} label="all" onClick={() => { setActiveAlbum(null); setFavFilter(false); }} />
          <button
            onClick={() => { setFavFilter(true); setActiveAlbum(null); }}
            aria-label="favourites"
            className={cn("flex-shrink-0 inline-flex items-center justify-center w-9 h-8 rounded-full transition-colors", favFilter ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground")}
          >
            <Heart className={cn("w-3.5 h-3.5", favFilter && "fill-current")} />
          </button>
          {albums.map((a) => (
            <AlbumChip key={a.id} active={activeAlbum === a.id && !favFilter} label={a.name} onClick={() => { setActiveAlbum(a.id); setFavFilter(false); }} />
          ))}
          <button onClick={requestNewAlbum} className="flex-shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-3.5 h-3.5" /> album
          </button>
          {activeAlbum && !favFilter && (
            <button
              onClick={() => { const a = albums.find((x) => x.id === activeAlbum); if (a) { setEditAlbum(a); setEditAlbumName(a.name); } }}
              className="flex-shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> edit
            </button>
          )}
        </div>
      )}

      {loading && photos.length === 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-2xl bg-secondary/50 animate-pulse" style={{ aspectRatio: i % 2 ? "3/4" : "1/1" }} />)}
        </div>
      ) : shown.length === 0 ? (
        favFilter ? (
          <div className="w-full rounded-3xl border border-dashed border-border/60 p-10 text-center bg-secondary/40 mt-2">
            <Heart className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">no favourites yet</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">open a photo and tap the heart to love it</p>
          </div>
        ) : (
          <button onClick={requestAddPhoto} className="w-full rounded-3xl border border-dashed border-border/60 p-10 text-center hover:border-border bg-secondary/40 transition-colors mt-2">
            <ImagePlus className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{activeAlbum ? "no photos in this album yet" : "no photos yet"}</p>
            <p className="text-xs text-muted-foreground/40 mt-0.5">{activeAlbum ? "upload here, or move photos in from the wall" : "tap to add some — a shared wall, just the two of you"}</p>
          </button>
        )
      ) : (
        <div className="flex gap-2 items-start">
          {cols.map((col, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-2 min-w-0">
              {col.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setLightboxId(p.id)}
                  className="block w-full rounded-2xl overflow-hidden bg-secondary active:scale-[0.99] transition-transform relative"
                  style={{ aspectRatio: p.width && p.height ? `${p.width}/${p.height}` : "1/1" }}
                >
                  {(() => {
                    const url = p.local ?? signed[p.path];
                    // eslint-disable-next-line @next/next/no-img-element
                    return url ? <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" onError={() => { if (!p.local) reSign(p.path); }} /> : null;
                  })()}
                  {p.favorite && <Heart className="absolute top-1.5 right-1.5 w-4 h-4 text-white fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {mounted && lightbox && createPortal(
        <Lightbox
          photo={lightbox}
          src={lightbox.local ?? signed[lightbox.path] ?? photoUrl(lightbox.path)}
          canEdit
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < shown.length - 1}
          onPrev={() => setLightboxId(shown[lightboxIndex - 1]?.id ?? null)}
          onNext={() => setLightboxId(shown[lightboxIndex + 1]?.id ?? null)}
          onClose={() => setLightboxId(null)}
          onDelete={() => removePhoto(lightbox)}
          onCaption={(c) => saveCaption(lightbox, c)}
          onMove={() => { const p = lightbox; setLightboxId(null); setMovingPhoto(p); }}
          onFavorite={() => handleFavorite(lightbox)}
        />,
        document.body
      )}

      {/* New album */}
      <BottomSheet open={showNewAlbum} onClose={() => setShowNewAlbum(false)} title="new album"
        footer={<Button onClick={handleCreateAlbum} disabled={!albumName.trim()} className="w-full h-11 rounded-xl">create</Button>}>
        <Input value={albumName} onChange={(e) => setAlbumName(e.target.value)} placeholder="album name" className="h-11 rounded-xl bg-card border-border/60" />
      </BottomSheet>

      {/* Move photo to album */}
      <BottomSheet open={movingPhoto !== null} onClose={() => setMovingPhoto(null)} title="move to album">
        {movingPhoto && (
          <div className="space-y-1.5">
            <MoveOption label="unsorted (wall)" active={movingPhoto.album_id === null} onClick={() => handleMove(movingPhoto, null)} />
            {albums.map((a) => (
              <MoveOption key={a.id} label={a.name} active={movingPhoto.album_id === a.id} onClick={() => handleMove(movingPhoto, a.id)} />
            ))}
            <button onClick={requestNewAlbum} className="w-full text-left px-4 h-11 rounded-xl bg-secondary/60 text-sm text-muted-foreground flex items-center gap-2">
              <Plus className="w-4 h-4" /> new album
            </button>
          </div>
        )}
      </BottomSheet>

      {/* Edit album — rename or delete */}
      <Dialog open={editAlbum !== null} onClose={() => setEditAlbum(null)}>
        {editAlbum && (
          <>
            <p className="text-sm font-medium text-foreground text-center mb-3">edit album</p>
            <Input
              value={editAlbumName}
              onChange={(e) => setEditAlbumName(e.target.value)}
              placeholder="album name"
              className="h-11 rounded-xl bg-card border-border/60 mb-3"
            />
            <div className="space-y-2">
              <Button onClick={handleRenameAlbum} disabled={!editAlbumName.trim()} className="w-full h-11 rounded-xl">save</Button>
              <Button variant="outline" onClick={() => handleDeleteAlbum(editAlbum)} className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light">
                <Trash2 className="w-4 h-4 mr-1.5" /> delete album
              </Button>
              <button onClick={() => setEditAlbum(null)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
            </div>
            <p className="text-[11px] text-muted-foreground/50 text-center mt-3">deleting keeps the photos — they go back to the wall.</p>
          </>
        )}
      </Dialog>
    </div>
  );
}

function MoveOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-4 h-11 rounded-xl flex items-center justify-between ${active ? "bg-foreground text-background" : "bg-secondary/60 text-foreground"}`}>
      <span className="text-sm truncate">{label}</span>
      {active && <Check className="w-4 h-4 flex-shrink-0" />}
    </button>
  );
}

function AlbumChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3.5 h-8 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}

function Lightbox({
  photo, src, canEdit, hasPrev, hasNext, onPrev, onNext, onClose, onDelete, onCaption, onMove, onFavorite,
}: {
  photo: Photo;
  src: string;
  canEdit: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDelete: () => void;
  onCaption: (c: string) => void;
  onMove: () => void;
  onFavorite: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(photo.caption ?? "");
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);
  // Private bucket — sign the URL (blob: object URLs pass through unchanged).
  const signed = useSignedUrl(src);

  // ── Gestures: 1-finger swipe → prev/next; 2-finger pinch → zoom (springs back) ──
  const imgRef = useRef<HTMLImageElement>(null);
  const g = useRef({ mode: "none" as "none" | "swipe" | "pinch", x0: 0, y0: 0, d0: 1, dx: 0, dy: 0, axis: "" as "" | "x" | "y", moved: false });

  function applyImg(transform: string, opacity: string, animate: boolean) {
    const el = imgRef.current; if (!el) return;
    el.style.transition = animate ? "transform .25s ease, opacity .25s ease" : "none";
    el.style.transform = transform;
    el.style.opacity = opacity;
  }
  function resetImg() {
    const el = imgRef.current; if (!el) return;
    el.style.transformOrigin = "center";
    applyImg("translateX(0px)", "1", false);
  }
  function touchDist(t: RTouchEvent<HTMLDivElement>["touches"]) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
  }
  function onTouchStart(e: RTouchEvent<HTMLDivElement>) {
    g.current.moved = false;
    if (e.touches.length >= 2) {
      g.current.mode = "pinch"; g.current.d0 = touchDist(e.touches);
      // Zoom from the point between the fingers, not the centre.
      const el = imgRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        el.style.transformOrigin = `${(mx / r.width) * 100}% ${(my / r.height) * 100}%`;
      }
    } else {
      g.current.mode = "swipe"; g.current.x0 = e.touches[0].clientX; g.current.y0 = e.touches[0].clientY;
      g.current.dx = 0; g.current.dy = 0; g.current.axis = "";
    }
  }
  function onTouchMove(e: RTouchEvent<HTMLDivElement>) {
    if (g.current.mode === "pinch" && e.touches.length >= 2) {
      const s = Math.max(1, Math.min(4, touchDist(e.touches) / g.current.d0));
      g.current.moved = true;
      applyImg(`scale(${s})`, "1", false);
    } else if (g.current.mode === "swipe" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.current.x0;
      const dy = e.touches[0].clientY - g.current.y0;
      g.current.dx = dx; g.current.dy = dy;
      if (!g.current.axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        g.current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        g.current.moved = true;
      }
      if (g.current.axis === "x") applyImg(`translateX(${dx}px)`, "1", false);
      else if (g.current.axis === "y") {
        const fade = Math.max(0.4, 1 - Math.abs(dy) / 500);
        applyImg(`translateY(${dy}px) scale(${Math.max(0.85, fade)})`, String(fade), false);
      }
    }
  }
  function onTouchEnd(e: RTouchEvent<HTMLDivElement>) {
    if (e.touches.length > 0) return; // wait until all fingers are up
    if (g.current.mode === "pinch") {
      applyImg("scale(1)", "1", true); // spring back to normal size
    } else if (g.current.mode === "swipe") {
      if (g.current.axis === "y") {
        if (g.current.dy > 110) { onClose(); return; } // swipe down to exit
        applyImg("translateY(0px) scale(1)", "1", true);
      } else {
        const w = imgRef.current?.clientWidth ?? window.innerWidth;
        const threshold = Math.min(90, w * 0.28);
        const dx = g.current.dx;
        if (dx <= -threshold && hasNext) { resetImg(); onNext(); }
        else if (dx >= threshold && hasPrev) { resetImg(); onPrev(); }
        else { applyImg("translateX(0px)", "1", true); }
      }
    }
    g.current.mode = "none";
  }

  useEffect(() => { setConfirmDel(false); setEditing(false); setDraft(photo.caption ?? ""); resetImg(); }, [photo.id, photo.caption]);

  // Double-tap the photo to favourite it (Instagram-style) — only ever loves,
  // never un-loves, and always shows the heart burst.
  function onImageTap() {
    if (g.current.moved) { g.current.moved = false; return; } // ignore the tap that ends a swipe/pinch
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (!photo.favorite) onFavorite();
      setBurst(true);
      window.setTimeout(() => setBurst(false), 750);
    } else {
      lastTap.current = now;
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/92 flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="close">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onFavorite} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="favourite">
            <Heart className={cn("w-4 h-4", photo.favorite && "fill-white")} />
          </button>
          <a href={signed ?? src} download target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="download">
            <Download className="w-4 h-4" />
          </a>
          {canEdit && (
            <button onClick={onMove} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="move to album">
              <FolderInput className="w-4 h-4" />
            </button>
          )}
          {canEdit && (
            <button onClick={() => setConfirmDel(true)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="delete">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 min-h-0 relative flex items-center justify-center px-2"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {signed
          // eslint-disable-next-line @next/next/no-img-element
          ? <img ref={imgRef} src={signed} alt={photo.caption ?? ""} onClick={onImageTap} className="max-w-full max-h-full object-contain rounded-lg cursor-pointer select-none" draggable={false} />
          : <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" aria-label="loading" />}
        <AnimatePresence>
          {burst && (
            <motion.div
              key="burst"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 1] }}
              exit={{ scale: 1.3, opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="w-24 h-24 text-white fill-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" />
            </motion.div>
          )}
        </AnimatePresence>
        {hasPrev && (
          <button onClick={onPrev} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="previous">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {hasNext && (
          <button onClick={onNext} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="next">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Caption */}
      <div className="px-5 py-4 flex-shrink-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="add a caption" autoFocus className="h-10 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40" />
            <Button onClick={() => { onCaption(draft.trim()); setEditing(false); }} className="h-10 px-3 rounded-xl"><Check className="w-4 h-4" /></Button>
          </div>
        ) : (
          <button onClick={() => canEdit && setEditing(true)} className="flex items-center gap-2 text-left w-full">
            <p className={photo.caption ? "text-sm text-white/90" : "text-sm text-white/40"}>{photo.caption || (canEdit ? "add a caption" : "")}</p>
            {canEdit && <Pencil className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />}
          </button>
        )}
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center px-8" onClick={() => setConfirmDel(false)}>
          <div className="bg-card rounded-2xl p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-foreground text-center mb-4">delete this photo?</p>
            <div className="space-y-2">
              <Button variant="outline" onClick={onDelete} className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light">
                <Trash2 className="w-4 h-4 mr-1.5" /> delete
              </Button>
              <button onClick={() => setConfirmDel(false)} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
