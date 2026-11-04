import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dueFromParts, dueToParts } from "@/lib/tasks/due";

/**
 * Remarcar: data e hora no horário de Brasília. Só grava ao tocar em "Remarcar"
 * (antes cada mudança no campo já salvava e a hora aparecia 3h adiantada).
 * Sem hora = dia inteiro.
 */
export function RescheduleInput({ due, onSave, pending }: { due: string | null; onSave: (iso: string) => void; pending?: boolean }) {
  const [date, setDate] = useState(() => dueToParts(due).date);
  const [time, setTime] = useState(() => dueToParts(due).time);
  useEffect(() => {
    const p = dueToParts(due);
    setDate(p.date);
    setTime(p.time);
  }, [due]);
  const cur = dueToParts(due);
  const changed = !!date && (date !== cur.date || time !== cur.time);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input type="date" aria-label="Nova data" className="h-7 rounded border border-border bg-background px-1.5 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
      <input type="time" aria-label="Nova hora" className="h-7 w-[84px] rounded border border-border bg-background px-1.5 text-xs" value={time} onChange={(e) => setTime(e.target.value)} />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={!changed || pending}
        onClick={() => { const iso = dueFromParts(date, time); if (iso) onSave(iso); }}
      >
        <CalendarClock className="mr-1 h-3 w-3" /> {pending ? "Salvando…" : "Remarcar"}
      </Button>
    </div>
  );
}
