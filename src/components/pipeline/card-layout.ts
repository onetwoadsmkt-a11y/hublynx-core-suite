import { useCallback, useEffect, useState } from "react";

export type LeadCardField =
  | "company"
  | "location"
  | "phone"
  | "email"
  | "score"
  | "value"
  | "source"
  | "utm"
  | "time";

export const LEAD_CARD_FIELDS: { key: LeadCardField; label: string }[] = [
  { key: "company", label: "Empresa" },
  { key: "location", label: "Cidade / Estado" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "score", label: "Pontuação e classificação" },
  { key: "value", label: "Valor" },
  { key: "source", label: "Origem / fonte" },
  { key: "utm", label: "UTMs (mídia e campanha)" },
  { key: "time", label: "Tempo desde a criação" },
];

export type LeadCardLayout = Record<LeadCardField, boolean>;

export const DEFAULT_LEAD_CARD_LAYOUT: LeadCardLayout = {
  company: true,
  location: true,
  phone: true,
  email: true,
  score: true,
  value: true,
  source: true,
  utm: true,
  time: true,
};

const KEY = "pipeline:lead-card-layout";
const EVENT = "pipeline:lead-card-layout-change";

function read(): LeadCardLayout {
  if (typeof window === "undefined") return DEFAULT_LEAD_CARD_LAYOUT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LEAD_CARD_LAYOUT;
    return { ...DEFAULT_LEAD_CARD_LAYOUT, ...(JSON.parse(raw) as Partial<LeadCardLayout>) };
  } catch {
    return DEFAULT_LEAD_CARD_LAYOUT;
  }
}

export function useLeadCardLayout() {
  const [layout, setLayout] = useState<LeadCardLayout>(DEFAULT_LEAD_CARD_LAYOUT);

  useEffect(() => {
    setLayout(read());
    const onChange = () => setLayout(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: LeadCardLayout) => {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
    setLayout(next);
  }, []);

  return { layout, update };
}
