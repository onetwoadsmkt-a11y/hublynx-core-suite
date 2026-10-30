import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ListTodo, FolderKanban, Users, BellRing } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (kind: "tarefa" | "projeto" | "cliente" | "lembrete") => void;
}

const ACTIONS = [
  { id: "tarefa" as const, label: "Nova tarefa", icon: ListTodo, color: "bg-primary" },
  { id: "projeto" as const, label: "Novo projeto", icon: FolderKanban, color: "bg-indigo-500" },
  { id: "cliente" as const, label: "Novo cliente", icon: Users, color: "bg-sky-500" },
  { id: "lembrete" as const, label: "Novo lembrete", icon: BellRing, color: "bg-amber-500" },
];

export function NewActionSheet({ open, onOpenChange, onPick }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-t-0 max-w-lg mx-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>O que você quer criar?</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3 pb-2">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              onClick={() => onPick(a.id)}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-5 hover:bg-accent transition active:scale-[0.98]"
            >
              <span className={`h-12 w-12 rounded-2xl ${a.color} text-white flex items-center justify-center`}>
                <a.icon className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
