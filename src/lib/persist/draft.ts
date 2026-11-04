import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rascunhos guardados neste aparelho a cada alteração (localStorage), para não perder o
 * que foi digitado quando a internet cai ou a página é recarregada. Somem ao salvar/cancelar
 * e expiram em 7 dias. Nunca guarde senha ou dado sensível aqui.
 */
const PREFIX = "core-draft:";
const TTL = 7 * 86_400_000;

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { v, at } = JSON.parse(raw) as { v: T; at: number };
    if (!at || Date.now() - at > TTL) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, at: Date.now() }));
  } catch {
    /* sem armazenamento: segue sem rascunho */
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignora */
  }
}

/** Limpa rascunhos vencidos (chamado uma vez ao abrir o app). */
export function pruneDrafts() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) readDraft(k.slice(PREFIX.length));
  } catch {
    /* ignora */
  }
}

/**
 * Estado com rascunho: lê o que estava guardado para `key` (ou `initial`) e grava a cada mudança.
 * `restored` = veio de um rascunho. `clear()` apaga o rascunho (use ao salvar ou cancelar).
 * Com `key` null não guarda nada.
 */
export function useDraft<T>(key: string | null, initial: T | (() => T)) {
  const init = () => (typeof initial === "function" ? (initial as () => T)() : initial);
  const [state, setState] = useState<{ key: string | null; value: T; restored: boolean }>(() => {
    const saved = key ? readDraft<T>(key) : null;
    return { key, value: saved ?? init(), restored: saved != null };
  });
  // trocou de lead/tarefa: carrega o rascunho da nova chave
  if (state.key !== key) {
    const saved = key ? readDraft<T>(key) : null;
    const next = { key, value: saved ?? init(), restored: saved != null };
    setState(next);
  }
  const keyRef = useRef(key);
  keyRef.current = key;
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setState((s) => {
      const value = typeof v === "function" ? (v as (p: T) => T)(s.value) : v;
      if (keyRef.current) writeDraft(keyRef.current, value);
      return { ...s, value };
    });
  }, []);
  const clear = useCallback(() => {
    if (keyRef.current) clearDraft(keyRef.current);
    setState((s) => ({ ...s, restored: false }));
  }, []);
  /** Volta ao valor inicial e apaga o rascunho. */
  const reset = useCallback((v: T) => {
    if (keyRef.current) clearDraft(keyRef.current);
    setState((s) => ({ ...s, value: v, restored: false }));
  }, []);
  return { value: state.key === key ? state.value : (state.value as T), set, clear, reset, restored: state.restored };
}

/** Indica se há rascunho guardado (sem carregar o componente). */
export function hasDraft(key: string) {
  return readDraft(key) != null;
}

/** Hook simples de efeito: grava `value` como rascunho de `key` enquanto `active`. */
export function useAutoDraft<T>(key: string | null, value: T, active = true) {
  useEffect(() => {
    if (key && active) writeDraft(key, value);
  }, [key, value, active]);
}
