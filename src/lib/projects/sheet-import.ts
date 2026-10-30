import type { CostColumn, CostColumnType } from "./cost-presets";
import { translateExcelFormula } from "./sheet-formula";

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

export type ImportOptions = {
  /** fórmulas do Excel alinhadas com a grade (sem o "="), quando houver */
  formulas?: (string | undefined)[][];
  /** formato numérico do Excel de cada célula (ex.: "0.00%", "R$ #,##0.00") */
  formats?: (string | undefined)[][];
  /** linha (1-based) e coluna (0-based) do Excel onde a grade começa */
  firstRow?: number;
  firstCol?: number;
  /** colunas já configuradas na aba: mesmo nome → mantém a chave e os ajustes */
  existing?: CostColumn[];
};

const TOTAL_LABEL = /^(total|totais|subtotal|soma|total geral)\b/;

function formatHint(fmts: (string | undefined)[]): CostColumnType | null {
  const f = fmts.filter(Boolean) as string[];
  if (!f.length) return null;
  const share = (re: RegExp) => f.filter((x) => re.test(x)).length / f.length;
  if (share(/%/) >= 0.6) return "percent";
  if (share(/R\$|\[\$R|BRL|\[\$-416\]|"R"|\$/) >= 0.6) return "currency";
  return null;
}

export function buildImportedSheet(
  name: string,
  grid: ImportCell[][],
  opts: ImportOptions = {},
): ImportedSheet | null {
  const firstRow = opts.firstRow ?? 1;
  const firstCol = opts.firstCol ?? 0;
  const fAt = (r: number, c: number) => opts.formulas?.[r]?.[c];
  const zAt = (r: number, c: number) => opts.formats?.[r]?.[c];
  const h = headerIndex(grid);
  if (h < 0) return null;
  const header = grid[h];
  let bodyIdx = grid
    .map((_, i) => i)
    .filter((i) => i > h && grid[i].some((c) => !isEmpty(c)));
  const width = Math.max(header.length, ...bodyIdx.map((i) => grid[i].length));

  // linhas de total no fim (texto "Total…" ou SOMA da coluna inteira): saem dos lançamentos
  const sumCols = new Set<number>();
  const isTotalRow = (i: number) => {
    const r = grid[i];
    const firstText = r.find((c) => typeof c === "string" && c.trim());
    const labelled = typeof firstText === "string" && TOTAL_LABEL.test(strip(firstText.trim()));
    const colsums: number[] = [];
    for (let c = 0; c < width; c++) {
      const f = fAt(i, c);
      const m = f && /^\s*=?\s*(SUM|SOMA)\(\$?([A-Z]{1,3})\$?\d+:\$?\2\$?\d+\)\s*$/i.exec(f);
      if (m) colsums.push(c);
    }
    if (labelled || colsums.length) {
      colsums.forEach((c) => sumCols.add(c));
      return true;
    }
    return false;
  };
  while (bodyIdx.length && isTotalRow(bodyIdx[bodyIdx.length - 1])) bodyIdx = bodyIdx.slice(0, -1);
  const body = bodyIdx.map((i) => grid[i]);

  // colunas usadas (cabeçalho ou algum valor/fórmula)
  const idx: number[] = [];
  for (let c = 0; c < width && idx.length < IMPORT_MAX_COLUMNS; c++) {
    if (!isEmpty(header[c]) || bodyIdx.some((i) => !isEmpty(grid[i][c]) || fAt(i, c))) idx.push(c);
  }
  if (!idx.length) return null;

  const existingBy = new Map((opts.existing ?? []).map((c) => [strip(c.label).trim(), c]));
  const used = new Set<string>();
  const columns: CostColumn[] = idx.map((c, i) => {
    const raw = header[c];
    const label = (isEmpty(raw) ? `Coluna ${i + 1}` : raw instanceof Date ? (parseDateCell(raw) ?? "") : String(raw).trim()).slice(0, 80) || `Coluna ${i + 1}`;
    const values = body.map((r) => r[c]);
    const hint = formatHint(bodyIdx.map((r) => zAt(r, c)));
    let type = inferType(label, values);
    if (hint && (type === "number" || type === "currency" || type === "percent")) type = hint;
    const prev = existingBy.get(strip(label).trim());
    let key: string;
    if (prev && !used.has(prev.key)) {
      key = prev.key;
      used.add(key);
    } else key = keyFor(label, used, i);
    const col: CostColumn = { key, label, type };
    if (prev?.width) col.width = prev.width;
    // valor unitário/preço não se soma; totais e valores sim
    if (type === "currency" || type === "number") col.sum = type === "currency" && !/(unit|preco|preço)/.test(strip(label));
    if (sumCols.has(c) && type !== "percent" && type !== "text") col.sum = true;
    if (type === "date" && (prev?.alert || /(venc|prazo|entrega|previs|validade)/.test(strip(label)))) col.alert = true;
    if (type === prev?.type && prev?.options) col.options = prev.options;
    return col;
  });

  // fórmulas por coluna: a mesma conta na maioria das linhas → coluna calculada
  const colAtExcel = (excelCol: number) => {
    const j = idx.indexOf(excelCol - firstCol);
    return j >= 0 ? { key: columns[j].key, type: columns[j].calc?.asPercent ? "percent" : columns[j].type } : null;
  };
  const constAt = (excelCol: number, excelRow: number) => {
    const r = excelRow - firstRow;
    const v = grid[r]?.[excelCol - firstCol];
    // valor como o Excel usa na conta (% fica como fração)
    return typeof v === "number" ? v : parseNumberBR(v as ImportCell);
  };
  idx.forEach((c, j) => {
    const withF = bodyIdx.filter((r) => fAt(r, c));
    if (!withF.length || withF.length < bodyIdx.length / 2) return;
    const exprs = new Map<string, number>();
    for (const r of withF) {
      const t = translateExcelFormula(fAt(r, c)!, { row: firstRow + r, colAt: colAtExcel, constAt });
      if (t?.kind === "expr") exprs.set(t.expr, (exprs.get(t.expr) ?? 0) + 1);
    }
    const best = [...exprs.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < withF.length * 0.7) return;
    const col = columns[j];
    const wasPercent = col.type === "percent";
    const money = col.type === "currency" || MONEY_HINT.test(strip(col.label));
    col.type = "calc";
    col.calc = {
      op: "add",
      a: "",
      b: "",
      expr: wasPercent ? `(${best[0]})*100` : best[0],
      ...(wasPercent ? { asPercent: true } : money ? { asCurrency: true } : {}),
    };
    col.sum = !wasPercent && (col.sum || sumCols.has(c) || money);
  });
  // coluna calculada que aponta para ela mesma não vale
  for (const col of columns) {
    if (col.calc?.expr && col.calc.expr.includes(`{${col.key}}`)) {
      col.type = "number";
      delete col.calc;
    }
  }

  const kept = body.slice(0, IMPORT_MAX_ROWS);
  const rows = kept.map((r, ri) => {
    const o: Record<string, string | number | boolean | null> = {};
    idx.forEach((c, i) => {
      const col = columns[i];
      if (col.type === "calc") return; // calculado na tela
      let v = convert(col.type, r[c]);
      const z = zAt(bodyIdx[ri], c);
      if (col.type === "percent" && typeof r[c] === "number" && z && /%/.test(z)) v = Math.round((r[c] as number) * 10000) / 100;
      o[col.key] = v;
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
