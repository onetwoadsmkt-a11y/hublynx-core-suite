import { OAUTH_CALLBACK_PATH } from "./googleOAuth.server";

/** Origem pública do app (respeita proxy do preview). */
export function resolveOrigin(request: Request): string {
  const url = new URL(request.url);
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return url.origin;
}

export function resolveRedirectUri(request: Request): string {
  return new URL(OAUTH_CALLBACK_PATH, resolveOrigin(request)).toString();
}
