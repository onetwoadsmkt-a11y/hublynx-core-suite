/** Campos de lead que podem ser mapeados a partir do payload do formulário. */
export const LEAD_FIELDS = [
  { key: "name", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Telefone" },
  { key: "company", label: "Empresa" },
  { key: "value", label: "Valor" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
  { key: "source", label: "Origem" },
  { key: "utm_source", label: "utm_source" },
  { key: "utm_medium", label: "utm_medium" },
  { key: "utm_campaign", label: "utm_campaign" },
  { key: "utm_term", label: "utm_term" },
  { key: "utm_content", label: "utm_content" },
  { key: "gclid", label: "gclid" },
  { key: "fbclid", label: "fbclid" },
  { key: "landing_url", label: "URL da página" },
  { key: "referrer", label: "Referrer" },
] as const;

export type LeadFieldKey = (typeof LEAD_FIELDS)[number]["key"];

/** { name: "contato.nome" } ou { source: { const: "Formulário" } } */
export type FieldMap = Record<string, string | { const: string } | null | undefined>;

/** Achata objetos/arrays em caminhos "a.b.0.c" com valores escalares. */
export function flattenPayload(
  input: unknown,
  prefix = "",
  out: Record<string, string> = {},
  depth = 0,
): Record<string, string> {
  if (depth > 6) return out;
  if (input === null || input === undefined) return out;
  if (Array.isArray(input)) {
    input.forEach((v, i) => flattenPayload(v, prefix ? `${prefix}.${i}` : String(i), out, depth + 1));
    return out;
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      flattenPayload(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
    }
    return out;
  }
  const s = String(input).trim();
  if (prefix && s !== "") out[prefix] = s;
  return out;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?\d{2}\s?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/;

/** Quando tudo veio grudado num campo só, tenta extrair nome/email/telefone. */
export function splitBlob(blob: string) {
  const email = blob.match(EMAIL_RE)?.[0];
  const phone = blob.match(PHONE_RE)?.[0];
  const lines = blob
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const name = lines.find((l) => !EMAIL_RE.test(l) && !PHONE_RE.test(l) && l.length <= 120);
  return { name, email, phone, raw: blob };
}

/** Lê utm_*, gclid e fbclid da query string de uma URL. */
export function utmFromUrl(url?: string): Record<string, string> {
  if (!url) return {};
  try {
    const u = new URL(url);
    const out: Record<string, string> = {};
    for (const k of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ]) {
      const v = u.searchParams.get(k);
      if (v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
