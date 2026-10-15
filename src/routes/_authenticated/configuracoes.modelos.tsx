import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { supabase } from "@/integrations/supabase/client";
import {
  listProjectTemplates,
  saveProjectTemplate,
  deleteProjectTemplate,
  type ProjectTemplate,
} from "@/lib/projects/stages.functions";

export const Route = createFileRoute("/_authenticated/configuracoes/modelos")({
  head: () => ({
    meta: [
      { title: "Modelos de projeto — Hublynx" },
      {
        name: "description",
        content:
          "Crie roadmaps padrão por tipo de serviço e aplique as etapas automaticamente em novos projetos.",
      },
      { property: "og:title", content: "Modelos de projeto — Hublynx" },
      {
        property: "og:description",
        content: "Roadmaps padrão por tipo de serviço aplicados automaticamente em novos projetos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

type TaskDraft = { title: string; due_offset_days: number; responsible_type: "equipe" | "cliente" };
type StageDraft = {
  name: string;
  duration_days: number | null;
  phase: string | null;
  week_label: string | null;
  start_offset_days: number | null;
  alert: string | null;
  tasks: TaskDraft[];
};
const blank = { phase: null, week_label: null, start_offset_days: null, alert: null };

/** Dia de início de cada etapa: o definido no modelo ou em sequência após a anterior. */
function stageStarts(stages: StageDraft[]) {
  const out: number[] = [];
  let cursor = 0;
  for (const s of stages) {
    const start = s.start_offset_days ?? cursor;
    out.push(start);
    cursor = start + (s.duration_days ?? 0);
  }
  return out;
}

function TemplatesPage() {
  const qc = useQueryClient();
  const { activeOrg, isOrgAdmin } = useOrgAccess();
  const listFn = useServerFn(listProjectTemplates);
  const saveFn = useServerFn(saveProjectTemplate);
  const delFn = useServerFn(deleteProjectTemplate);

  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["project-templates"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return [] as ProjectTemplate[];
      return listFn();
    },
    staleTime: 60_000,
    retry: false,
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Modelo removido");
      qc.invalidateQueries({ queryKey: ["project-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = q.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Modelos de projeto</h1>
          <p className="text-sm text-muted-foreground">
            Roadmaps padrão por tipo de serviço. Ao criar um projeto, as etapas já vêm prontas.
          </p>
        </div>
        <Button
          disabled={!activeOrg || !isOrgAdmin}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Novo modelo
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : templates.length === 0 ? (
        <Card className="rounded-2xl p-6 text-sm text-muted-foreground">
          Nenhum modelo cadastrado ainda.
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className="rounded-2xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{t.name}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {t.stages.some((s) => s.phase)
                    ? `${[...new Set(t.stages.map((s) => s.phase).filter(Boolean))].join(" → ")} · ${t.stages.length} semanas`
                    : t.stages.map((s) => s.name).join(" → ") || "Sem etapas"}
                </p>
                {t.stages.some((s) => s.tasks?.length) && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t.stages.reduce((n, s) => n + (s.tasks?.length ?? 0), 0)} tarefa(s) padrão
                  </p>
                )}
              </div>
              {isOrgAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Editar modelo"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover modelo"
                    className="text-rose-600 hover:text-rose-700"
                    onClick={() => {
                      if (confirm(`Remover o modelo "${t.name}"?`)) delM.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={open}
        onOpenChange={setOpen}
        template={editing}
        organizationId={activeOrg?.id ?? null}
        onSaved={() => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["project-templates"] });
        }}
        save={(payload) => saveFn({ data: payload })}
      />
    </div>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
  organizationId,
  onSaved,
  save,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: ProjectTemplate | null;
  organizationId: string | null;
  onSaved: () => void;
  save: (payload: any) => Promise<any>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<StageDraft[]>([
    { name: "Briefing", duration_days: 7, ...blank, tasks: [] },
  ]);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setStages(
      template && template.stages.length
        ? template.stages.map((s) => ({
            name: s.name,
            duration_days: s.duration_days,
            phase: s.phase ?? null,
            week_label: s.week_label ?? null,
            start_offset_days: s.start_offset_days ?? null,
            alert: s.alert ?? null,
            tasks: (s.tasks ?? []).map((t) => ({
              title: t.title,
              due_offset_days: t.due_offset_days ?? 0,
              responsible_type: t.responsible_type ?? "equipe",
            })),
          }))
        : [
            { name: "Briefing", duration_days: 3, ...blank, tasks: [] },
            { name: "Planejamento", duration_days: 5, ...blank, tasks: [] },
            { name: "Produção", duration_days: 14, ...blank, tasks: [] },
            { name: "Aprovação", duration_days: 3, ...blank, tasks: [] },
            { name: "Entrega", duration_days: 2, ...blank, tasks: [] },
          ],
    );
  }, [open, template]);

  const m = useMutation({
    mutationFn: () =>
      save({
        ...(template ? { id: template.id } : {}),
        organization_id: template?.organization_id ?? organizationId,
        name: name.trim(),
        description: description.trim() || null,
        stages: stages
          .map((s) => ({
            name: s.name.trim(),
            duration_days: s.duration_days,
            phase: s.phase?.trim() || null,
            week_label: s.week_label?.trim() || null,
            start_offset_days: s.start_offset_days,
            alert: s.alert?.trim() || null,
            tasks: s.tasks
              .map((t) => ({
                title: t.title.trim(),
                due_offset_days: t.due_offset_days || 0,
                responsible_type: t.responsible_type,
                visible_to_client: t.responsible_type === "cliente",
              }))
              .filter((t) => t.title.length > 0),
          }))
          .filter((s) => s.name.length > 0),
      }),
    onSuccess: () => {
      toast.success("Modelo salvo");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? "Editar modelo" : "Novo modelo de projeto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Tráfego pago"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label>Etapas</Label>
              <p className="text-xs text-muted-foreground">
                Cada etapa acontece na ordem da lista. Para um cronograma por fases e semanas,
                preencha a fase, a semana e o dia em que a etapa começa (dia 1 = início do projeto).
                Sem dia definido, a etapa começa logo após a anterior.
              </p>
            </div>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {stages.map((s, i) => (
                <div key={i} className="rounded-xl border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={s.name}
                      onChange={(e) =>
                        setStages((d) =>
                          d.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      placeholder="Nome da etapa"
                    />
                    <div
                      className="flex items-center gap-1 shrink-0"
                      title="Prazo previsto desta etapa, em dias, contado a partir do início do projeto"
                    >
                      <Input
                        type="number"
                        min={0}
                        className="w-16"
                        value={s.duration_days ?? ""}
                        onChange={(e) =>
                          setStages((d) =>
                            d.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    duration_days: e.target.value ? Number(e.target.value) : null,
                                  }
                                : x,
                            ),
                          )
                        }
                        aria-label="Prazo da etapa em dias"
                      />
                      <span className="text-xs text-muted-foreground">dias</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-rose-600 shrink-0"
                      aria-label="Remover etapa"
                      onClick={() => setStages((d) => d.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
                    <Input
                      value={s.phase ?? ""}
                      placeholder="Fase (ex.: 1ª Fase · Dias 1 a 30)"
                      className="h-8 text-sm"
                      aria-label="Fase"
                      onChange={(e) =>
                        setStages((d) =>
                          d.map((x, j) => (j === i ? { ...x, phase: e.target.value || null } : x)),
                        )
                      }
                    />
                    <Input
                      value={s.week_label ?? ""}
                      placeholder="Semana (ex.: 1ª semana)"
                      className="h-8 text-sm"
                      aria-label="Semana"
                      onChange={(e) =>
                        setStages((d) =>
                          d.map((x, j) =>
                            j === i ? { ...x, week_label: e.target.value || null } : x,
                          ),
                        )
                      }
                    />
                    <label
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                      title="Dia do projeto em que a etapa começa (1 = primeiro dia)"
                    >
                      Começa no dia
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-16 text-sm"
                        value={s.start_offset_days != null ? s.start_offset_days + 1 : ""}
                        placeholder={String(stageStarts(stages)[i] + 1)}
                        onChange={(e) =>
                          setStages((d) =>
                            d.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    start_offset_days: e.target.value
                                      ? Math.max(0, Number(e.target.value) - 1)
                                      : null,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <Input
                    value={s.alert ?? ""}
                    placeholder="⚠️ Aviso importante da etapa (opcional)"
                    className="h-8 text-sm"
                    aria-label="Aviso da etapa"
                    onChange={(e) =>
                      setStages((d) =>
                        d.map((x, j) => (j === i ? { ...x, alert: e.target.value || null } : x)),
                      )
                    }
                  />

                  <div className="space-y-1.5 pl-1">
                    {(() => {
                      const startOffset = stageStarts(stages)[i];
                      return s.tasks.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          Se o projeto começasse hoje, esta etapa iniciaria em{" "}
                          {format(addDays(new Date(), startOffset), "dd/MM/yyyy")}.
                        </p>
                      ) : null;
                    })()}
                    {s.tasks.map((t, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <Input
                          value={t.title}
                          placeholder="Tarefa padrão"
                          className="h-8 text-sm"
                          onChange={(e) =>
                            setStages((d) =>
                              d.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      tasks: x.tasks.map((y, m) =>
                                        m === k ? { ...y, title: e.target.value } : y,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 shrink-0 text-sm"
                          aria-label="Prazo em dias após o início da etapa"
                          value={t.due_offset_days}
                          onChange={(e) =>
                            setStages((d) =>
                              d.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      tasks: x.tasks.map((y, m) =>
                                        m === k
                                          ? { ...y, due_offset_days: Number(e.target.value || 0) }
                                          : y,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-8 shrink-0 px-2 text-[11px] ${t.responsible_type === "cliente" ? "border-amber-300 bg-amber-50 text-amber-800" : ""}`}
                          title="Quem executa: Equipe ou Cliente (o cliente conclui pelo portal)"
                          onClick={() =>
                            setStages((d) =>
                              d.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      tasks: x.tasks.map((y, m) =>
                                        m === k
                                          ? {
                                              ...y,
                                              responsible_type:
                                                y.responsible_type === "cliente"
                                                  ? "equipe"
                                                  : "cliente",
                                            }
                                          : y,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          {t.responsible_type === "cliente" ? "Cliente" : "Equipe"}
                        </Button>
                        <span className="text-[11px] text-muted-foreground shrink-0 w-[68px] tabular-nums">
                          {format(
                            addDays(new Date(), stageStarts(stages)[i] + (t.due_offset_days || 0)),
                            "dd/MM/yyyy",
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-600 shrink-0"
                          aria-label="Remover tarefa padrão"
                          onClick={() =>
                            setStages((d) =>
                              d.map((x, j) =>
                                j === i ? { ...x, tasks: x.tasks.filter((_, m) => m !== k) } : x,
                              ),
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() =>
                        setStages((d) =>
                          d.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  tasks: [
                                    ...x.tasks,
                                    { title: "", due_offset_days: 0, responsible_type: "equipe" },
                                  ],
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Tarefa padrão
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setStages((d) => [...d, { name: "", duration_days: 7, ...blank, tasks: [] }])
                }
              >
                <Plus className="h-4 w-4" /> Adicionar etapa
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Os dias definem o prazo previsto de cada etapa a partir do início do projeto. Nas
              tarefas padrão, os dias contam a partir do início da própria etapa.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) return toast.error("Informe o nome do modelo");
              if (!(template?.organization_id ?? organizationId))
                return toast.error("Empresa não identificada");
              if (!stages.some((s) => s.name.trim()))
                return toast.error("Adicione ao menos uma etapa");
              m.mutate();
            }}
            disabled={m.isPending}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
