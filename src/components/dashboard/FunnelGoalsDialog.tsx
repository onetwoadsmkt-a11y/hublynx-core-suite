import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { classifyStage, type StageLite } from "@/lib/pipeline/funnel";
import {
  normalizeGoals, ROLE_LABEL, STEP_LABEL, STEPS,
  type FunnelGoals, type StageRole, type StepKey,
} from "@/lib/pipeline/funnel-goals";
import { saveFunnelGoals } from "@/lib/pipeline/funnel-goals.functions";

const ROLES = Object.keys(ROLE_LABEL) as StageRole[];
const OBJECTIVES = STEPS.filter((s) => s !== "entrada") as FunnelGoals["objective"][];
const OBJ_HINT: Record<FunnelGoals["objective"], string> = {
  conectado: "Conversão = lead que respondeu / teve contato efetivo",
  agendada: "Conversão = lead que agendou reunião",
  realizada: "Conversão = lead que compareceu à reunião",
  cof: "Conversão = lead que recebeu proposta",
  ganho: "Conversão = venda fechada",
};

const numOrNull = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

export function FunnelGoalsDialog({
  open, onOpenChange, pipelineId, pipelineName, stages, goals,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pipelineId: string;
  pipelineName: string;
  stages: StageLite[];
  goals: FunnelGoals;
}) {
  const saveFn = useServerFn(saveFunnelGoals);
  const qc = useQueryClient();
  const [g, setG] = useState<FunnelGoals>(goals);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setG(normalizeGoals(goals)); }, [open, goals]);

  const roleOf = (s: StageLite): StageRole => g.stageMap[s.id] ?? (classifyStage(s) as StageRole);
  const setRole = (id: string, role: StageRole) => setG({ ...g, stageMap: { ...g.stageMap, [id]: role } });
  const setStepTarget = (k: StepKey, v: string) => {
    const steps = { ...g.targets.steps };
    const n = numOrNull(v);
    if (n == null) delete steps[k]; else steps[k] = Math.max(0, Math.min(100, n));
    setG({ ...g, targets: { ...g.targets, steps } });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Grava o papel de todas as etapas (inclusive as automáticas) para o cálculo ficar fixo.
      const stageMap = Object.fromEntries(stages.map((s) => [s.id, roleOf(s)]));
      await saveFn({ data: { pipelineId, goals: { ...g, stageMap } } });
      await qc.invalidateQueries({ queryKey: ["comercial-dashboard"] });
      toast.success("Objetivos do funil salvos");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Objetivos do funil</DialogTitle>
          <DialogDescription>Pipeline {pipelineName}. Defina o que é conversão e como cada etapa conta no funil.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="objetivo">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="objetivo">Objetivo</TabsTrigger>
            <TabsTrigger value="etapas">Etapas</TabsTrigger>
            <TabsTrigger value="metas">Metas</TabsTrigger>
          </TabsList>

          <TabsContent value="objetivo" className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>O que conta como conversão</Label>
              <Select value={g.objective} onValueChange={(v) => setG({ ...g, objective: v as FunnelGoals["objective"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((o) => <SelectItem key={o} value={o}>{g.labels[o]?.trim() || STEP_LABEL[o]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{OBJ_HINT[g.objective]}. A taxa é calculada sobre os leads que entraram no período.</p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Contar o histórico da jornada</p>
                <p className="text-xs text-muted-foreground">Lead que passou pela proposta e depois foi perdido continua contando até a proposta.</p>
              </div>
              <Switch checked={g.useHistory} onCheckedChange={(v) => setG({ ...g, useHistory: v })} />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Contar tags de funil</p>
                <p className="text-xs text-muted-foreground">Tags ligadas a um passo do funil (em Configurações › Tags) também marcam o avanço.</p>
              </div>
              <Switch checked={g.useTags} onCheckedChange={(v) => setG({ ...g, useTags: v })} />
            </div>
            <div className="space-y-2">
              <Label>Nomes dos passos (opcional)</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STEPS.map((k) => (
                  <Input key={k} placeholder={STEP_LABEL[k]} value={g.labels[k] ?? ""} maxLength={40}
                    onChange={(e) => setG({ ...g, labels: { ...g.labels, [k]: e.target.value } })} aria-label={`Nome para ${STEP_LABEL[k]}`} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="etapas" className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Diga o que cada etapa do kanban representa. Chegar a um passo conta também os anteriores; “No-show” conta como reunião agendada.
            </p>
            {stages.length === 0 && <p className="text-sm text-muted-foreground">Este pipeline não tem etapas.</p>}
            {stages.map((s) => {
              const auto = !g.stageMap[s.id];
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    {auto && <p className="text-[11px] text-muted-foreground">sugerido pelo nome</p>}
                  </div>
                  <Select value={roleOf(s)} onValueChange={(v) => setRole(s.id, v as StageRole)}>
                    <SelectTrigger className="w-[190px]" aria-label={`Papel de ${s.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{(STEPS as readonly string[]).includes(r) ? (g.labels[r as StepKey]?.trim() || ROLE_LABEL[r]) : ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="metas" className="space-y-4 pt-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Meta de leads no período</Label>
                <Input inputMode="numeric" placeholder="ex.: 200" value={g.targets.leads ?? ""}
                  onChange={(e) => { const n = numOrNull(e.target.value); setG({ ...g, targets: { ...g.targets, leads: n == null ? null : Math.max(0, Math.round(n)) } }); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Meta de conversão do objetivo (%)</Label>
                <Input inputMode="decimal" placeholder="ex.: 10" value={g.targets.conversion ?? ""}
                  onChange={(e) => { const n = numOrNull(e.target.value); setG({ ...g, targets: { ...g.targets, conversion: n == null ? null : Math.max(0, Math.min(100, n)) } }); }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meta de passagem entre etapas (%)</Label>
              <p className="text-xs text-muted-foreground">Quantos % da etapa anterior devem chegar a cada passo. Abaixo da meta aparece em vermelho.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STEPS.slice(1).map((k, i) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{g.labels[STEPS[i]]?.trim() || STEP_LABEL[STEPS[i]]} → {g.labels[k]?.trim() || STEP_LABEL[k]}</span>
                    <Input className="w-20" inputMode="decimal" placeholder="—" value={g.targets.steps[k] ?? ""} onChange={(e) => setStepTarget(k, e.target.value)} aria-label={`Meta ${STEP_LABEL[k]}`} />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar objetivos"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
