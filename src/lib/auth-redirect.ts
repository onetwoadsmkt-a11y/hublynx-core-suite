// Volta para a página que a pessoa abriu (link do portal, projeto…) depois do login.
const KEY = "auth_next";

/** Só caminhos internos do app (evita redirecionar para outro site). */
export function safeNext(v: string | null | undefined): string | null {
  if (!v || typeof v !== "string") return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/^\/(auth|login)(\/|\?|$)/.test(v)) return null;
  return v;
}

export function rememberNext(path: string) {
  const next = safeNext(path);
  if (!next) return;
  try {
    sessionStorage.setItem(KEY, next);
  } catch {
    /* sem storage */
  }
}

/** Lê e apaga o destino guardado (e o legado do portal). */
export function takeNext(): string | null {
  try {
    const v = sessionStorage.getItem(KEY) ?? sessionStorage.getItem("portal_next");
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem("portal_next");
    return safeNext(v);
  } catch {
    return null;
  }
}

/** Depois do login: vai para o destino guardado ou para o dashboard. */
export function goAfterLogin(fallback = "/dashboard") {
  const next = takeNext();
  window.location.replace(next ?? fallback);
}
