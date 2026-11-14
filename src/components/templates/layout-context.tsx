"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Template drafts: `base` is the current production design; `a`-`e` are the
 * throwaway variants from the redesign-app-template change. */
export type LayoutId = "base" | "a" | "b" | "c" | "d" | "e";

export const VARIANTS: { id: Exclude<LayoutId, "base">; name: string }[] = [
  { id: "a", name: "Scores Rail" },
  { id: "b", name: "Ticker + Top Nav" },
  { id: "c", name: "Icon Rail + Cmd+K" },
  // D (Dashboard Grid) and E (Editorial) were dropped after owner review;
  // their files live under variants/d and variants/e and can be re-registered
  // here, in the LayoutId type and in variants/index.ts.
];

const STORAGE_KEY = "template-layout";
const VARIANT_IDS = new Set<string>(VARIANTS.map((v) => v.id));

function toLayoutId(value: string | null): LayoutId {
  return value && VARIANT_IDS.has(value) ? (value as LayoutId) : "base";
}

interface LayoutContextValue {
  layout: LayoutId;
  /** False until the client has resolved `?layout=`/localStorage; consumers
   * render the baseline until then to avoid a hydration mismatch. */
  ready: boolean;
  setLayout: (next: LayoutId) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  layout: "base",
  ready: false,
  setLayout: () => {},
});

/** Resolves the active layout: an explicit `?layout=` param wins (an unknown
 * value means baseline), otherwise the last choice persisted in localStorage.
 * Reads `window.location` once on mount instead of `useSearchParams` or
 * `usePathname`, which would need a Suspense boundary around the whole app.
 * The provider lives in the root layout, so the chosen layout survives
 * client-side navigation without re-reading the URL. */
export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<LayoutId>("base");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("layout");
    const next = param !== null ? toLayoutId(param) : toLayoutId(localStorage.getItem(STORAGE_KEY));
    localStorage.setItem(STORAGE_KEY, next);
    setLayoutState(next);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.layout = layout;
  }, [layout]);

  const setLayout = useCallback((next: LayoutId) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLayoutState(next);
    const url = new URL(window.location.href);
    if (next === "base") url.searchParams.delete("layout");
    else url.searchParams.set("layout", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const value = useMemo(() => ({ layout, ready, setLayout }), [layout, ready, setLayout]);
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}
