import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Search, MessageSquare, Mail, Send, Paperclip, User, Building2, Phone,
  AtSign, UserCheck, Filter, CalendarPlus, CheckSquare, FolderKanban, ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/atendimento")({
  head: () => ({
    meta: [
      { title: "Atendimento — Hublynx Core Suite" },
      { name: "description", content: "Central de atendimento multicanal: conversas, histórico e contexto do cliente em um só lugar." },
      { property: "og:title", content: "Atendimento — Hublynx Core Suite" },
      { property: "og:description", content: "Central de atendimento multicanal: conversas, histórico e contexto do cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtendimentoPage,
});

type Conversa = {
  id: string;
  nome: string;
  empresa: string;
  canal: "whatsapp" | "email";
  preview: string;
  hora: string;
  naoLidas?: number;
};

const CONVERSAS: Conversa[] = [];

function AtendimentoPage() {
  const [selected, setSelected] = useState<Conversa | null>(null);
  const [q, setQ] = useState("");

  const lista = CONVERSAS.filter((c) =>
    (c.nome + c.empresa).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Atendimento</h1>
          <p className="text-sm text-muted-foreground">
            Central multicanal — WhatsApp e Gmail (em preparação).
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <MessageSquare className="h-3 w-3" /> Em preparação
        </Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* Coluna 1 — conversas */}
        <Card className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col overflow-hidden">
          <div className="border-b p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar conversa..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2">
              <Filter className="h-4 w-4" /> Todos os canais
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {lista.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma conversa ainda.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Conecte um canal para começar a receber mensagens.
                </p>
              </div>
            ) : (
              lista.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
                    selected?.id === c.id ? "bg-muted" : ""
                  }`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {c.nome.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.nome}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{c.hora}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.preview}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Coluna 2 — conversa */}
        <Card className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs">
                {selected ? selected.nome.slice(0, 2).toUpperCase() : "—"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selected?.nome ?? "Selecione uma conversa"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selected?.empresa ?? "Nenhuma conversa selecionada"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="WhatsApp" disabled>
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="E-mail" disabled>
                <Mail className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-muted/20 p-4">
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                O histórico de conversas aparecerá aqui.
              </p>
              <p className="max-w-sm text-xs text-muted-foreground/70">
                Área preparada para WhatsApp, Gmail, atendimento multiusuário e automações.
              </p>
            </div>
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Button variant="ghost" size="icon" disabled aria-label="Anexar">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                placeholder="Escreva uma mensagem..."
                className="min-h-[44px] max-h-32 resize-none"
                disabled
              />
              <Button size="icon" disabled aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Coluna 3 — cliente */}
        <Card className="h-[calc(100vh-16rem)] min-h-[420px] overflow-y-auto p-4">
          <h2 className="text-sm font-semibold">Informações do cliente</h2>
          <div className="mt-3 space-y-3">
            <InfoRow icon={User} label="Nome" value={selected?.nome} />
            <InfoRow icon={Building2} label="Empresa" value={selected?.empresa} />
            <InfoRow icon={Phone} label="Telefone" />
            <InfoRow icon={AtSign} label="E-mail" />
            <InfoRow icon={UserCheck} label="Responsável" />
          </div>

          <Separator className="my-4" />

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contexto
          </h3>
          <div className="mt-3 space-y-3">
            <InfoRow label="Etapa no Pipeline" />
            <InfoRow label="Próxima tarefa" />
            <InfoRow label="Próximo compromisso" />
            <InfoRow label="Projeto relacionado" />
          </div>

          <Separator className="my-4" />

          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ações rápidas
          </h3>
          <div className="mt-3 grid gap-2">
            <QuickAction icon={ExternalLink} label="Abrir cliente" />
            <QuickAction icon={CheckSquare} label="Criar tarefa" />
            <QuickAction icon={CalendarPlus} label="Agendar compromisso" />
            <QuickAction icon={Filter} label="Abrir no Pipeline" />
            <QuickAction icon={FolderKanban} label="Criar projeto" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value,
}: { icon?: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <Button variant="outline" size="sm" className="justify-start gap-2" disabled>
      <Icon className="h-4 w-4" /> {label}
    </Button>
  );
}
