import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Phone, Pencil, Eye, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ClientRow } from "@/lib/clients/clients.functions";

const STATUS_TONE: Record<ClientRow["status"], string> = {
  ativo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  prospecto: "bg-blue-100 text-blue-700 border-blue-200",
  inadimplente: "bg-rose-100 text-rose-700 border-rose-200",
  inativo: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<ClientRow["status"], string> = {
  ativo: "Ativo",
  prospecto: "Prospecto",
  inadimplente: "Inadimplente",
  inativo: "Inativo",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function ClientCard({
  client,
  onView,
  onEdit,
}: {
  client: ClientRow;
  onView: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {initials(client.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{client.name}</h3>
            <Badge variant="outline" className={STATUS_TONE[client.status]}>
              {STATUS_LABEL[client.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {client.company || client.service || "—"}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        {client.email && (
          <div className="flex items-center gap-2 truncate">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{client.email}</span>
          </div>
        )}
        {(client.phone || client.whatsapp) && (
          <div className="flex items-center gap-2 truncate">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{client.phone || client.whatsapp}</span>
          </div>
        )}
        {client.contract_renewal && (
          <div className="flex items-center gap-2 truncate">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Renova {format(new Date(client.contract_renewal), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-sm">
          {client.monthly_value != null && (
            <span className="font-semibold text-foreground">
              R$ {Number(client.monthly_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              <span className="text-xs text-muted-foreground font-normal"> /mês</span>
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onView}>
            <Eye className="h-4 w-4 mr-1" />
            Ver
          </Button>
        </div>
      </div>
    </Card>
  );
}
