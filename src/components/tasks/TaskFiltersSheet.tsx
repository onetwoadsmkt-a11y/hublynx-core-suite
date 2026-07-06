import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABEL, type Priority } from "@/components/tasks/TaskDrawer";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filterPriority: string;
  setFilterPriority: (v: string) => void;
  filterProject: string;
  setFilterProject: (v: string) => void;
  filterClient: string;
  setFilterClient: (v: string) => void;
  projects: any[];
  clients: any[];
  onClear: () => void;
}

export function TaskFiltersSheet({
  open, onOpenChange,
  filterPriority, setFilterPriority,
  filterProject, setFilterProject,
  filterClient, setFilterClient,
  projects, clients, onClear,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Projeto</Label>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos projetos</SelectItem>
                {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos clientes</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { onClear(); onOpenChange(false); }}>
              Limpar
            </Button>
            <Button className="flex-1 bg-[#00D084] hover:bg-[#00b873] text-white" onClick={() => onOpenChange(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
