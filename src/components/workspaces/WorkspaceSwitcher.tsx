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
          <span className="max-w-[160px] truncate">{activeOrganization.support ? `Suporte: ${activeOrganization.name}` : activeOrganization.name}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        {[
          { label: "Minha empresa", list: organizations.filter((o) => !o.support) },
          { label: "Assinantes (modo suporte)", list: organizations.filter((o) => o.support) },
        ]
          .filter((g) => g.list.length)
          .map((g, gi) => (
            <div key={g.label}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">{g.label}</DropdownMenuLabel>
              {g.list.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => setActiveOrganization(o.id)} className="gap-2">
                  <Check className={`h-4 w-4 ${o.id === activeOrganization.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.name}</span>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
