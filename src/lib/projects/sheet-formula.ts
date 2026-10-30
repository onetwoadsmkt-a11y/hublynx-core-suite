/**
 * Fórmulas das planilhas de custo.
 * - translateExcelFormula: converte a fórmula de uma célula do Excel (ex.: "=E2*F2*(1+H2)")
 *   numa expressão por coluna ("{valor_unit}*{quantidade}*(1+({ipi}/100))").
 * - evalExpr: calcula essa expressão com segurança (sem eval), só + - * / ( ) e
 *   round/abs/min/max.
 */

export type ColRef = { key: string; type: string };

export function colIndex(letters: string) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const FN_MAP: Record<string, string> = {
  SUM: "sum", SOMA: "sum",
  ROUND: "round", ARRED: "round",
  ABS: "abs",
  MIN: "min", MÍNIMO: "min", MINIMO: "min",
  MAX: "max", MÁXIMO: "max", MAXIMO: "max",
};

type Tok =
  | { t: "num"; v: string }
  | { t: "ref"; col: number; row: number }
  | { t: "range"; c1: number; r1: number; c2: number; r2: number }
  | { t: "fn"; v: string }
  | { t: "op"; v: string };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  const s = src.trim().replace(/^=/, "");
  const REF = /^\$?([A-Za-z]{1,3})\$?(\d+)/;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " ") { i++; continue; }
    const rest = s.slice(i);
    // referência ou intervalo (pode ter nome de aba: ignoramos fórmulas entre abas)
    if (/^[A-Za-z_]+!/.test(rest) || rest.startsWith("'")) return null;
    const fn = /^([A-Za-zÁÍ_.]+)\(/.exec(rest);
    if (fn && !REF.test(rest.slice(0, fn[1].length + 1).replace("(", ""))) {
      const name = FN_MAP[fn[1].toUpperCase()];
      if (!name) return null;
      out.push({ t: "fn", v: name });
      i += fn[0].length;
      continue;
    }
    const r1 = REF.exec(rest);
    if (r1) {
      const after = rest.slice(r1[0].length);
      const r2 = after.startsWith(":") ? REF.exec(after.slice(1)) : null;
      if (r2) {
        out.push({ t: "range", c1: colIndex(r1[1]), r1: +r1[2], c2: colIndex(r2[1]), r2: +r2[2] });
        i += r1[0].length + 1 + r2[0].length;
      } else {
        out.push({ t: "ref", col: colIndex(r1[1]), row: +r1[2] });
        i += r1[0].length;
      }
      continue;
    }
    const num = /^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?%?/.exec(rest);
    if (num) {
      const v = num[0].endsWith("%") ? String(Number(num[0].slice(0, -1)) / 100) : num[0];
      out.push({ t: "num", v });
      i += num[0].length;
      continue;
    }
    if ("+-*/(),;".includes(ch)) {
      out.push({ t: "op", v: ch === ";" ? "," : ch });
      i++;
      continue;
    }
    return null; // texto, comparação, ^, & etc.: não suportado
  }
  return out;
}

export type TranslateCtx = {
  /** linha do Excel (1-based) da célula com a fórmula */
  row: number;
  /** coluna do Excel (0-based) → coluna importada */
  colAt: (col: number) => ColRef | null;
  /** valor numérico de uma célula fixa (ex.: taxa em $H$1) */
  constAt: (col: number, row: number) => number | null;
};

export type Translated =
  | { kind: "expr"; expr: string }
  /** soma de uma coluna inteira (linha de total) */
  | { kind: "colsum"; col: number }
  | null;

function refExpr(c: ColRef) {
  return c.type === "percent" ? `({${c.key}}/100)` : `{${c.key}}`;
}

