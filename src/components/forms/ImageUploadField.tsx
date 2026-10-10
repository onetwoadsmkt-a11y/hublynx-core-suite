import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

type Props = {
  id: string;
  label: string;
  hint: string;
  formId: string;
  /** Empresa dona do formulário: as imagens ficam na pasta dela no armazenamento. */
  organizationId: string;
  value: string;
  onChange: (value: string) => void;
};

export function ImageUploadField({ id, label, hint, formId, organizationId, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dimensions, setDimensions] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use uma imagem PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("A imagem precisa ter no máximo 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${organizationId}/forms/${formId}/${id}-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("org-files").upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (error) throw error;
      onChange(`/api/public/form-assets/${path}`);
      toast.success("Imagem anexada.");
    } catch {
      toast.error("Não foi possível anexar a imagem. Tente novamente.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <Label htmlFor={`${id}-url`}>{label}</Label>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 flex gap-2">
        <Input
          id={`${id}-url`}
          value={value}
          placeholder="https://... ou anexe uma imagem"
          onChange={(event) => onChange(event.target.value)}
        />
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          Anexar
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      {value ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border p-2">
          <img
            src={value}
            alt="Pré-visualização"
            className="h-14 w-14 rounded-md object-contain"
            onLoad={(event) => setDimensions(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight} px`)}
            onError={() => setDimensions(null)}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{value}</p>
            {dimensions ? <p className="text-xs font-semibold">Tamanho atual: {dimensions}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Remover imagem" onClick={() => { onChange(""); setDimensions(null); }}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
