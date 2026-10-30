/**
 * Planos de consumo do Core (banco e arquivos por empresa) e a escala de pacotes extras.
 * Os valores ficam guardados, mas a tela só mostra preços quando SHOW_STORAGE_PRICES = true.
 */

/** Por enquanto os valores ficam ocultos em todas as telas. */
export const SHOW_STORAGE_PRICES = false;

export type StoragePackage = {
  code: string;
  name: string;
  /** banco de dados acrescentado (no plano base: o incluído) */
  database_mb: number;
  /** arquivos acrescentados (no plano base: o incluído) */
  storage_mb: number;
  monthly_price: number | null;
  is_base: boolean;
  sort_order: number;
};

/** Padrão (usado também enquanto a migração 28 não roda). */
export const DEFAULT_PACKAGES: StoragePackage[] = [
  { code: "core", name: "Plano Core", database_mb: 500, storage_mb: 5 * 1024, monthly_price: 169.9, is_base: true, sort_order: 0 },
  { code: "extra1", name: "Extra 1", database_mb: 1024, storage_mb: 10 * 1024, monthly_price: 29.9, is_base: false, sort_order: 1 },
  { code: "extra2", name: "Extra 2", database_mb: 3 * 1024, storage_mb: 30 * 1024, monthly_price: 69.9, is_base: false, sort_order: 2 },
  { code: "extra3", name: "Extra 3", database_mb: 10 * 1024, storage_mb: 100 * 1024, monthly_price: 179.9, is_base: false, sort_order: 3 },
];

export type UsageLevel = "ok" | "warn" | "over";

/** Limites da empresa = plano base + pacote extra contratado. */
export function orgLimits(packages: StoragePackage[], extraCode: string | null | undefined) {
  const base = packages.find((p) => p.is_base) ?? DEFAULT_PACKAGES[0];
  const extra = extraCode ? packages.find((p) => p.code === extraCode && !p.is_base) ?? null : null;
  return {
    base,
    extra,
    database_mb: base.database_mb + (extra?.database_mb ?? 0),
    storage_mb: base.storage_mb + (extra?.storage_mb ?? 0),
    monthly_price:
      base.monthly_price === null && !extra ? null : (base.monthly_price ?? 0) + (extra?.monthly_price ?? 0),
  };
}

export function usageLevel(used: number, limit: number): UsageLevel {
  if (!limit) return "ok";
  const r = used / limit;
  if (r >= 1) return "over";
  if (r >= 0.8) return "warn";
  return "ok";
}

/** Menor pacote extra que comporta o uso atual com 20% de folga (ou o maior, se nenhum couber). */
export function suggestPackage(
  packages: StoragePackage[],
  usage: { database_mb: number; storage_mb: number },
): StoragePackage | null {
  const base = packages.find((p) => p.is_base) ?? DEFAULT_PACKAGES[0];
  const need = (u: number, inc: number) => u * 1.2 > inc;
  if (!need(usage.database_mb, base.database_mb) && !need(usage.storage_mb, base.storage_mb)) return null;
  const extras = packages.filter((p) => !p.is_base).sort((a, b) => a.sort_order - b.sort_order);
  return (
    extras.find(
      (p) =>
        usage.database_mb * 1.2 <= base.database_mb + p.database_mb &&
        usage.storage_mb * 1.2 <= base.storage_mb + p.storage_mb,
    ) ?? extras[extras.length - 1] ?? null
  );
}

export function fmtMB(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
  return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function fmtPrice(v: number | null | undefined) {
  if (!SHOW_STORAGE_PRICES) return "Valor oculto";
  if (v === null || v === undefined) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
