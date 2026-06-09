import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <Card className="border-dashed shadow-none">
        <CardContent className="py-16 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Módulo em construção</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            A infraestrutura (banco de dados, RLS e rotas) já está pronta. A interface deste módulo será entregue nas próximas fases do roadmap.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
