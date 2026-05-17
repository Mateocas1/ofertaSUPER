"use client";

import { usePersistedState } from "@/hooks/use-persisted-state";

export type CanastaItem = {
  ean: string;
  qty: number;
};

const STORAGE_KEY = "ofertas-super:canasta";

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(99, Math.round(value)));
}

function sanitizeCanasta(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as CanastaItem[];
  }

  const quantities = new Map<string, number>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as { ean?: unknown; qty?: unknown };
    const ean = typeof candidate.ean === "string" ? candidate.ean.trim() : "";
    const qty = typeof candidate.qty === "number" ? candidate.qty : Number(candidate.qty ?? 0);

    if (!/^\d{8,18}$/.test(ean) || !Number.isFinite(qty) || qty <= 0) {
      continue;
    }

    quantities.set(ean, (quantities.get(ean) ?? 0) + normalizeQuantity(qty));
  }

  return Array.from(quantities.entries()).map(([ean, qty]) => ({
    ean,
    qty: normalizeQuantity(qty),
  }));
}

export function useCanasta() {
  const { value: items, setValue: setItems, hasHydrated } = usePersistedState<CanastaItem[]>({
    key: STORAGE_KEY,
    initialValue: [],
    parse: sanitizeCanasta,
  });

  function addItem(ean: string, qty = 1) {
    const quantityToAdd = normalizeQuantity(qty);

    setItems((current) => {
      const existing = current.find((entry) => entry.ean === ean);

      if (!existing) {
        return [...current, { ean, qty: quantityToAdd }];
      }

      return current.map((entry) =>
        entry.ean === ean
          ? {
              ...entry,
              qty: normalizeQuantity(entry.qty + quantityToAdd),
            }
          : entry,
      );
    });
  }

  function setQuantity(ean: string, qty: number) {
    if (qty <= 0) {
      setItems((current) => current.filter((entry) => entry.ean !== ean));
      return;
    }

    setItems((current) =>
      current.map((entry) =>
        entry.ean === ean
          ? {
              ...entry,
              qty: normalizeQuantity(qty),
            }
          : entry,
      ),
    );
  }

  function incrementItem(ean: string) {
    addItem(ean, 1);
  }

  function decrementItem(ean: string) {
    const currentItem = items.find((entry) => entry.ean === ean);

    if (!currentItem) {
      return;
    }

    setQuantity(ean, currentItem.qty - 1);
  }

  function removeItem(ean: string) {
    setItems((current) => current.filter((entry) => entry.ean !== ean));
  }

  function clearCanasta() {
    setItems([]);
  }

  function getQuantity(ean: string) {
    return items.find((entry) => entry.ean === ean)?.qty ?? 0;
  }

  return {
    items,
    hasHydrated,
    totalItems: items.reduce((total, entry) => total + entry.qty, 0),
    distinctItems: items.length,
    addItem,
    setQuantity,
    incrementItem,
    decrementItem,
    removeItem,
    clearCanasta,
    getQuantity,
  };
}