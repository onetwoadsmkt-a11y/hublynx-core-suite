import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evalExpr, translateExcelFormula } from "./sheet-formula";
import { buildImportedSheet } from "./sheet-import";
import { calcValue } from "./cost-presets";

const cols: Record<number, { key: string; type: string }> = {
  0: { key: "produto", type: "text" },
  1: { key: "valor_unit", type: "currency" },
  2: { key: "qtd", type: "number" },
  3: { key: "ipi", type: "percent" },
};
const ctx = (row: number) => ({ row, colAt: (c: number) => cols[c] ?? null, constAt: (c: number, r: number) => (c === 7 && r === 1 ? 0.1 : null) });

describe("fórmulas do Excel", () => {
  it("traduz referências da mesma linha", () => {
    assert.deepEqual(translateExcelFormula("B2*C2", ctx(2)), { kind: "expr", expr: "{valor_unit}*{qtd}" });
    assert.deepEqual(translateExcelFormula("=B3*C3*(1+D3)", ctx(3)), { kind: "expr", expr: "{valor_unit}*{qtd}*(1+({ipi}/100))" });
  });
  it("célula fixa vira constante e SOMA da linha é expandida", () => {
    assert.deepEqual(translateExcelFormula("B2*$H$1", ctx(2)), { kind: "expr", expr: "{valor_unit}*(0.1)" });
    assert.deepEqual(translateExcelFormula("SUM(B2:C2)", ctx(2)), { kind: "expr", expr: "(({valor_unit}+{qtd}))" });
    assert.deepEqual(translateExcelFormula("ROUND(B2*C2,2)", ctx(2)), { kind: "expr", expr: "round({valor_unit}*{qtd},2)" });
  });
  it("SOMA da coluna é linha de total; o resto não suportado", () => {
    assert.deepEqual(translateExcelFormula("SUM(E2:E20)", ctx(21)), { kind: "colsum", col: 4 });
    assert.equal(translateExcelFormula('IF(B2>0,"a","b")', ctx(2)), null);
    assert.equal(translateExcelFormula("Plan2!B2*2", ctx(2)), null);
  });
  it("avalia com segurança", () => {
    assert.equal(evalExpr("{a}*{b}*(1+({c}/100))", (k) => ({ a: 10, b: 3, c: 10 })[k] ?? null), 33);
    assert.equal(evalExpr("{a}/{b}", (k) => ({ a: 1, b: 0 })[k] ?? null), null);
    assert.equal(evalExpr("{a}*2", () => null), null);
    assert.throws(() => evalExpr("{a};alert(1)", () => 1));
  });
});

describe("importação com fórmulas", () => {
  const grid = [
    ["Itens comprados"],
    ["Fornecedor", "Produto", "Valor unitário", "Quantidade", "IPI", "Valor total"],
    ["ACME", "Luva", 10, 3, 0.1, 33],
    ["XPTO", "Bota", 100, 2, 0.05, 210],
    ["Total", null, null, 5, null, 243],
  ];
  const formulas: (string | undefined)[][] = [
    [], [],
    [undefined, undefined, undefined, undefined, undefined, "C3*D3*(1+E3)"],
    [undefined, undefined, undefined, undefined, undefined, "C4*D4*(1+E4)"],
    [undefined, undefined, undefined, "SUM(D3:D4)", undefined, "SUM(F3:F4)"],
  ];
  const formats: (string | undefined)[][] = [[], [], [undefined, undefined, '"R$" #,##0.00', "0", "0%", '"R$" #,##0.00'], [undefined, undefined, '"R$" #,##0.00', "0", "0%", '"R$" #,##0.00'], []];
  const s = buildImportedSheet("Itens comprados", grid, { formulas, formats, firstRow: 1, existing: [{ key: "fornecedor", label: "Fornecedor", type: "text", width: 160 }] })!;
  it("monta colunas, tira o total e cria a coluna calculada", () => {
    assert.deepEqual(s.columns.map((c) => [c.key, c.type]), [
      ["fornecedor", "text"], ["produto", "text"], ["valor_unitario", "currency"], ["quantidade", "number"], ["ipi", "percent"], ["valor_total", "calc"],
    ]);
    assert.equal(s.columns[0].width, 160);
    assert.equal(s.columns[3].sum, true);
    assert.deepEqual(s.columns[5].calc, { op: "add", a: "", b: "", expr: "{valor_unitario}*{quantidade}*(1+({ipi}/100))", asCurrency: true });
    assert.equal(s.columns[5].sum, true);
    assert.equal(s.rows.length, 2);
    assert.deepEqual(s.rows[0], { fornecedor: "ACME", produto: "Luva", valor_unitario: 10, quantidade: 3, ipi: 10 });
  });
  it("o Core recalcula igual ao Excel", () => {
    const total = s.columns[5];
    assert.equal(calcValue(total, s.rows[0], s.columns), 33);
    assert.equal(calcValue(total, s.rows[1], s.columns), 210);
  });
});

