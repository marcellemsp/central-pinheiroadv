"use client";
import { useCallback, useEffect, useRef } from "react";

// Agrupa vários eventos de tempo real em um único router.refresh() (evita tempestade de recargas com muitos usuários).
export function useRefreshDebounced(router: { refresh: () => void }, ms = 1200) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return useCallback(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => { t.current = null; router.refresh(); }, ms);
  }, [router, ms]);
}
