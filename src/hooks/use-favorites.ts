"use client";

import { usePersistedState } from "@/hooks/use-persisted-state";

const STORAGE_KEY = "ofertas-super:favorites";

function sanitizeFavorites(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => /^\d{8,18}$/.test(entry)),
    ),
  );
}

export function useFavorites() {
  const { value: favorites, setValue: setFavorites, hasHydrated } = usePersistedState<string[]>({
    key: STORAGE_KEY,
    initialValue: [],
    parse: sanitizeFavorites,
  });

  function addFavorite(ean: string) {
    setFavorites((current) => (current.includes(ean) ? current : [...current, ean]));
  }

  function removeFavorite(ean: string) {
    setFavorites((current) => current.filter((entry) => entry !== ean));
  }

  function toggleFavorite(ean: string) {
    setFavorites((current) => (current.includes(ean) ? current.filter((entry) => entry !== ean) : [...current, ean]));
  }

  function clearFavorites() {
    setFavorites([]);
  }

  function isFavorite(ean: string) {
    return favorites.includes(ean);
  }

  return {
    favorites,
    count: favorites.length,
    hasHydrated,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    clearFavorites,
    isFavorite,
  };
}