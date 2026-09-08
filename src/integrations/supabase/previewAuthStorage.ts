// Storage simples baseado em localStorage.
// O postMessage para o editor Lovable foi removido porque o projeto agora usa
// Supabase externo e não depende mais do preview broker do Lovable Cloud.
export function brokeredPreviewStorage() {
  if (typeof window === "undefined") return undefined;
  return localStorage;
}
