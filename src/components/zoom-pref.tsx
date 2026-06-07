"use client";

import { useEffect } from "react";

const KEY = "us_zoom";
const ZOOM_OFF = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
const ZOOM_ON = "width=device-width, initial-scale=1, viewport-fit=cover";

export function isZoomEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

/** Flip pinch-zoom on/off by rewriting the viewport meta tag at runtime. */
export function setZoomEnabled(on: boolean) {
  if (typeof document === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  const m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute("content", on ? ZOOM_ON : ZOOM_OFF);
}

/** Applies the saved zoom preference on load (default: off). */
export default function ZoomPref() {
  useEffect(() => { setZoomEnabled(isZoomEnabled()); }, []);
  return null;
}
