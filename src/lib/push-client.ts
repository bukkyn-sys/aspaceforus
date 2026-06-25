import { savePushSubscription } from "@/app/(app)/push-actions";

// Request notification permission and register a push subscription, saving it
// server-side. Shared by Settings and the first-action nudge so the flow lives
// in one place. Returns the resulting permission (or "unsupported").
export async function enablePush(
  userId: string,
  coupleId: string,
): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });
    await savePushSubscription(userId, coupleId, sub.toJSON());
  }
  return permission;
}
