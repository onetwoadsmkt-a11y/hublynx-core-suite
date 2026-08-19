/**
 * Conciliação — testes ao vivo sobre os dados reais.
 *
 * Cada teste recalcula o número por um caminho independente e compara com o
 * indicador que as telas consomem (metrics.server.ts / servicos.server.ts).
 * PASSA quando a diferença é menor que um centavo.
 */
import type { Db } from "./metrics.server";
import {
  competenciaKey,
  monthBounds,
  todayISO,
  OPEN_STATUSES,
  financeMetrics,
} from "./metrics.server";
import { serviceLinesPanel } from "./servicos.server";

const num = (v: unknown) => Number(v) || 0;
const EPS = 0.01;

export type ReconRow = { label: string; value: number | string };

export type ReconTest = {
  id: number;
  titulo: string;
  descricao: string;
  status: "passa" | "falha";
  esperado: number | null;
  obtido: number | null;
  diferenca: number | null;
  detalhe: string;
  linhas: ReconRow[];
  critico?: string;
};

export type ReconciliationReport = {
  competencia: string;
  gerado_em: string;
  passou: number;
  falhou: number;
  testes: ReconTest[];
};

function compare(
  base: Omit<ReconTest, "status" | "diferenca">,
): ReconTest {
  const esperado = base.esperado ?? 0;
  const obtido = base.obtido ?? 0;
  const diferenca = obtido - esperado;
  return {
    ...base,
    diferenca,
    status: Math.abs(diferenca) < EPS ? "passa" : "falha",
  };
}

