"use client";

import { useSyncExternalStore } from "react";

export type CanastaItem = {
  ean: string;
  qty: number;
};

const STORAGE_KEY = "ofertas-super:canasta";
const STORAGE_VERSION = 1;

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(99, Math.round(value)));
}

function readCanastaQuantity(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function isUsableCanastaEntry(ean: string, qty: number) {
  return /^\d{8,18}$/.test(ean) && Number.isFinite(qty) && qty > 0;
}

function parseCanastaEntry(entry: unknown) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as { ean?: unknown; qty?: unknown };
  const ean = typeof candidate.ean === "string" ? candidate.ean.trim() : "";
  const qty = readCanastaQuantity(candidate.qty);

  return isUsableCanastaEntry(ean, qty) ? { ean, qty } : null;
}

function sanitizeCanasta(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as CanastaItem[];
  }

  const quantities = new Map<string, number>();

  for (const entry of value) {
    const parsed = parseCanastaEntry(entry);
    if (!parsed) {
      continue;
    }

    quantities.set(
      parsed.ean,
      (quantities.get(parsed.ean) ?? 0) + normalizeQuantity(parsed.qty),
    );
  }

  return Array.from(quantities.entries()).map(([ean, qty]) => ({
    ean,
    qty: normalizeQuantity(qty),
  }));
}

// Pure mutations (unit-tested): quantities are clamped and zero removes.
export function addItemTo(items: CanastaItem[], ean: string, qty: number): CanastaItem[] {
  const quantityToAdd = normalizeQuantity(qty);
  const existing = items.find((entry) => entry.ean === ean);

  if (!existing) {
    return [...items, { ean, qty: quantityToAdd }];
  }

  return items.map((entry) =>
    entry.ean === ean
      ? { ...entry, qty: normalizeQuantity(entry.qty + quantityToAdd) }
      : entry,
  );
}

export function setItemQuantity(items: CanastaItem[], ean: string, qty: number): CanastaItem[] {
  if (qty <= 0) {
    return items.filter((entry) => entry.ean !== ean);
  }

  return items.map((entry) =>
    entry.ean === ean
      ? { ...entry, qty: normalizeQuantity(qty) }
      : entry,
  );
}

// One shared store for every hook instance: all the "Canasta" controls on a
// page must read and write the same cart, otherwise they clobber each other's
// localStorage writes.
type CanastaStore = {
  items: CanastaItem[];
  hasHydrated: boolean;
};

let store: CanastaStore = { items: [], hasHydrated: false };
const listeners = new Set<() => void>();
let storageBound = false;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, value: store.items }));
}

function update(next: CanastaItem[]) {
  store = { items: next, hasHydrated: true };
  persist();
  notify();
}

function bindStorage() {
  if (storageBound || typeof window === "undefined") {
    if (typeof window !== "undefined" && !store.hasHydrated) {
      store = { ...store, hasHydrated: true };
    }
    return;
  }

  storageBound = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: unknown; value?: unknown }) : null;
    const items = parsed && parsed.version === STORAGE_VERSION ? sanitizeCanasta(parsed.value) : [];
    store = { items, hasHydrated: true };
  } catch {
    store = { items: [], hasHydrated: true };
  }
  notify();
}

function subscribe(listener: () => void) {
  bindStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_SNAPSHOT: CanastaStore = { items: [], hasHydrated: false };

function getSnapshot() {
  return store;
}

function getServerSnapshotFn() {
  return SERVER_SNAPSHOT;
}

export function useCanasta() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshotFn);

  function addItem(ean: string, qty = 1) {
    update(addItemTo(store.items, ean, qty));
  }

  function setQuantity(ean: string, qty: number) {
    update(setItemQuantity(store.items, ean, qty));
  }

  function incrementItem(ean: string) {
    addItem(ean, 1);
  }

  function decrementItem(ean: string) {
    const currentItem = store.items.find((entry) => entry.ean === ean);

    if (!currentItem) {
      return;
    }

    setQuantity(ean, currentItem.qty - 1);
  }

  function removeItem(ean: string) {
    update(store.items.filter((entry) => entry.ean !== ean));
  }

  function clearCanasta() {
    update([]);
  }

  function getQuantity(ean: string) {
    return store.items.find((entry) => entry.ean === ean)?.qty ?? 0;
  }

  return {
    items: state.items,
    hasHydrated: state.hasHydrated,
    totalItems: state.items.reduce((total, entry) => total + entry.qty, 0),
    distinctItems: state.items.length,
    addItem,
    setQuantity,
    incrementItem,
    decrementItem,
    removeItem,
    clearCanasta,
    getQuantity,
  };
}
