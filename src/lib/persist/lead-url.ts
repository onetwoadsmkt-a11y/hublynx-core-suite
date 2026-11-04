/**
 * Card do lead aberto fica na URL (?lead=<id>): ao recarregar a página, o card volta aberto,
 * e cada aba do navegador lembra o seu (como no Kommo). Mexe só no parâmetro "lead",
 * preservando o resto da URL e o estado do roteador.
 */
export const LEAD_PARAM = "lead";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readLeadParam(): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get(LEAD_PARAM);
  return v && UUID.test(v) ? v : null;
}

export function writeLeadParam(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(LEAD_PARAM, id);
  else url.searchParams.delete(LEAD_PARAM);
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

/** Endereço para abrir o card do lead em outra aba. */
export function leadCardHref(id: string, path = "/pipeline") {
  return `${path}?${LEAD_PARAM}=${id}`;
}
