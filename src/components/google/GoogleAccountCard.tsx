import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Info = {
  email: string | null;
  name: string | null;
  avatar: string | null;
  isGoogle: boolean;
};

export function GoogleAccountCard() {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return setInfo(null);
      const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
      setInfo({
        email: u.email ?? meta.email ?? null,
        name: meta.full_name ?? meta.name ?? null,
        avatar: meta.avatar_url ?? meta.picture ?? null,
        isGoogle: (u.app_metadata?.providers ?? [u.app_metadata?.provider]).includes("google"),
      });
    });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conta Google</CardTitle>
        <CardDescription>
          O login com Google é usado apenas para autenticar você no Hublynx (nome, e-mail e foto).
          Nenhum serviço do Google é acessado pelo sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!info ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {info.avatar ? (
                <AvatarImage src={info.avatar} referrerPolicy="no-referrer" alt="" />
              ) : null}
              <AvatarFallback>{(info.name ?? info.email ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{info.name ?? "Sem nome"}</p>
              <p className="truncate text-xs text-muted-foreground">{info.email}</p>
            </div>
            <Badge variant={info.isGoogle ? "default" : "secondary"} className="ml-auto">
              {info.isGoogle ? "Conectado via Google" : "Login por e-mail e senha"}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
