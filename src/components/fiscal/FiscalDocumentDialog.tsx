import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/components/finance/KpiCard";
import { formatDateBR } from "@/lib/finance/format";
import {
  FISCAL_ENVIRONMENT_LABEL,
  FISCAL_STATUS_LABEL,
  type FiscalDocumentDetail,
} from "@/lib/fiscal/types";
import { FiscalStatusBadge } from "./FiscalStatusBadge";

export function FiscalDocumentDialog({
  open,
  detail,
  onClose,
}: {
  open: boolean;
  detail: FiscalDocumentDetail | null;
  onClose: () => void;
}) {
  const d = detail?.document;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Documento fiscal
            {d && <FiscalStatusBadge status={d.status} />}
            {d && <Badge variant="outline">{FISCAL_ENVIRONMENT_LABEL[d.ambiente]}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {!detail || !d ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando documento…</p>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-3">
              <Info label="Cliente" value={d.client_name ?? "—"} />
              <Info label="Projeto" value={d.project_name ?? "—"} />
              <Info label="Competência" value={d.competencia ? formatDateBR(d.competencia) : "—"} />
              <Info
                label="DPS"
                value={d.dps_numero ? `${d.dps_serie ? `${d.dps_serie}/` : ""}${d.dps_numero}` : "—"}
              />
              <Info label="NFS-e" value={d.nfse_numero ?? "—"} />
              <Info label="Emissão" value={d.data_emissao ? formatDateBR(d.data_emissao) : "—"} />
              <Info label="Valor dos serviços" value={brl(d.valor_servicos)} />
              <Info label="Deduções" value={brl(d.valor_deducoes)} />
              <Info label="Base de cálculo" value={brl(d.base_calculo)} />
              <Info
                label="ISS"
                value={`${brl(d.valor_iss)}${d.iss_retido ? " (retido)" : ""}`}
              />
              <Info label="Retenções" value={brl(d.valor_retencoes)} />
              <Info label="Valor líquido" value={brl(d.valor_liquido)} />
              <Info label="Chave de acesso" value={d.nfse_chave_acesso ?? "—"} />
              <Info label="Código de verificação" value={d.nfse_codigo_verificacao ?? "—"} />
              <Info label="Protocolo" value={d.protocolo ?? "—"} />
            </section>

            {(d.descricao_servico || d.observacoes) && (
              <section className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                {d.descricao_servico && <p>{d.descricao_servico}</p>}
                {d.observacoes && <p className="text-muted-foreground">{d.observacoes}</p>}
              </section>
            )}

            {(d.motivo_rejeicao || d.motivo_cancelamento) && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {d.motivo_rejeicao ?? d.motivo_cancelamento}
              </p>
            )}

            <Section title="Itens">
              {detail.items.length === 0 ? (
                <Empty>Nenhum item lançado.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Unitário</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">ISS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.descricao}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(i.valor_unitario)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(i.valor_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(i.valor_iss)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>

            <Section title="Títulos financeiros vinculados">
              {detail.finances.length === 0 ? (
                <Empty>Nenhum título vinculado.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor do título</TableHead>
                      <TableHead className="text-right">Alocado na nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.finances.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>{f.description ?? "—"}</TableCell>
                        <TableCell>{f.due_date ? formatDateBR(f.due_date) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(f.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.valor_alocado === null ? "—" : brl(f.valor_alocado)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>

            <Section title="Histórico">
              {detail.events.length === 0 ? (
                <Empty>Nenhum evento registrado.</Empty>
              ) : (
                <ol className="space-y-2">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex gap-3 rounded-md border p-3 text-sm">
                      <span className="text-muted-foreground">{formatDateBR(e.created_at)}</span>
                      <span className="flex-1">
                        <span className="font-medium">
                          {e.status ? FISCAL_STATUS_LABEL[e.status] : e.tipo}
                        </span>
                        {e.mensagem && (
                          <span className="block text-muted-foreground">{e.mensagem}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {(detail.files.pdf || detail.files.xml) && (
              <Section title="Arquivos">
                <div className="flex gap-2">
                  {detail.files.pdf && (
                    <Button asChild variant="outline" size="sm">
                      <a href={detail.files.pdf} target="_blank" rel="noreferrer">
                        Abrir PDF
                      </a>
                    </Button>
                  )}
                  {detail.files.xml && (
                    <Button asChild variant="outline" size="sm">
                      <a href={detail.files.xml} target="_blank" rel="noreferrer">
                        Abrir XML
                      </a>
                    </Button>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{children}</p>;
}
