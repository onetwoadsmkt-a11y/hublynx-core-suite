// Server-only: resolve cabeçalhos autenticados do Google.
import { googleAuthHeaders } from "@/server/googleOAuth.server";

export async function resolveGoogleHeaders(userId: string): Promise<Record<string, string>> {
  return googleAuthHeaders(userId);
}
