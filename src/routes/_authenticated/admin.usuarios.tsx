import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, setUserRole, deleteUser } from "@/lib/admin/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Admin" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: AdminUsers,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Não encontrado.</div>,
});

function AdminUsers() {
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const setRole = useServerFn(setUserRole);
  const del = useServerFn(deleteUser);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list({}),
  });

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "user" }) => setRole({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Papel atualizado"); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });
  const delMut = useMutation({
    mutationFn: (userId: string) => del({ data: { userId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Usuário excluído"); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-muted-foreground mt-1">Gerencie todos os usuários do sistema.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{data?.length ?? 0} usuários cadastrados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead className="text-right">Projetos</TableHead>
                  <TableHead className="text-right">Tarefas</TableHead>
                  <TableHead className="text-right">Clientes</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.counts.projects}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.counts.tasks}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.counts.clients}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {u.role === "admin" ? (
                        <Button size="sm" variant="outline"
                          onClick={() => roleMut.mutate({ userId: u.id, role: "user" })}>
                          <ShieldOff className="h-3.5 w-3.5 mr-1" />Remover admin
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline"
                          onClick={() => roleMut.mutate({ userId: u.id, role: "admin" })}>
                          <Shield className="h-3.5 w-3.5 mr-1" />Tornar admin
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação remove permanentemente {u.email} e todos os seus dados (projetos, tarefas, clientes, etc.).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => delMut.mutate(u.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
