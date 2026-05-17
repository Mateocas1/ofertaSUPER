"use client";

import { useEffect, useRef, useState } from "react";

type PersistedPayload<T> = {
  version: number;
  value: T;
};

type UsePersistedStateOptions<T> = {
  key: string;
  initialValue: T;
  version?: number;
  parse: (value: unknown) => T;
};

export function usePersistedState<T>({
  key,
  initialValue,
  version = 1,
  parse,
}: UsePersistedStateOptions<T>) {
  const [value, setValue] = useState(initialValue);
  const [hasHydrated, setHasHydrated] = useState(false);
  const initialValueRef = useRef(initialValue);
  const parseRef = useRef(parse);

  useEffect(() => {
    initialValueRef.current = initialValue;
  }, [initialValue]);

  useEffect(() => {
    parseRef.current = parse;
  }, [parse]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);

      if (!raw) {
        setValue(initialValueRef.current);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedPayload<unknown>;

      if (parsed.version !== version) {
        setValue(initialValueRef.current);
        return;
      }

      setValue(parseRef.current(parsed.value));
    } catch {
      setValue(initialValueRef.current);
    } finally {
      setHasHydrated(true);
    }
  }, [key, version]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const payload: PersistedPayload<T> = {
      version,
      value,
    };

    window.localStorage.setItem(key, JSON.stringify(payload));
  }, [hasHydrated, key, value, version]);

  return {
    value,
    setValue,
    hasHydrated,
  };
}