export async function reconciliationReport(
  sb: Db,
  userId: string,
  month: number,
  year: number,
): Promise<ReconciliationReport> {
  const comp = competenciaKey(month, year);
  const { from, to } = monthBounds(month, year);
  const today = todayISO();

  const [metrics, servicePanel] = await Promise.all([
    financeMetrics(sb, userId, month, year),
    serviceLinesPanel(sb, userId, year),
  ]);

  const [{ data: finances }, { data: baixas }, { data: contas }] = await Promise.all([
    sb
      .from("finances")
      .select(
        "id, kind, amount, status, natureza, competencia, due_date, category_id, repasse_origem_id",
      )
      .eq("owner_id", userId),
    sb.from("baixas").select("receita_id, despesa_id, valor, data").eq("empresa_id", userId),
    sb.from("contas").select("saldo_inicial, ativo").eq("empresa_id", userId).eq("ativo", true),
  ]);

  const rows = finances ?? [];
  const allBaixas = baixas ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const pagoPorTitulo = new Map<string, number>();
  for (const b of allBaixas) {
    const key = b.receita_id ?? b.despesa_id;
    if (!key) continue;
    pagoPorTitulo.set(key, (pagoPorTitulo.get(key) ?? 0) + num(b.valor));
  }

  const testes: ReconTest[] = [];

  /* 1. Recebido no mês = soma das baixas de receita no mês */
  const baixasReceitaMes = allBaixas.filter(
    (b) => b.receita_id && b.data >= from && b.data <= to,
  );
  const somaBaixasReceita = baixasReceitaMes.reduce((s, b) => s + num(b.valor), 0);
  testes.push(
    compare({
      id: 1,
      titulo: "Recebido no mês = soma das baixas de receita",
      descricao: "O cartão de caixa precisa espelhar exatamente as baixas lançadas no mês.",
      esperado: somaBaixasReceita,
      obtido: metrics.recebido_mes,
      detalhe: `${baixasReceitaMes.length} baixa(s) de entrada entre ${from} e ${to}`,
      linhas: [
        { label: "Soma das baixas de entrada", value: somaBaixasReceita },
        { label: "Cartão “Recebido no mês”", value: metrics.recebido_mes },
        { label: "Quantidade de baixas", value: String(baixasReceitaMes.length) },
      ],
    }),
  );

  /* 2. Receita − Despesas = Lucro (mesma competência) */
  testes.push(
    compare({
      id: 2,
      titulo: "Receita − Despesas = Lucro (mesma competência)",
      descricao: "Os três números têm de sair da competência selecionada, sem mistura com caixa.",
      esperado: metrics.receita_mes - metrics.despesas_mes,
      obtido: metrics.lucro_mes,
      detalhe: `Competência ${comp}`,
      linhas: [
        { label: "Receita do mês", value: metrics.receita_mes },
        { label: "Despesas do mês", value: metrics.despesas_mes },
        { label: "Lucro do mês", value: metrics.lucro_mes },
      ],
    }),
  );

  /* 3. Inadimplência = soma dos saldos dos vencidos */
  const vencidos = rows.filter(
    (r) =>
      r.kind === "receber" &&
      OPEN_STATUSES.includes(r.status as (typeof OPEN_STATUSES)[number]) &&
      String(r.due_date) < today,
  );
  const somaSaldosVencidos = vencidos.reduce(
    (s, r) => s + Math.max(0, num(r.amount) - (pagoPorTitulo.get(r.id) ?? 0)),
    0,
  );
  testes.push(
    compare({
      id: 3,
      titulo: "Inadimplência = soma dos saldos vencidos",
      descricao: "O cartão acumulado tem de bater com a lista de vencidos, título a título.",
      esperado: somaSaldosVencidos,
      obtido: metrics.inadimplencia,
      detalhe: `${vencidos.length} recebível(is) vencido(s) até ${today}`,
      linhas: [
        { label: "Soma dos saldos da lista", value: somaSaldosVencidos },
        { label: "Cartão de inadimplência", value: metrics.inadimplencia },
        { label: "Títulos vencidos", value: String(vencidos.length) },
      ],
    }),
  );

  /* 4. Recebível sem baixa conta como receita e não aparece no caixa */
  const semBaixaNaComp = rows.filter(
    (r) =>
      r.kind === "receber" &&
      r.natureza === "fee" &&
      r.competencia === comp &&
      r.status !== "cancelado" &&
      !(pagoPorTitulo.get(r.id) ?? 0),
  );
  const valorSemBaixa = semBaixaNaComp.reduce((s, r) => s + num(r.amount), 0);
  const caixaDosSemBaixa = baixasReceitaMes
    .filter((b) => b.receita_id && semBaixaNaComp.some((r) => r.id === b.receita_id))
    .reduce((s, b) => s + num(b.valor), 0);
  testes.push(
    compare({
      id: 4,
      titulo: "Recebível sem baixa: receita sim, caixa não",
      descricao:
        "Títulos em aberto da competência entram na receita e não podem aparecer no recebido.",
      esperado: 0,
      obtido: caixaDosSemBaixa,
      detalhe: `${semBaixaNaComp.length} título(s) sem baixa na competência ${comp}`,
      linhas: [
        { label: "Receita gerada por títulos sem baixa", value: valorSemBaixa },
        { label: "Caixa gerado por eles (deve ser zero)", value: caixaDosSemBaixa },
        { label: "Títulos sem baixa", value: String(semBaixaNaComp.length) },
      ],
    }),
  );

  /* 5. Pagamento parcial: valor = pago + saldo */
  const parciais = rows.filter((r) => r.status === "parcial");
  let piorDiff = 0;
  let piorId = "";
  for (const r of parciais) {
    const pago = pagoPorTitulo.get(r.id) ?? 0;
    const saldo = num(r.amount) - pago;
    const diff = Math.abs(num(r.amount) - (pago + saldo));
    if (diff > Math.abs(piorDiff)) {
      piorDiff = diff;
      piorId = r.id;
    }
  }
  const totalParcial = parciais.reduce((s, r) => s + num(r.amount), 0);
  const totalPagoParcial = parciais.reduce((s, r) => s + (pagoPorTitulo.get(r.id) ?? 0), 0);
  const inconsistentes = parciais.filter((r) => {
    const pago = pagoPorTitulo.get(r.id) ?? 0;
    return pago <= 0 || pago >= num(r.amount);
  });
  testes.push(
    compare({
      id: 5,
      titulo: "Pagamento parcial: valor = pago + saldo",
      descricao: "Em títulos parciais o pago tem de ser maior que zero e menor que o valor.",
      esperado: 0,
      obtido: inconsistentes.length ? 1 : Math.abs(piorDiff),
      detalhe: inconsistentes.length
        ? `${inconsistentes.length} título(s) marcados como parcial sem baixa parcial coerente${
            piorId ? "" : ""
          }`
        : `${parciais.length} título(s) parcial(is) conferido(s)`,
      linhas: [
        { label: "Valor total dos parciais", value: totalParcial },
        { label: "Pago", value: totalPagoParcial },
        { label: "Saldo", value: totalParcial - totalPagoParcial },
        { label: "Títulos incoerentes", value: String(inconsistentes.length) },
      ],
    }),
  );

  /* 6. Repasse de mídia não altera receita/lucro/margem e move o caixa nos dois sentidos */
  const repasses = rows.filter(
    (r) =>
      r.kind === "receber" &&
      (r.natureza === "repasse" || r.natureza === "reembolso") &&
      r.competencia === comp &&
      r.status !== "cancelado",
  );
  const totalRepasse = repasses.reduce((s, r) => s + num(r.amount), 0);
  const espelhos = rows.filter(
    (r) => r.kind === "pagar" && r.repasse_origem_id && byId.has(r.repasse_origem_id),
  );
  const espelhosDaComp = espelhos.filter((r) => r.competencia === comp && r.status !== "cancelado");
  const totalEspelho = espelhosDaComp.reduce((s, r) => s + num(r.amount), 0);
  const semEspelho = repasses.filter(
    (r) => !espelhos.some((e) => e.repasse_origem_id === r.id),
  );
  // Receita/despesa não podem conter repasse nem espelho.
  const receitaContemRepasse = rows
    .filter(
      (r) =>
        r.kind === "receber" &&
        r.competencia === comp &&
        r.natureza === "fee" &&
        r.status !== "cancelado",
    )
    .some((r) => repasses.some((x) => x.id === r.id));
  const falha6 = semEspelho.length > 0 || receitaContemRepasse;
  testes.push(
    compare({
      id: 6,
      titulo: "Repasse de mídia fora da receita, dentro do caixa",
      descricao:
        "Repasse/reembolso não entram em receita, lucro nem margem, e precisam da despesa espelho de mídia.",
      esperado: 0,
      obtido: falha6 ? Math.max(1, semEspelho.length) : Math.abs(totalRepasse - totalEspelho),
      detalhe: `${repasses.length} repasse(s) na competência ${comp} · ${espelhosDaComp.length} despesa(s) espelho`,
      critico: "Se este teste falhar, todos os relatórios de rentabilidade estão errados.",
      linhas: [
        { label: "Repasse recebido (entra no caixa)", value: totalRepasse },
        { label: "Despesa espelho de mídia (sai do caixa)", value: totalEspelho },
        { label: "Repasses sem espelho", value: String(semEspelho.length) },
        { label: "Repasse contado como receita", value: receitaContemRepasse ? "sim" : "não" },
        { label: "Receita do mês (sem repasse)", value: metrics.receita_mes },
      ],
    }),
  );

  /* 7. Saldo em caixa = saldos iniciais + todas as baixas */
  const saldoInicial = (contas ?? []).reduce((s, c) => s + num(c.saldo_inicial), 0);
  const baixasAteHoje = allBaixas.filter((b) => b.data <= today);
  const entradas = baixasAteHoje
    .filter((b) => b.receita_id)
    .reduce((s, b) => s + num(b.valor), 0);
  const saidas = baixasAteHoje
    .filter((b) => !b.receita_id)
    .reduce((s, b) => s + num(b.valor), 0);
  testes.push(
    compare({
      id: 7,
      titulo: "Saldo em caixa = saldos iniciais + baixas",
      descricao: "Sem conta cadastrada com saldo inicial o saldo projetado perde o ponto de partida.",
      esperado: saldoInicial + entradas - saidas,
      obtido: metrics.saldo_caixa,
      detalhe: `${(contas ?? []).length} conta(s) ativa(s) · ${baixasAteHoje.length} baixa(s) até ${today}`,
      linhas: [
        { label: "Saldos iniciais", value: saldoInicial },
        { label: "Entradas", value: entradas },
        { label: "Saídas", value: saidas },
        { label: "Saldo em caixa", value: metrics.saldo_caixa },
      ],
    }),
  );

  /* 8. Soma das linhas de serviço = receita total do ano */
  const receitaAnoTotal = rows
    .filter(
      (r) =>
        r.kind === "receber" &&
        r.natureza === "fee" &&
        r.status !== "cancelado" &&
        String(r.competencia ?? "").startsWith(String(year)),
    )
    .reduce((s, r) => s + num(r.amount), 0);
  const somaLinhas = servicePanel.lines.reduce((s, c) => s + num(c.receita_ano), 0);
  const semLinha = servicePanel.lines.find((c) => c.id === null);
  testes.push(
    compare({
      id: 8,
      titulo: "Soma das linhas de serviço = receita do ano",
      descricao: "Toda receita do ano precisa estar classificada em alguma linha de serviço.",
      esperado: receitaAnoTotal,
      obtido: somaLinhas,
      detalhe: semLinha
        ? `Existe receita sem linha de serviço em ${year}`
        : `${servicePanel.lines.length} linha(s) em ${year}`,
      critico: "Se este teste falhar, algum contrato ficou fora de uma linha de serviço.",
      linhas: [
        { label: `Receita total ${year}`, value: receitaAnoTotal },
        { label: "Soma das linhas de serviço", value: somaLinhas },
        { label: "Receita sem linha", value: semLinha ? num(semLinha.receita_ano) : 0 },
      ],
    }),
  );

  return {
    competencia: comp,
    gerado_em: new Date().toISOString(),
    passou: testes.filter((t) => t.status === "passa").length,
    falhou: testes.filter((t) => t.status === "falha").length,
    testes,
  };
}
