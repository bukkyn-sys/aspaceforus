"use client";

import { useEffect, useRef } from "react";
import { savePushSubscription } from "@/app/(app)/push-actions";

interface Props {
  userId: string;
  coupleId: string;
}

export default function PushSubscribe({ userId, coupleId }: Props) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission === "denied") return;

    async function sync() {
      const reg = await navigator.serviceWorker.ready;
      // Only sync an existing subscription — never auto-request permission
      const existing = await reg.pushManager.getSubscription();
      if (existing) await savePushSubscription(userId, coupleId, existing.toJSON());
    }

    sync().catch(() => {});
  }, [userId, coupleId]);

  return null;
}
