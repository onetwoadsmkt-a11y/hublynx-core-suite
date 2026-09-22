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
  { key: "lead_score", label: "Pontuação do lead" },
  { key: "lead_classification", label: "Classificação do lead" },
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

const ALIASES: Record<string, string[]> = {
  name: ["name", "nome", "full_name", "fullname", "nome_completo", "first_name", "primeiro_nome"],
  email: ["email", "e-mail", "e_mail", "mail", "emailaddress"],
  phone: ["phone", "telefone", "celular", "whatsapp", "fone", "tel"],
  company: ["company", "empresa", "organizacao"],
  city: ["city", "cidade"],
  state: ["state", "estado", "uf"],
  source: ["source", "origem", "canal"],
  value: ["value", "valor", "orcamento"],
  lead_score: ["lead_score", "score", "pontuacao", "pontuacao_lead"],
  lead_classification: ["lead_classification", "classification", "classificacao", "classificacao_lead"],
  utm_source: ["utm_source"],
  utm_medium: ["utm_medium"],
  utm_campaign: ["utm_campaign", "campanha"],
  utm_term: ["utm_term"],
  utm_content: ["utm_content"],
  gclid: ["gclid"],
  fbclid: ["fbclid"],
  landing_url: ["landing_url", "page_url", "url", "pagina"],
  referrer: ["referrer", "referer"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Converte o payload cru em campos de lead usando field_map + fallback por nomes. */
export function buildLeadFromPayload(raw: unknown, fieldMap: FieldMap) {
  const flat = flattenPayload(raw);
  const out: Record<string, string | undefined> = {};

  for (const [field, src] of Object.entries(fieldMap ?? {})) {
    if (!src) continue;
    if (typeof src === "object" && "const" in src) {
      out[field] = String(src.const);
    } else if (typeof src === "string" && flat[src] !== undefined) {
      out[field] = flat[src];
    }
  }

  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (out[field]) continue;
    for (const [path, value] of Object.entries(flat)) {
      const leaf = norm(path.split(".").pop() ?? "");
      if (aliases.some((a) => norm(a) === leaf)) {
        out[field] = value;
        break;
      }
    }
  }

  if (out.name && (out.name.includes("\n") || out.name.length > 120)) {
    const parts = splitBlob(out.name);
    out.email = out.email ?? parts.email;
    out.phone = out.phone ?? parts.phone;
    out.name = parts.name ?? out.name.slice(0, 120);
  }
  if (out.name) out.name = out.name.split(/[\n\r]/)[0]!.trim().slice(0, 200);

  const fromUrl = utmFromUrl(out.landing_url);
  for (const [k, v] of Object.entries(fromUrl)) if (!out[k]) out[k] = v;

  return out;
}
