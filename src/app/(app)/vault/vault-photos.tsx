"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "@/contexts/couple-context";
import { useFabSetter } from "@/contexts/fab-context";
import { getCache, setCache } from "@/lib/data-cache";
import { track } from "@/lib/analytics";
import { toast } from "@/lib/toast";
import { validateImage } from "@/lib/validate-image";
import { SignedImg } from "@/components/signed-img";
import { useSignedUrl } from "@/lib/use-signed-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Trash2, Download, ChevronLeft, ChevronRight, Pencil, ImagePlus, Check } from "lucide-react";
import { addPhoto, updatePhotoCaption, deletePhoto } from "./photo-actions";

interface Photo {
  id: string;
  path: string;
  width: number;
  height: number;
  caption: string | null;
  created_by: string;
  created_at: string;
  local?: string; // object URL for optimistic tiles still uploading
}

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// A storage URL SignedImg can parse + sign (the bucket is private; the "public"
// path form is just what the signer matches on — it never loads unsigned).
function photoUrl(path: string): string {
  return `${SUPA}/storage/v1/object/public/photos/${path}`;
}

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

export default function VaultPhotos() {
  const { coupleId, me } = useCouple();
  const setAction = useFabSetter();
  const supabase = useRef(createClient()).current;

  const [photos, setPhotos] = useState<Photo[]>(() => getCache<Photo[]>(`vphotos:${coupleId}`) ?? []);
  const [loading, setLoading] = useState(() => getCache<Photo[]>(`vphotos:${coupleId}`) === undefined);
  const [rtick, setRtick] = useState(0);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Load
  useEffect(() => {
    supabase.from("vault_photos").select("id,path,width,height,caption,created_by,created_at")
      .eq("couple_id", coupleId).order("created_at", { ascending: false })
      .then(({ data }) => {
        const next = (data as Photo[]) ?? [];
        setPhotos(next); setLoading(false); setCache(`vphotos:${coupleId}`, next);
      });
  }, [coupleId, rtick, supabase]);

  // Realtime — partner uploads / deletes
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onChange = (p: any) => {
      if (p.eventType === "INSERT" && p.new?.created_by === me.id) return;
      setRtick((t) => t + 1);
    };
    const ch = supabase.channel(`vphoto-${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_photos", filter: `couple_id=eq.${coupleId}` }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [coupleId, me.id, supabase]);

  // FAB → open the picker
  useEffect(() => {
    setAction(() => fileRef.current?.click());
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
      let processed: { blob: Blob; width: number; height: number };
      try { processed = await processImage(file); }
      catch { processed = { blob: file, width: 0, height: 0 }; } // undecodable (e.g. HEIC on Chrome) — upload as-is
      const { blob, width, height } = processed;

      const tempId = crypto.randomUUID();
      const local = URL.createObjectURL(blob);
      const path = `${coupleId}/${crypto.randomUUID()}.jpg`;
      setPhotos((prev) => [{ id: tempId, path, width, height, caption: null, created_by: me.id, created_at: new Date().toISOString(), local }, ...prev]);

      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      setUploadCount((c) => c - 1);
      if (error) { toast("a photo failed to upload"); setPhotos((prev) => prev.filter((p) => p.id !== tempId)); continue; }
      track("photo_added");
      const realId = await addPhoto({ coupleId, path, width, height });
      setPhotos((prev) => prev.map((p) => p.id === tempId ? { ...p, id: realId ?? p.id, local: undefined } : p));
    }
  }

  function removePhoto(p: Photo) {
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    setLightboxId(null);
    deletePhoto(p.id, coupleId, p.path);
  }

  function saveCaption(p: Photo, caption: string) {
    setPhotos((prev) => prev.map((x) => x.id === p.id ? { ...x, caption: caption || null } : x));
    updatePhotoCaption(p.id, coupleId, caption);
  }

  // Greedy 2-column masonry — push each photo to the currently shorter column.
  const cols: Photo[][] = [[], []];
  const colH = [0, 0];
  for (const p of photos) {
    const ratio = (p.height || 1) / (p.width || 1);
    const i = colH[0] <= colH[1] ? 0 : 1;
    cols[i].push(p); colH[i] += ratio;
  }

  const lightboxIndex = lightboxId ? photos.findIndex((p) => p.id === lightboxId) : -1;
  const lightbox = lightboxIndex >= 0 ? photos[lightboxIndex] : null;

  return (
    <div className="px-3 pb-24 pt-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      {uploadCount > 0 && (
        <p className="text-xs text-muted-foreground/60 text-center mb-2">uploading {uploadCount} photo{uploadCount !== 1 ? "s" : ""}…</p>
      )}

      {loading && photos.length === 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-2xl bg-secondary/50 animate-pulse" style={{ aspectRatio: i % 2 ? "3/4" : "1/1" }} />)}
        </div>
      ) : photos.length === 0 ? (
        <button onClick={() => fileRef.current?.click()} className="w-full rounded-3xl border border-dashed border-border/60 p-10 text-center hover:border-border bg-secondary/40 transition-colors mt-2">
          <ImagePlus className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">no photos yet</p>
          <p className="text-xs text-muted-foreground/40 mt-0.5">tap to add some — a shared wall, just the two of you</p>
        </button>
      ) : (
        <div className="flex gap-2 items-start">
          {cols.map((col, ci) => (
            <div key={ci} className="flex-1 flex flex-col gap-2 min-w-0">
              {col.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setLightboxId(p.id)}
                  className="block w-full rounded-2xl overflow-hidden bg-secondary active:scale-[0.99] transition-transform"
                  style={{ aspectRatio: p.width && p.height ? `${p.width}/${p.height}` : "1/1" }}
                >
                  <SignedImg src={p.local ?? photoUrl(p.path)} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {mounted && lightbox && createPortal(
        <Lightbox
          photo={lightbox}
          src={lightbox.local ?? photoUrl(lightbox.path)}
          canEdit
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < photos.length - 1}
          onPrev={() => setLightboxId(photos[lightboxIndex - 1]?.id ?? null)}
          onNext={() => setLightboxId(photos[lightboxIndex + 1]?.id ?? null)}
          onClose={() => setLightboxId(null)}
          onDelete={() => removePhoto(lightbox)}
          onCaption={(c) => saveCaption(lightbox, c)}
        />,
        document.body
      )}
    </div>
  );
}

function Lightbox({
  photo, src, canEdit, hasPrev, hasNext, onPrev, onNext, onClose, onDelete, onCaption,
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
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(photo.caption ?? "");
  // Private bucket — sign the URL (blob: object URLs pass through unchanged).
  const signed = useSignedUrl(src);

  useEffect(() => { setConfirmDel(false); setEditing(false); setDraft(photo.caption ?? ""); }, [photo.id, photo.caption]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/92 flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="close">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <a href={signed ?? src} download target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="download">
            <Download className="w-4 h-4" />
          </a>
          {canEdit && (
            <button onClick={() => setConfirmDel(true)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white active:bg-white/20" aria-label="delete">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center px-2">
        {signed
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={signed} alt={photo.caption ?? ""} className="max-w-full max-h-full object-contain rounded-lg" />
          : <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" aria-label="loading" />}
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
