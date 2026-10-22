import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABEL, type Priority } from "@/components/tasks/TaskDrawer";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filterPriority: string;
  setFilterPriority: (v: string) => void;
  filterProject: string;
  setFilterProject: (v: string) => void;
  filterClient: string;
  setFilterClient: (v: string) => void;
  filterDateFrom?: Date;
  setFilterDateFrom: (v: Date | undefined) => void;
  filterDateTo?: Date;
  setFilterDateTo: (v: Date | undefined) => void;
  projects: any[];
  clients: any[];
  onClear: () => void;
}

export function TaskFiltersSheet({
  open, onOpenChange,
  filterPriority, setFilterPriority,
  filterProject, setFilterProject,
  filterClient, setFilterClient,
  filterDateFrom, setFilterDateFrom,
  filterDateTo, setFilterDateTo,
  projects, clients, onClear,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90dvh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal" aria-label="Data inicial">
                    <CalendarIcon className="size-4" />
                    {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar mode="single" locale={ptBR} selected={filterDateFrom} onSelect={setFilterDateFrom} disabled={filterDateTo ? { after: filterDateTo } : undefined} className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Data final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal" aria-label="Data final">
                    <CalendarIcon className="size-4" />
                    {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <Calendar mode="single" locale={ptBR} selected={filterDateTo} onSelect={setFilterDateTo} disabled={filterDateFrom ? { before: filterDateFrom } : undefined} className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                <SelectItem value="prioritarias">Prioritárias (Alta e Urgente)</SelectItem>
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
            <Button className="flex-1" onClick={() => onOpenChange(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