describe("modelo de solicitação de compras (formulário + tabela + resumo)", () => {
  const N = null;
  const grid = [
    ["| SOLICITAÇÃO DE COMPRAS", N, N, N, N, N, N, N],
    [N, "Nº S.C", 1, "Alerta: Atente-se a Data de Vencimento do C.A., explicação no rodapé da Planilha.", N, "DATA:", new Date(2025, 2, 7), N],
    ["CONTATO:", N, "Samyra", N, N, N, N, N],
    [N, N, N, N, N, N, N, N],
    ["ITEM", "FORNECEDOR", "PRODUTO", "VALID CA", "Status", "VAL. UNIT.", "QUANT", "IPI", "VALOR TOTAL"],
    [1, "ACME", "Luva", new Date(2029, 1, 8), "Valido", 10, 3, N, 30],
    [2, "ACME", "Bota", N, "", 100, 2, N, 200],
    [3, N, N, N, "", N, N, N, 0],
    [N, N, N, N, N, N, N, N, N],
    ["R$ - Substituição Tributária", N, 5, N, "R$ Frete", "FOB", 20, "SOMA:", 255],
    ["CONDIÇÕES DE PAGAMENTO: 28 DDL"],
    [N, "VENCIDO", N, ">> Se a linha estiver em Vermelho C.A. Vencido."],
  ];
  const f: (string | undefined)[][] = grid.map(() => []);
  const st = (r: number) => `IF(D${r}="","",IF(D${r}-TODAY()>180,"Valido","Vencido"))`;
  f[5][4] = st(6); f[6][4] = st(7); f[7][4] = st(8);
  f[5][8] = "(F6*G6)*(H6+1)"; f[6][8] = "(F7*G7)*(H7+1)"; f[7][8] = "(F8*G8)*(H8+1)";
  f[9][8] = "SUM(I6:I8)+C10+G10";
  const s = buildImportedSheet("Itens", grid, { formulas: f })!;
  it("acha a tabela e ignora numeração, linhas modelo e rodapé", () => {
    assert.deepEqual(s.columns.map((c) => [c.label, c.type]), [
      ["FORNECEDOR", "text"], ["PRODUTO", "text"], ["VALID CA", "date"], ["Status", "validity"],
      ["VAL. UNIT.", "currency"], ["QUANT", "number"], ["IPI", "percent"], ["VALOR TOTAL", "calc"],
    ]);
    assert.equal(s.rows.length, 2);
    assert.deepEqual(s.columns[3].validity, { ref: "valid_ca" });
    assert.equal(calcValue(s.columns[7], s.rows[0], s.columns), 30);
  });
  it("leva o cabeçalho, os acréscimos e as observações", () => {
    assert.equal(s.info.title, "SOLICITAÇÃO DE COMPRAS");
    assert.deepEqual(s.info.fields?.map((x) => [x.label, x.value]), [["Nº S.C", "1"], ["DATA", "07/03/2025"], ["CONTATO", "Samyra"]]);
    assert.deepEqual(s.info.adjustments, [
      { key: "substituicao_tributaria", label: "Substituição Tributária", value: 5 },
      { key: "frete", label: "Frete", value: 20, note: "FOB" },
    ]);
    assert.deepEqual(s.info.notes, [
      { label: "", value: "Alerta: Atente-se a Data de Vencimento do C.A., explicação no rodapé da Planilha." },
      { label: "CONDIÇÕES DE PAGAMENTO", value: "28 DDL" },
    ]);
    assert.equal(s.info.totalKey, "valor_total");
  });
});

describe("Itens comprados: cálculos e somas com valores digitados", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PURCHASE_COLUMNS, toNumber: num } = require("./cost-presets") as typeof import("./cost-presets");
  const total = PURCHASE_COLUMNS.find((c) => c.key === "total")!;
  it("Val. unit. × Quant. × (1 + IPI), com vírgula e IPI vazio", () => {
    assert.equal(calcValue(total, { valor_unit: "21,77", quantidade: "12" }, PURCHASE_COLUMNS), 261.24);
    assert.equal(calcValue(total, { valor_unit: 32.38, quantidade: 12, ipi: "5" }, PURCHASE_COLUMNS), 407.988);
    assert.equal(calcValue(total, { valor_unit: "1.234,50", quantidade: 2, ipi: "10%" }, PURCHASE_COLUMNS), 2715.9);
    assert.equal(calcValue(total, {}, PURCHASE_COLUMNS), 0);
  });
  it("números no formato brasileiro", () => {
    assert.equal(num("1.234.567"), 1234567);
    assert.equal(num("R$ 1.234,56"), 1234.56);
    assert.equal(num("21.77"), 21.77);
  });
  it("soma do total confere com a planilha (R$ 2.208,18)", () => {
    const itens: [number, number][] = [[21.77, 12], [8.17, 24], [95.3, 1], [33.98, 10], [28, 20], [0.46, 150], [1.02, 100], [32.38, 12], [19.62, 10]];
    const soma = itens.reduce((a, [v, q]) => a + (calcValue(total, { valor_unit: v, quantidade: q }, PURCHASE_COLUMNS) ?? 0), 0);
    assert.equal(Math.round(soma * 100) / 100, 2208.18);
  });
});
