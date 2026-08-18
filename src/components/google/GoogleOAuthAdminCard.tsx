import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Loader2 } from "lucide-react";
import {
  getGoogleOAuthConfig,
  saveGoogleOAuthConfig,
  testGoogleCredentials,
} from "@/lib/google/oauth.functions";

const SECRET_MASK = "••••••••";

export function GoogleOAuthAdminCard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["google-oauth-config"],
    queryFn: () => getGoogleOAuthConfig(),
    retry: false,
  });

  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setClientId(data.clientId);
    setSecret(data.hasSecret ? SECRET_MASK : "");
    setScopes(data.enabledScopes);
  }, [data]);

  if (error) return null; // não-admin
  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integração Google — credenciais</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Carregando…</CardContent>
      </Card>
    );
  }

  const toggle = (key: string) =>
    setScopes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const save = async () => {
    setSaving(true);
    try {
      await saveGoogleOAuthConfig({
        data: {
          clientId: clientId.trim(),
          clientSecret: secret && secret !== SECRET_MASK ? secret.trim() : null,
          enabledScopes: scopes as never[],
        },
      });
      toast.success("Credenciais salvas");
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await testGoogleCredentials();
      res.ok ? toast.success(res.message) : toast.error(res.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integração Google — credenciais (admin)</CardTitle>
        <CardDescription>
          Crie um cliente OAuth do tipo "Aplicativo da Web" no Google Cloud Console → Credenciais e
          cole abaixo. Adicione a Redirect URI desta tela em "URIs de redirecionamento autorizados".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="g-client-id">Client ID</Label>
          <Input
            id="g-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="000000000000-xxxx.apps.googleusercontent.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="g-secret">Client Secret</Label>
          <Input
            id="g-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="GOCSPX-…"
          />
          <p className="text-xs text-muted-foreground">
            O segredo salvo nunca é exibido. Preencha apenas para substituí-lo.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="g-redirect">Redirect URI (cole no Google Cloud Console)</Label>
          <div className="flex gap-2">
            <Input id="g-redirect" readOnly value={data.redirectUri} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void navigator.clipboard.writeText(data.redirectUri);
                toast.success("Redirect URI copiada");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Escopos habilitados</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.catalog.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(s.key)}
                  onCheckedChange={() => toggle(s.key)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar credenciais
          </Button>
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Testar credenciais
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
