import type { CostColumn, CostColumnType, SheetInfo } from "./cost-presets";
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
  /** dados fora da tabela (cabeçalho, acréscimos ao total, observações) */
  info: SheetInfo;
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

const MONEY_HINT = /(valor|val\b|preco|custo|total|r\$|pago|pagar|receber|orcamento|frete|desconto|unitario|subtotal|^st$|substitui)/;
const PERCENT_HINT = /(%|percent|margem|taxa|icms|ipi\b|pis|cofins|\biss\b|aliquota)/;
const CODE_HINT = /^(ca|c\.a\.?|cod|codigo|cnpj|cpf|cep|telefone|fone|nf|nota|ncm|sku|ref|referencia)\b/;

function inferType(label: string, values: ImportCell[]): CostColumnType {
  const vals = values.filter((v) => !isEmpty(v));
  const hint = strip(label).trim();
  if (CODE_HINT.test(hint) && !vals.some((v) => v instanceof Date)) return "text";
  if (!vals.length) {
    // coluna vazia: o nome decide (ex.: IPI → %, ST → R$)
    if (PERCENT_HINT.test(hint)) return "percent";
    if (MONEY_HINT.test(hint)) return "currency";
    return "text";
  }
  const all = (fn: (v: ImportCell) => unknown) => vals.every((v) => fn(v) !== null);
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

const isText = (v: ImportCell) => typeof v === "string" && v.trim() !== "" && parseNumberBR(v) === null && parseDateCell(v) === null;

/**
 * Linha de cabeçalho: entre as primeiras 40, a que tem mais títulos (textos curtos)
 * e logo abaixo dela há dados. Formulários com campos no topo (Nº, Data, Contato) ficam de fora.
 */
function headerIndex(grid: ImportCell[][]) {
  const lim = Math.min(grid.length, 40);
  const titlesOf = (r: ImportCell[]) => r.filter((c) => isText(c) && String(c).trim().length <= 60).length;
  const labelsOf = (r: ImportCell[]) => r.filter((c) => typeof c === "string" && /:\s*$/.test(c)).length;
  let max = 0;
  for (let i = 0; i < lim; i++) max = Math.max(max, titlesOf(grid[i]) - labelsOf(grid[i]));
  if (max >= 2) {
    // a primeira linha com pelo menos metade dos títulos da mais "cheia" e sem rótulos "Campo:"
    for (let i = 0; i < lim; i++) {
      const t = titlesOf(grid[i]);
      if (t >= 2 && t >= max * 0.5 && labelsOf(grid[i]) === 0) return i;
    }
  }
  return grid.findIndex((r) => r.some((c) => !isEmpty(c)));
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
const INDEX_LABEL = /^(item|itens|n[ºo°.]*|#|seq|sequencia)$/;

function formatHint(fmts: (string | undefined)[]): CostColumnType | null {
  const f = fmts.filter(Boolean) as string[];
  if (!f.length) return null;
  const share = (re: RegExp) => f.filter((x) => re.test(x)).length / f.length;
  if (share(/%/) >= 0.6) return "percent";
  if (share(/R\$|\[\$R|BRL|\[\$-416\]|"R"|\$/) >= 0.6) return "currency";
  return null;
}

const cellText = (v: ImportCell) =>
  v instanceof Date ? (parseDateCell(v) ?? "").split("-").reverse().join("/") : isEmpty(v) ? "" : String(v).trim();
const cleanLabel = (s: string) =>
  s.replace(/^\|+\s*/, "").replace(/:\s*$/, "").replace(/^R\$\s*-?\s*/i, "").trim();
const slug = (s: string) =>
  strip(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "campo";

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
  const blank = (i: number) => !grid[i] || grid[i].every((c) => isEmpty(c));

  // a tabela vai do cabeçalho até a primeira linha em branco
  let end = h + 1;
  while (end < grid.length && !blank(end)) end++;
  const width = Math.max(header.length, ...grid.slice(h + 1, end).map((r) => r.length));

  // coluna "Item"/"Nº" com 1, 2, 3…: o Core já numera
  const indexCols = new Set<number>();
  for (let c = 0; c < width; c++) {
    if (!INDEX_LABEL.test(strip(cellText(header[c])))) continue;
    const vals = grid.slice(h + 1, end).map((r) => r[c]).filter((v) => !isEmpty(v));
    if (vals.length && vals.every((v) => typeof v === "number" && Number.isInteger(v))) indexCols.add(c);
  }
  // linha de dados = tem algo digitado (não fórmula) fora da coluna de numeração
  const isData = (i: number) =>
    grid[i].some((v, c) => !indexCols.has(c) && !isEmpty(v) && !fAt(i, c));
  let bodyIdx: number[] = [];
  for (let i = h + 1; i < end; i++) if (isData(i)) bodyIdx.push(i);

  // linhas de total no fim da tabela (texto "Total…" ou SOMA da coluna): saem dos lançamentos
  const sumCols = new Set<number>();
  const markSums = (f: string | undefined) => {
    if (!f) return;
    for (const m of f.matchAll(/(?:SUM|SOMA)\(\$?([A-Z]{1,3})\$?\d+:\$?\1\$?\d+\)/gi)) {
      let n = 0;
      for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
      sumCols.add(n - 1 - firstCol);
    }
  };
  const isTotalRow = (i: number) => {
    const r = grid[i];
    const firstText = r.find((c) => typeof c === "string" && c.trim());
    const labelled = typeof firstText === "string" && TOTAL_LABEL.test(strip(firstText.trim()));
    let colsum = false;
    for (let c = 0; c < width; c++) {
      const f = fAt(i, c);
      if (f && /^\s*=?\s*(SUM|SOMA)\(\$?([A-Z]{1,3})\$?\d+:\$?\2\$?\d+\)\s*$/i.test(f)) {
        markSums(f);
        colsum = true;
      }
    }
    return labelled || colsum;
  };
  while (bodyIdx.length && isTotalRow(bodyIdx[bodyIdx.length - 1])) bodyIdx = bodyIdx.slice(0, -1);
  const body = bodyIdx.map((i) => grid[i]);

  // colunas usadas (cabeçalho, valor ou fórmula), sem a numeração
  const idx: number[] = [];
  for (let c = 0; c < width && idx.length < IMPORT_MAX_COLUMNS; c++) {
    if (indexCols.has(c)) continue;
    if (!isEmpty(header[c]) || bodyIdx.some((i) => !isEmpty(grid[i][c]) || fAt(i, c))) idx.push(c);
  }
  if (!idx.length) return null;

  const existingBy = new Map((opts.existing ?? []).map((c) => [strip(c.label).trim(), c]));
  const used = new Set<string>();
  const columns: CostColumn[] = idx.map((c, i) => {
    const raw = header[c];
    const label = (isEmpty(raw) ? `Coluna ${i + 1}` : cellText(raw)).slice(0, 80) || `Coluna ${i + 1}`;
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
    else if (type === "text") {
      // largura pelo texto mais comprido (descrições longas não ficam cortadas)
      const longest = Math.max(label.length, ...values.map((v) => cellText(v).length));
      col.width = Math.max(120, Math.min(360, Math.round(longest * 7.5 + 24)));
    }
    // valor unitário/preço não se soma; totais e valores sim
    if (type === "currency" || type === "number") col.sum = type === "currency" && !/(unit|preco|preço)/.test(strip(label));
    if (type === "date" && (prev?.alert || /(venc|prazo|entrega|previs|valid)/.test(strip(label)))) col.alert = true;
    if (type === prev?.type && prev?.options) col.options = prev.options;
    return col;
  });

  // fórmulas por coluna: a mesma conta na maioria das linhas → coluna calculada
  const colAtExcel = (excelCol: number) => {
    const j = idx.indexOf(excelCol - firstCol);
    return j >= 0 ? { key: columns[j].key, type: columns[j].calc?.asPercent ? "percent" : columns[j].type } : null;
  };
  const constAt = (excelCol: number, excelRow: number) => {
    const v = grid[excelRow - firstRow]?.[excelCol - firstCol];
    // valor como o Excel usa na conta (% fica como fração)
    return typeof v === "number" ? v : parseNumberBR(v as ImportCell);
  };
  idx.forEach((c, j) => {
    const withF = bodyIdx.filter((r) => fAt(r, c));
    if (!withF.length || withF.length < bodyIdx.length / 2) return;
    const col = columns[j];
    // situação pela data (ex.: SE(G9-HOJE()>180;"Valido";…)) → coluna de situação automática
    const today = withF.filter((r) => /TODAY\(\)|HOJE\(\)/i.test(fAt(r, c)!));
    if (today.length >= withF.length * 0.7) {
      const ref = /\$?([A-Z]{1,3})\$?(\d+)\s*-\s*(?:TODAY|HOJE)\(\)/i.exec(fAt(today[0], c)!);
      if (ref) {
        let n = 0;
        for (const ch of ref[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
        const target = colAtExcel(n - 1);
        if (target && target.type === "date") {
          col.type = "validity";
          col.validity = { ref: target.key };
          delete col.sum;
          return;
        }
      }
    }
    const exprs = new Map<string, number>();
    for (const r of withF) {
      const t = translateExcelFormula(fAt(r, c)!, { row: firstRow + r, colAt: colAtExcel, constAt });
      if (t?.kind === "expr") exprs.set(t.expr, (exprs.get(t.expr) ?? 0) + 1);
    }
    const best = [...exprs.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < withF.length * 0.7) return;
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
    col.sum = !wasPercent && (!!col.sum || money);
  });
  for (const col of columns) {
    if (col.calc?.expr && col.calc.expr.includes(`{${col.key}}`)) {
      col.type = "number";
      delete col.calc;
    }
  }

  // ---- fora da tabela: cabeçalho do formulário (acima) e resumo/observações (abaixo) ----
  const info: SheetInfo = {};
  const fields: NonNullable<SheetInfo["fields"]> = [];
  const notes: NonNullable<SheetInfo["notes"]> = [];
  const fieldKeys = new Set<string>();
  const addField = (label: string, value: string) => {
    let k = slug(label);
    while (fieldKeys.has(k)) k = `${k}_2`;
    fieldKeys.add(k);
    fields.push({ key: k, label: label.slice(0, 80), value: value.slice(0, 500) });
  };
  for (let i = 0; i < h; i++) {
    const r = grid[i] ?? [];
    for (let c = 0; c < r.length; c++) {
      const t = cellText(r[c]);
      if (!t || !isText(r[c])) continue;
      if (t.length > 40 || /^\|/.test(t)) {
        if (/^\|/.test(t) || (i === 0 && !info.title && t.length <= 80 && t === t.toUpperCase())) info.title = cleanLabel(t);
        else notes.push({ label: "", value: t.slice(0, 1000) });
        continue;
      }
      // rótulo: termina com ":" ou é seguido de um valor nas próximas 3 colunas
      let v = "";
      let at = -1;
      for (let k = c + 1; k < Math.min(r.length, c + 4); k++) {
        if (isEmpty(r[k])) continue;
        if (typeof r[k] === "string" && (/:\s*$/.test(String(r[k])) || (isText(r[k]) && String(r[k]).length > 40))) break;
        v = cellText(r[k]);
        at = k;
        break;
      }
      if (/:\s*$/.test(t) || at >= 0) {
        addField(cleanLabel(t) || t, v);
        if (at >= 0) c = at;
      }
    }
  }
  if (!info.title && grid[0]?.some((x) => !isEmpty(x)) && h > 0) {
    const t = grid[0].map(cellText).find(Boolean);
    if (t && !fields.some((f) => f.label === cleanLabel(t))) info.title = cleanLabel(t);
  }

  // abaixo da tabela: "SOMA" = total + células avulsas (ST, frete…), observações e legenda
  const hasValidity = columns.some((c) => c.type === "validity");
  const adjustments: NonNullable<SheetInfo["adjustments"]> = [];
  const used2 = new Set<string>();
  for (let i = end; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((x) => isEmpty(x))) continue;
    let handled = false;
    for (let c = 0; c < r.length; c++) {
      const f = fAt(i, c);
      if (!f || !/(SUM|SOMA)\(/i.test(f)) continue;
      markSums(f);
      handled = true;
      // células somadas fora do intervalo: acréscimos ao total
      const rest = f.replace(/(?:SUM|SOMA)\([^)]*\)/gi, "");
      for (const m of rest.matchAll(/\$?([A-Z]{1,3})\$?(\d+)/g)) {
        let n = 0;
        for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
        const rr = Number(m[2]) - firstRow;
        const cc = n - 1 - firstCol;
        const row = grid[rr] ?? [];
        let label = "";
        let note = "";
        for (let k = cc - 1; k >= 0; k--) {
          const t = cellText(row[k]);
          if (!t) continue;
          if (t.length <= 4 && !label) {
            note = note || t;
            continue;
          }
          label = cleanLabel(t);
          break;
        }
        // nota que fica entre o rótulo e o valor (ex.: "R$ Frete | FOB | valor")
        for (let k = cc - 1; k >= 0 && !note; k--) {
          const t = cellText(row[k]);
          if (t && t.length <= 4) note = t;
          if (t && t.length > 4) break;
        }
        label = label || `Acréscimo ${adjustments.length + 1}`;
        let key = slug(label);
        while (used2.has(key)) key = `${key}_2`;
        used2.add(key);
        adjustments.push({ key, label, value: parseNumberBR(row[cc] as ImportCell), ...(note ? { note } : {}) });
      }
    }
    if (handled) continue;
    const texts = r.map(cellText).filter(Boolean);
    if (!texts.length) continue;
    const line = texts.join(" ");
    if (hasValidity && (/^>>/.test(line) || /^(vencido|vencendo)/i.test(strip(texts[0])))) continue; // legenda da validade
    const m = /^([^:]{2,60}):\s*(.+)$/.exec(line);
    if (m) notes.push({ label: cleanLabel(m[1]), value: m[2].trim().slice(0, 1000) });
    else notes.push({ label: "", value: line.slice(0, 1000) });
  }
  // colunas somadas no "SOMA" ganham total no rodapé
  idx.forEach((c, j) => {
    if (sumCols.has(c) && columns[j].type !== "percent" && columns[j].type !== "text") columns[j].sum = true;
  });
  const totalCol =
    columns.find((c, j) => sumCols.has(idx[j]) && c.sum) ??
    [...columns].reverse().find((c) => c.sum && (c.calc?.asCurrency || c.type === "currency"));
  if (fields.length) info.fields = fields.slice(0, 30);
  if (adjustments.length) info.adjustments = adjustments.slice(0, 10);
  if (notes.length) info.notes = notes.slice(0, 20);
  if (totalCol && (adjustments.length || fields.length)) info.totalKey = totalCol.key;

  const kept = body.slice(0, IMPORT_MAX_ROWS);
  const rows = kept.map((r, ri) => {
    const o: Record<string, string | number | boolean | null> = {};
    idx.forEach((c, i) => {
      const col = columns[i];
      if (col.type === "calc" || col.type === "validity") return; // calculado na tela
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
    info,
  };
}
