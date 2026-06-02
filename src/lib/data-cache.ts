const TTL = 10 * 60 * 1000; // 10 minutes

// L1: in-memory (fast, cleared on hard reload)
const mem = new Map<string, { data: unknown; at: number }>();

function ssGet<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(`uc:${key}`);
    if (!raw) return undefined;
    const { data, at } = JSON.parse(raw) as { data: T; at: number };
    if (Date.now() - at > TTL) { sessionStorage.removeItem(`uc:${key}`); return undefined; }
    return data;
  } catch { return undefined; }
}

function ssSet<T>(key: string, data: T): void {
  try { sessionStorage.setItem(`uc:${key}`, JSON.stringify({ data, at: Date.now() })); }
  catch { /* quota exceeded — silent */ }
}

export function getCache<T>(key: string): T | undefined {
  const m = mem.get(key);
  if (m && Date.now() - m.at <= TTL) return m.data as T;
  const s = ssGet<T>(key);
  if (s !== undefined) { mem.set(key, { data: s, at: Date.now() }); return s; }
  return undefined;
}

export function setCache<T>(key: string, data: T): void {
  mem.set(key, { data, at: Date.now() });
  ssSet(key, data);
}
