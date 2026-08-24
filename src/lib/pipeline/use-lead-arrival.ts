import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Toca um bipe curto (dois tons) usando WebAudio — sem arquivo externo. */
export function playLeadChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* áudio bloqueado pelo navegador — ignora */
  }
}

type MinimalLead = { id: string; name: string | null; created_at: string | null };

/** Avisa (som + toast) quando novos leads entram no pipeline. */
export function useLeadArrivalAlert(leads: MinimalLead[], enabled = true) {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (seen.current === null) {
      seen.current = new Set(leads.map((l) => l.id));
      return;
    }
    const fresh = leads.filter((l) => !seen.current!.has(l.id));
    if (fresh.length === 0) return;
    fresh.forEach((l) => seen.current!.add(l.id));

    playLeadChime();
    if (fresh.length === 1) {
      toast.success("Novo lead recebido", { description: fresh[0]?.name ?? "Lead sem nome" });
    } else {
      toast.success(`${fresh.length} novos leads recebidos`);
    }
  }, [leads, enabled]);
}