export function translateExcelFormula(formula: string, ctx: TranslateCtx): Translated {
  const toks = tokenize(formula);
  if (!toks || !toks.length) return null;
  // =SUM(E2:E20) numa linha de total
  if (toks.length === 3 && toks[0].t === "fn" && toks[0].v === "sum" && toks[1].t === "range") {
    const r = toks[1];
    if (r.c1 === r.c2 && r.r1 !== r.r2) return { kind: "colsum", col: r.c1 };
  }
  const parts: string[] = [];
  const fnStack: string[] = [];
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === "num") parts.push(tk.v);
    else if (tk.t === "op") {
      if (tk.v === "(") fnStack.push("");
      if (tk.v === ")") {
        const fn = fnStack.pop();
        if (fn === "sum") { parts.push("))"); continue; }
      }
      if (tk.v === "," && fnStack[fnStack.length - 1] === "sum") { parts.push(")+("); continue; }
      parts.push(tk.v);
    } else if (tk.t === "fn") {
      // o "(" vem embutido no token
      fnStack.push(tk.v);
      parts.push(tk.v === "sum" ? "((" : `${tk.v}(`);
    } else if (tk.t === "ref") {
      if (tk.row === ctx.row) {
        const c = ctx.colAt(tk.col);
        if (!c) return null;
        parts.push(refExpr(c));
      } else {
        const v = ctx.constAt(tk.col, tk.row);
        if (v === null) return null;
        parts.push(`(${v})`);
      }
    } else if (tk.t === "range") {
      // só intervalos na mesma linha (ex.: SOMA(B2:D2))
      if (tk.r1 !== ctx.row || tk.r2 !== ctx.row || fnStack[fnStack.length - 1] !== "sum") return null;
      const keys: string[] = [];
      for (let c = Math.min(tk.c1, tk.c2); c <= Math.max(tk.c1, tk.c2); c++) {
        const col = ctx.colAt(c);
        if (col) keys.push(refExpr(col));
      }
      if (!keys.length) return null;
      parts.push(keys.join("+"));
    }
  }
  const expr = parts.join("");
  if (!/\{[a-z0-9_]+\}/.test(expr)) return null; // sem coluna: é constante
  try {
    evalExpr(expr, () => 1);
  } catch {
    return null;
  }
  return { kind: "expr", expr };
}

/** Avalia a expressão; valor ausente → null. Lança erro em sintaxe inválida. */
export function evalExpr(expr: string, get: (key: string) => number | null): number | null {
  let i = 0;
  let missing = false;
  const s = expr.replace(/\s+/g, "");
  const peek = () => s[i];
  function primary(): number {
    const ch = peek();
    if (ch === "(") {
      i++;
      const v = add();
      if (s[i++] !== ")") throw new Error("parêntese");
      return v;
    }
    if (ch === "-") { i++; return -primary(); }
    if (ch === "+") { i++; return primary(); }
    if (ch === "{") {
      const end = s.indexOf("}", i);
      if (end < 0) throw new Error("chave");
      const key = s.slice(i + 1, end);
      i = end + 1;
      const v = get(key);
      if (v === null || !Number.isFinite(v)) { missing = true; return 0; }
      return v;
    }
    const fn = /^(round|abs|min|max)\(/.exec(s.slice(i));
    if (fn) {
      i += fn[0].length;
      const args = [add()];
      while (s[i] === ",") { i++; args.push(add()); }
      if (s[i++] !== ")") throw new Error("função");
      switch (fn[1]) {
        case "round": { const p = 10 ** (args[1] ?? 0); return Math.round(args[0] * p) / p; }
        case "abs": return Math.abs(args[0]);
        case "min": return Math.min(...args);
        default: return Math.max(...args);
      }
    }
    const num = /^\d+(?:\.\d+)?(?:e[-+]?\d+)?/i.exec(s.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    throw new Error("símbolo");
  }
  function mul(): number {
    let v = primary();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = primary();
      if (op === "*") v *= r;
      else {
        if (r === 0) { missing = true; v = 0; }
        else v /= r;
      }
    }
    return v;
  }
  function add(): number {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = add();
  if (i !== s.length) throw new Error("sobra");
  return missing ? null : Math.round(v * 1e6) / 1e6;
}

/** Chaves usadas numa expressão. */
export function exprKeys(expr: string) {
  return [...expr.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1]);
}

/** Expressão legível: troca {chave} pelo nome da coluna. */
export function exprLabel(expr: string, labelOf: (key: string) => string) {
  return expr
    .replace(/\(\{([a-z0-9_]+)\}\/100\)/g, (_, k) => labelOf(k))
    .replace(/\{([a-z0-9_]+)\}/g, (_, k) => labelOf(k))
    .replace(/\*/g, " × ")
    .replace(/\//g, " ÷ ")
    .replace(/\+/g, " + ")
    .replace(/(?<=[^\s(])-/g, " − ");
}
