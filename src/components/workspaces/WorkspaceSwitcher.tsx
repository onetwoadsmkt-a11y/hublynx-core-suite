import { Building2, Check, ChevronDown } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspace();

  // Discreto: só aparece quando o usuário participa de mais de uma empresa.
  if (workspaces.length < 2 || !activeWorkspace) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[160px] truncate">{activeWorkspace.name}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Empresa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => setActiveWorkspace(w.id)} className="gap-2">
            <Check className={`h-4 w-4 ${w.id === activeWorkspace.id ? "opacity-100" : "opacity-0"}`} />
            <span className="truncate">{w.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
