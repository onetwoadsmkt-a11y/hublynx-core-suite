import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { HEX_RE, readableOn } from "@/components/BrandTheme";

export const Route = createFileRoute("/_authenticated/configuracoes/aparencia")({
  head: () => ({ meta: [{ title: "Aparência — Hublynx Core" }] }),
  component: AppearancePage,
});

const CORE_GREEN = "#00D084";
const PRESETS = ["#00D084", "#2563EB", "#F5C000", "#F97316", "#E11D48", "#7C3AED", "#0F766E", "#111827"];
const MAX_BYTES = 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

function AppearancePage() {
  const qc = useQueryClient();
  const { activeOrganization, role } = useWorkspace();
  const canEdit = role === "org_admin" || role === "super_admin";
  const orgId = activeOrganization?.id ?? null;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [color, setColor] = useState<string>(CORE_GREEN);
  const [hexText, setHexText] = useState<string>(CORE_GREEN);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLogoUrl(activeOrganization?.logoUrl ?? null);
    const c = (activeOrganization?.brandColor ?? CORE_GREEN).toUpperCase();
    setColor(c);
    setHexText(c);
  }, [activeOrganization?.id, activeOrganization?.logoUrl, activeOrganization?.brandColor]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-org-access"] });

  async function saveOrg(patch: { logo_url?: string | null; brand_color?: string | null; dark_style?: "marca" | "preto" }) {
    if (!orgId) throw new Error("Empresa não identificada");
    const { error } = await (supabase as any).from("organizations").update(patch).eq("id", orgId);
    if (error) throw error;
  }

  async function handleFile(file: File) {
    if (!orgId) return;
    if (!ACCEPT.includes(file.type)) return toast.error("Use PNG, JPG, SVG ou WEBP.");
    if (file.size > MAX_BYTES) return toast.error("A logo precisa ter até 1 MB.");
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${orgId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("org-branding")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("org-branding").getPublicUrl(path);
      await saveOrg({ logo_url: data.publicUrl });
      setLogoUrl(data.publicUrl);
      toast.success("Logo atualizada");
      refresh();
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar a logo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    try {
      await saveOrg({ logo_url: null });
      setLogoUrl(null);
      toast.success("Logo removida — voltou a logo da Core Suite");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveColor(next: string | null) {
    setSaving(true);
    try {
      await saveOrg({ brand_color: next });
      toast.success(next ? "Cor da marca salva" : "Cor padrão da Core Suite restaurada");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const darkStyle = activeOrganization?.darkStyle === "preto" ? "preto" : "marca";
  async function saveDarkStyle(next: "marca" | "preto") {
    if (next === darkStyle) return;
    setSaving(true);
    try {
      await saveOrg({ dark_style: next });
      toast.success(next === "preto" ? "Tema escuro com fundo preto" : "Tema escuro no tom da marca");
      refresh();
    } catch (e) {
      const msg = (e as Error).message || "";
      toast.error(/dark_style/.test(msg) ? "Rode a migração 31 no banco para usar esta opção." : msg);
    } finally {
      setSaving(false);
    }
  }

  function pick(c: string) {
    const up = c.toUpperCase();
    setColor(up);
    setHexText(up);
  }

  const fg = readableOn(color);
  const dirty = color !== (activeOrganization?.brandColor ?? CORE_GREEN).toUpperCase();

  if (!activeOrganization) {
    return <div className="mx-auto w-full max-w-4xl px-6 py-8 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Aparência</h1>
        <p className="text-sm text-muted-foreground">
          Deixe o sistema com a cara da {activeOrganization.name}: sua logo e a cor da sua marca. A cor muda
          botões, menus e destaques; a cor escura da logo vai para os cabeçalhos das tabelas.
        </p>
        {!canEdit && (
          <p className="mt-2 text-xs text-muted-foreground">Somente o administrador da empresa pode alterar.</p>
        )}
      </div>

      <Card className="rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-medium">Logo da empresa</h2>
          <p className="text-xs text-muted-foreground">
            Aparece no topo do menu, em até 100 × 50 px, sem distorcer. Prefira PNG com fundo transparente,
            horizontal. Até 1 MB.
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex h-[66px] w-[132px] items-center justify-center rounded-xl border bg-background">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="object-contain"
                style={{ maxWidth: "100px", maxHeight: "50px", width: "auto", height: "auto" }}
              />
            ) : (
              <span className="text-[11px] text-muted-foreground">Logo da Core Suite</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button disabled={!canEdit || uploading} onClick={() => fileRef.current?.click()}>
            <ImageUp className="h-4 w-4" /> {uploading ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
          </Button>
          {logoUrl && (
            <Button variant="ghost" disabled={!canEdit} onClick={removeLogo} className="text-rose-600">
              <Trash2 className="h-4 w-4" /> Remover
            </Button>
          )}
        </div>
      </Card>

      <Card className="rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-medium">Cor da marca</h2>
          <p className="text-xs text-muted-foreground">Substitui o verde da Core Suite em todo o sistema.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!canEdit}
              onClick={() => pick(p)}
              aria-label={`Usar ${p}`}
              className={`h-8 w-8 rounded-full border-2 transition ${color === p ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: p }}
            />
          ))}
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <Label htmlFor="brand-color">Escolher cor</Label>
            <input
              id="brand-color"
              type="color"
              disabled={!canEdit}
              value={color}
              onChange={(e) => pick(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-md border bg-background p-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-hex">Código (hex)</Label>
            <Input
              id="brand-hex"
              className="w-32 font-mono uppercase"
              disabled={!canEdit}
              value={hexText}
              onChange={(e) => {
                const v = e.target.value.trim();
                setHexText(v);
                const withHash = v.startsWith("#") ? v : `#${v}`;
                if (HEX_RE.test(withHash)) setColor(withHash.toUpperCase());
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-background p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Prévia</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: color, color: fg }}>
              Botão principal
            </span>
            <span
              className="rounded-lg px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: `color-mix(in oklab, ${color} 12%, white)`, color }}
            >
              Menu ativo
            </span>
            <span className="h-2 w-28 rounded-full" style={{ backgroundColor: color }} />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button disabled={!canEdit || saving || !dirty} onClick={() => saveColor(color)}>
            Salvar cor
          </Button>
          <Button
            variant="outline"
            disabled={!canEdit || saving || !activeOrganization.brandColor}
            onClick={() => saveColor(null)}
          >
            <RotateCcw className="h-4 w-4" /> Restaurar padrão Core
          </Button>
        </div>
      </Card>
      <Card className="rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-medium">Fundo do tema escuro</h2>
          <p className="text-xs text-muted-foreground">
            Vale para todos da empresa quando escolherem o tema escuro (ícone da lua no topo). Os cards ficam sempre
            um degrau mais claros que o fundo, com texto em alto contraste.
          </p>
        </div>
        <div role="radiogroup" aria-label="Fundo do tema escuro" className="grid gap-3 sm:grid-cols-2">
          {([
            ["marca", "Tom da marca", "Fundo escuro na cor escura da logo.", "oklch(0.165 0.03 265)", "oklch(0.215 0.035 265)"],
            ["preto", "Preto", "Fundo preto com cards em cinza-chumbo.", "oklch(0 0 0)", "oklch(0.185 0 0)"],
          ] as const).map(([k, title, desc, bg, card]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={darkStyle === k}
              disabled={!canEdit || saving}
              onClick={() => saveDarkStyle(k)}
              className={`rounded-xl border-2 p-3 text-left transition ${darkStyle === k ? "border-primary" : "border-border hover:border-muted-foreground/40"}`}
            >
              <div className="mb-3 space-y-1.5 rounded-lg p-2.5" style={{ background: bg }}>
                <div className="flex items-center gap-2 rounded-md p-2" style={{ background: card }}>
                  <span className="h-2 w-16 rounded-full bg-white/85" />
                  <span className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: color, color: fg }}>Botão</span>
                </div>
                <div className="rounded-md p-2" style={{ background: card }}>
                  <span className="block h-1.5 w-24 rounded-full bg-white/55" />
                </div>
              </div>
              <p className="text-sm font-semibold">{title}{darkStyle === k ? " · em uso" : ""}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
