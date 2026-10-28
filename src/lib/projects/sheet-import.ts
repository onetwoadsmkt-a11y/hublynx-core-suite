import type { CostColumn, CostColumnType } from "./cost-presets";

/**
 * Importação de planilha (Excel/CSV) para as planilhas de custo do projeto.
 * Puro: recebe a grade já lida (linhas × células) e devolve colunas tipadas e linhas.
 */

export type ImportCell = string | number | boolean | Date | null | undefined;
export type ImportedSheet = {
  name: string;
  columns: CostColumn[];
  rows: Record<string, string | number | boolean | null>[];
  skippedRows: number;
};

export const IMPORT_MAX_COLUMNS = 40;
export const IMPORT_MAX_ROWS = 2000;

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function keyFor(label: string, used: Set<string>, i: number) {
  let base = strip(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34);
  if (!base || /^[0-9]/.test(base)) base = `col_${base || i + 1}`;
  let k = base;
  let n = 2;
  while (used.has(k)) k = `${base}_${n++}`.slice(0, 40);
  used.add(k);
  return k;
}

const isEmpty = (v: ImportCell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** "1.234,56", "R$ 10", "12,5%", "1,234.56" → número (ou null). */
export function parseNumberBR(v: ImportCell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/^R\$\s*/i, "").replace(/%$/, "").replace(/\s/g, "");
  if (!/^[-+]?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, "");
  else if (lastComma < 0 && (s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Date, "dd/mm/aaaa", "aaaa-mm-dd" → "aaaa-mm-dd" (ou null). */
export function parseDateCell(v: ImportCell): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // células de data do Excel chegam perto da meia-noite (com desvio de fuso/segundos): arredonda para o dia
    const r = new Date(v.getTime() + 12 * 3600_000);
    return `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}

const BOOL_TRUE = ["sim", "s", "yes", "true", "x", "ok", "verdadeiro"];
const BOOL_FALSE = ["nao", "n", "no", "false", "falso"];
function parseBool(v: ImportCell): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  const s = strip(v.trim());
  if (BOOL_TRUE.includes(s)) return true;
  if (BOOL_FALSE.includes(s)) return false;
  return null;
}

const MONEY_HINT = /(valor|preco|custo|total|r\$|pago|pagar|receber|orcamento|frete|desconto|unitario|subtotal)/;
const PERCENT_HINT = /(%|percent|margem|taxa)/;

function inferType(label: string, values: ImportCell[]): CostColumnType {
  const vals = values.filter((v) => !isEmpty(v));
  if (!vals.length) return "text";
  const all = (fn: (v: ImportCell) => unknown) => vals.every((v) => fn(v) !== null);
  const hint = strip(label);
  if (vals.every((v) => v instanceof Date) || all(parseDateCell)) return "date";
  if (vals.every((v) => typeof v === "boolean") || (all(parseBool) && vals.some((v) => typeof v === "string")))
    return "boolean";
  if (all(parseNumberBR)) {
    if (vals.some((v) => typeof v === "string" && v.trim().endsWith("%")) || PERCENT_HINT.test(hint)) return "percent";
    if (vals.some((v) => typeof v === "string" && /^\s*R\$/i.test(v)) || MONEY_HINT.test(hint)) return "currency";
    return "number";
  }
  return "text";
}

function convert(type: CostColumnType, v: ImportCell): string | number | boolean | null {
  if (isEmpty(v)) return null;
  switch (type) {
    case "date":
      return parseDateCell(v);
    case "boolean":
      return parseBool(v);
    case "number":
    case "currency":
      return parseNumberBR(v);
    case "percent": {
      const n = parseNumberBR(v);
      // Excel guarda 12% como 0,12 quando a célula é numérica
      if (n !== null && typeof v === "number" && Math.abs(n) <= 1) return Math.round(n * 10000) / 100;
      return n;
    }
    default: {
      const s = v instanceof Date ? (parseDateCell(v) ?? "") : String(v).trim();
      return s.slice(0, 2000);
    }
  }
}

/** Linha de cabeçalho = primeira linha com pelo menos 2 células preenchidas (ou a primeira não vazia). */
function headerIndex(grid: ImportCell[][]) {
  const filled = (r: ImportCell[]) => r.filter((c) => !isEmpty(c)).length;
  const i = grid.findIndex((r) => filled(r) >= 2);
  return i >= 0 ? i : grid.findIndex((r) => filled(r) >= 1);
}

export function buildImportedSheet(name: string, grid: ImportCell[][]): ImportedSheet | null {
  const h = headerIndex(grid);
  if (h < 0) return null;
  const header = grid[h];
  const body = grid.slice(h + 1).filter((r) => r.some((c) => !isEmpty(c)));
  const width = Math.max(header.length, ...body.map((r) => r.length));
  // colunas usadas (cabeçalho ou algum valor)
  const idx: number[] = [];
  for (let c = 0; c < width && idx.length < IMPORT_MAX_COLUMNS; c++) {
    if (!isEmpty(header[c]) || body.some((r) => !isEmpty(r[c]))) idx.push(c);
  }
  if (!idx.length) return null;
  const used = new Set<string>();
  const columns: CostColumn[] = idx.map((c, i) => {
    const raw = header[c];
    const label = (isEmpty(raw) ? `Coluna ${i + 1}` : raw instanceof Date ? (parseDateCell(raw) ?? "") : String(raw).trim()).slice(0, 80) || `Coluna ${i + 1}`;
    const type = inferType(label, body.map((r) => r[c]));
    const col: CostColumn = { key: keyFor(label, used, i), label, type };
    if (type === "currency" || type === "number") col.sum = type === "currency";
    if (type === "date" && /(venc|prazo|entrega|previs)/.test(strip(label))) col.alert = true;
    return col;
  });
  const kept = body.slice(0, IMPORT_MAX_ROWS);
  const rows = kept.map((r) => {
    const o: Record<string, string | number | boolean | null> = {};
    idx.forEach((c, i) => {
      o[columns[i].key] = convert(columns[i].type, r[c]);
    });
    return o;
  });
  return {
    name: (name.trim() || "Planilha importada").slice(0, 80),
    columns,
    rows,
    skippedRows: body.length - kept.length,
  };
}
