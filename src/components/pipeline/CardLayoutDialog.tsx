import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_LEAD_CARD_LAYOUT,
  LEAD_CARD_FIELDS,
  useLeadCardLayout,
} from "./card-layout";

export function CardLayoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { layout, update } = useLeadCardLayout();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Layout do card do lead</DialogTitle>
          <DialogDescription>
            Escolha quais informações aparecem na capa de cada card do pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {LEAD_CARD_FIELDS.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <Label htmlFor={`layout-${f.key}`} className="text-sm font-normal">
                {f.label}
              </Label>
              <Switch
                id={`layout-${f.key}`}
                checked={layout[f.key]}
                onCheckedChange={(v) => update({ ...layout, [f.key]: v })}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => update(DEFAULT_LEAD_CARD_LAYOUT)}>
            Restaurar padrão
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Concluído
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
