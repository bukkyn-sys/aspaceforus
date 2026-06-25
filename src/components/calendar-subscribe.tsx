"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Copy, Check, Loader2, RefreshCw } from "lucide-react";
import { getCalendarFeed, regenerateCalendarFeed } from "@/app/(app)/profile/actions";

// Lets a couple subscribe their phone's calendar (Apple/Google/Outlook) to a
// one-way feed of their us. events. webcal:// opens the subscribe dialog on
// Apple; the https link can be pasted into Google Calendar's "From URL".
// `compact` drops the outer card/heading when rendered inside a sheet that
// already provides that chrome.
export default function CalendarSubscribe({ compact = false }: { compact?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCalendarFeed().then((r) => { setToken(r.token ?? null); setLoading(false); });
  }, []);

  const host = typeof window !== "undefined" ? window.location.host : "aspaceforus.app";
  const httpsUrl = token ? `https://${host}/api/calendar/${token}` : "";
  const webcalUrl = token ? `webcal://${host}/api/calendar/${token}` : "";

  function copy() {
    if (!httpsUrl) return;
    navigator.clipboard.writeText(httpsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function regenerate() {
    if (!confirm("Make a new link? The old one will stop working in any calendars already subscribed.")) return;
    setBusy(true);
    const r = await regenerateCalendarFeed();
    if (r.token) setToken(r.token);
    setBusy(false);
  }

  const body = (
    <>
      {!compact && (
        <div className="flex items-center gap-2 mb-1">
          <CalendarPlus className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">add to your calendar</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        subscribe your phone&apos;s calendar to your us. events. it updates on its
        own — one-way, so nothing in us. changes.
      </p>

      {loading ? (
        <div className="h-10 rounded-xl bg-secondary/50 animate-pulse" />
      ) : !token ? (
        <p className="text-xs text-muted-foreground">couldn&apos;t load your calendar link — try again later.</p>
      ) : (
        <div className="space-y-2">
          <a
            href={webcalUrl}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-background text-sm font-medium active:scale-[0.99] transition-transform"
          >
            <CalendarPlus className="w-4 h-4" /> add to calendar
          </a>
          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium text-muted-foreground active:scale-[0.99] transition-transform"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "copied" : "copy link"}
            </button>
            <button
              onClick={regenerate}
              disabled={busy}
              className="h-10 px-3 inline-flex items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-medium text-muted-foreground active:scale-[0.99] transition-transform disabled:opacity-60"
              aria-label="make a new link"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
            on iPhone, &quot;add to calendar&quot; opens the subscribe screen. for Google
            Calendar, &quot;copy link&quot; then add it under Other calendars → From URL.
          </p>
        </div>
      )}
    </>
  );

  if (compact) return <div>{body}</div>;
  return <div className="card p-4 mt-2">{body}</div>;
}
