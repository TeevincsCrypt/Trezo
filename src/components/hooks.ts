"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ItemTypeView } from "@/server/inventory";

let itemsCache: ItemTypeView[] | null = null;
let itemsPromise: Promise<ItemTypeView[]> | null = null;

export function useItems() {
  const [items, setItems] = useState<ItemTypeView[] | null>(itemsCache);
  useEffect(() => {
    if (itemsCache) return;
    itemsPromise ??= api<{ items: ItemTypeView[] }>("/api/items").then((r) => (itemsCache = r.items));
    itemsPromise.then(setItems).catch(() => setItems([]));
  }, []);
  const byId = Object.fromEntries((items ?? []).map((i) => [i.id, i]));
  return { items, byId };
}

/** Minimal fetch-on-mount hook with manual reload. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}
