import { useSyncExternalStore } from "react";

const KEY = "hublynx-values-unlocked";
const listeners = new Set<() => void>();
let unlocked = false;
let hydrated = false;

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  unlocked = read();
}

function emit() {
  listeners.forEach((l) => l());
}

export function unlockValues() {
  hydrate();
  unlocked = true;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
  emit();
}

export function lockValues() {
  unlocked = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function valuesUnlocked(): boolean {
  hydrate();
  return unlocked;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read of the lock state. Server snapshot is always "locked". */
export function useValuesUnlocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => valuesUnlocked(),
    () => false,
  );
}

export const MASK = "R$ ••••";

/**
 * Formata um valor em BRL, mascarando quando o cofre de valores está travado.
 * Usado em todo o sistema para que nenhum valor monetário apareça sem senha.
 */
export function maskBRL(
  n: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (!valuesUnlocked()) return MASK;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    ...options,
  }).format(Number(n) || 0);
}
