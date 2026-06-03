// Tiny global toast: dispatch an event from anywhere, the <Toaster> in the
// layout renders it. Avoids threading a context through every component.
export function toast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:toast", { detail: message }));
  }
}
