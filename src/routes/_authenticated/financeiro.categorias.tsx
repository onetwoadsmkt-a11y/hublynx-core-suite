import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { listCategories, upsertCategory, deleteCategory } from "@/lib/finance/finance.functions";
import type { FinanceKind } from "@/lib/finance/types";

export const Route = createFileRoute("/_authenticated/financeiro/categorias")({
  component: CategoriasPage,
});

function CategoriasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCategories);
  const upFn = useServerFn(upsertCategory);
  const delFn = useServerFn(deleteCategory);
  const { data } = useQuery({ queryKey: ["finance", "categories"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [kind, setKind] = useState<FinanceKind>("receber");

  const up = useMutation({
    mutationFn: () => upFn({ data: { kind, name } }),
    onSuccess: () => { toast.success("Categoria criada"); setName(""); qc.invalidateQueries({ queryKey: ["finance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removida"); qc.invalidateQueries({ queryKey: ["finance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Nova categoria</h3>
        <div className="flex flex-wrap gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as FinanceKind)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="receber">Receita</SelectItem>
              <SelectItem value="pagar">Despesa</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
          <Button onClick={() => name && up.mutate()} disabled={!name || up.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Badge variant={c.kind === "receber" ? "default" : "secondary"}>
                    {c.kind === "receber" ? "Receita" : "Despesa"}
                  </Badge>
                </TableCell>
                <TableCell>{c.name} {c.is_default && <span className="text-xs text-muted-foreground ml-1">(padrão)</span>}</TableCell>
                <TableCell className="text-right">
                  {!c.is_default && (
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
