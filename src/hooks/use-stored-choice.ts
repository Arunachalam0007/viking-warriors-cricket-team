"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * A small choice remembered in this browser (localStorage), e.g. the Tamil / English toggle.
 * The server and the first render use `fallback`, so pages hydrate cleanly; the saved value
 * appears right after. Storage that is blocked (private mode) just means nothing is remembered.
 */

const EVENT = "vw-stored-choice";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(EVENT, onChange);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* not remembered */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
