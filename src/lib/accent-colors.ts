export const ACCENT_COLORS = [
  { name: "sage",       hex: "#7C9E87", light: "#E8F0EA" },
  { name: "terracotta", hex: "#C4704F", light: "#F5E8E2" },
  { name: "sky",        hex: "#5B9BD5", light: "#E3EEF8" },
  { name: "amber",      hex: "#D4A427", light: "#F5EDD3" },
  { name: "lavender",   hex: "#8B7BB8", light: "#EDE9F5" },
  { name: "rose",       hex: "#C46E7A", light: "#F5E3E5" },
] as const;

export type AccentColorName = typeof ACCENT_COLORS[number]["name"];

export function getAccent(name: string | null | undefined) {
  return ACCENT_COLORS.find((c) => c.name === name) ?? ACCENT_COLORS[0];
}
