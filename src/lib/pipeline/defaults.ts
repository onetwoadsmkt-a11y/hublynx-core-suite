export type StageSeed = {
  name: string;
  color: string;
  is_won?: boolean;
  is_lost?: boolean;
};

export const DEFAULT_STAGES: StageSeed[] = [
  { name: "Leads de entrada", color: "#94a3b8" },
  { name: "Lead site", color: "#38bdf8" },
  { name: "Lead form / Meta", color: "#6366f1" },
  { name: "1ª tentativa de contato", color: "#f59e0b" },
  { name: "Em negociação", color: "#a855f7" },
  { name: "Ganho", color: "#00D084", is_won: true },
  { name: "Perdido", color: "#ef4444", is_lost: true },
];

export const STAGE_COLORS = [
  "#94a3b8",
  "#38bdf8",
  "#6366f1",
  "#f59e0b",
  "#a855f7",
  "#00D084",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
];
