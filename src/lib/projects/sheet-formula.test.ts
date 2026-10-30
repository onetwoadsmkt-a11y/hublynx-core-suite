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
