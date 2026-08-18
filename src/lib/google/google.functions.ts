/**
 * Base das APIs do Google e helper de autenticação por usuário.
 * O token nunca sai do servidor: `googleHeaders` só resolve dentro de handlers.
 */
export const GOOGLE_API_BASE = "https://www.googleapis.com";

export async function googleHeaders(userId: string): Promise<Record<string, string>> {
  const { googleAuthHeaders } = await import("@/server/googleOAuth.server");
  return googleAuthHeaders(userId);
}
