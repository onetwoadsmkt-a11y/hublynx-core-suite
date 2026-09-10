import { Building2, Check, ChevronDown } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceSwitcher() {
  const { organizations, activeOrganization, setActiveOrganization } = useWorkspace();

  // Discreto: só aparece quando o usuário participa de mais de uma empresa.
  if (organizations.length < 2 || !activeOrganization) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[160px] truncate">{activeOrganization.name}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Empresa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => setActiveOrganization(o.id)} className="gap-2">
            <Check className={`h-4 w-4 ${o.id === activeOrganization.id ? "opacity-100" : "opacity-0"}`} />
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
