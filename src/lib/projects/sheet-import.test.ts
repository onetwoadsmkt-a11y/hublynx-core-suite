import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { buildImportedSheet, parseDateCell, parseNumberBR } from "./sheet-import";

describe("sheet-import", () => {
  test("números no formato brasileiro e internacional", () => {
    assert.equal(parseNumberBR("1.234,56"), 1234.56);
    assert.equal(parseNumberBR("R$ 10,00"), 10);
    assert.equal(parseNumberBR("1,234.5"), 1234.5);
    assert.equal(parseNumberBR("12,5%"), 12.5);
    assert.equal(parseNumberBR("abc"), null);
  });
  test("datas", () => {
    assert.equal(parseDateCell("05/03/2026"), "2026-03-05");
    assert.equal(parseDateCell("2026-03-05"), "2026-03-05");
    assert.equal(parseDateCell(new Date(2026, 2, 5)), "2026-03-05");
    assert.equal(parseDateCell("31/31/2026"), null);
  });
  test("monta colunas tipadas a partir do cabeçalho", () => {
    const s = buildImportedSheet("Compras", [
      ["Relatório de compras"],
      [],
      ["Item", "Fornecedor", "Valor", "Entrega", "Pago", "Qtd"],
      ["Luva", "ACME", "R$ 1.200,00", "10/11/2026", "Sim", 3],
      ["Bota", "", 350.5, new Date(2026, 10, 12), "não", 2],
      [null, null, null],
    ])!;
    assert.deepEqual(s.columns.map((c) => [c.key, c.type]), [
      ["item", "text"],
      ["fornecedor", "text"],
      ["valor", "currency"],
      ["entrega", "date"],
      ["pago", "boolean"],
      ["qtd", "number"],
    ]);
    assert.equal(s.columns[3].alert, true);
    assert.deepEqual(s.rows, [
      { item: "Luva", fornecedor: "ACME", valor: 1200, entrega: "2026-11-10", pago: true, qtd: 3 },
      { item: "Bota", fornecedor: null, valor: 350.5, entrega: "2026-11-12", pago: false, qtd: 2 },
    ]);
  });
  test("cabeçalhos repetidos ou vazios ganham chaves únicas", () => {
    const s = buildImportedSheet("x", [["Nome", "Nome", "", "2025"], ["a", "b", "c", "d"]])!;
    assert.deepEqual(s.columns.map((c) => c.key), ["nome", "nome_2", "coluna_3", "col_2025"]);
    assert.equal(s.columns[2].label, "Coluna 3");
  });
  test("planilha vazia", () => {
    assert.equal(buildImportedSheet("x", [[], [null, ""]]), null);
  });
});
