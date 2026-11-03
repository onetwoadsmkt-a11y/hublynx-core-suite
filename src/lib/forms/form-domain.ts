/**
 * Domínio dos formulários públicos: form.hublynx.com.br (o mesmo app do Core, ligado como
 * segundo domínio no Lovable). Nesse domínio só abrem os formulários (/f/...) e os arquivos
 * deles; qualquer outra página vai para o Core.
 */
export const FORM_HOST = "form.hublynx.com.br";
export const FORM_ORIGIN = `https://${FORM_HOST}`;
export const CORE_APP_ORIGIN = "https://core.hublynx.com.br";

/** Caminhos que o domínio de formulários atende (o resto vai para o Core). */
export function isFormDomainPath(pathname: string) {
  return (
    pathname.startsWith("/f/") ||
    pathname.startsWith("/api/public/form") ||
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/assets/") ||
    /\.(svg|png|jpe?g|webp|ico|js|css|woff2?|json|txt)$/i.test(pathname)
  );
}

export function isFormHost(hostname: string) {
  return hostname.toLowerCase() === FORM_HOST;
}

/** Slug "pid-endereco" → parte do endereço (usada para abrir links antigos do Lead Pro). */
export function slugPart(publicSlug: string) {
  const m = /^[A-Za-z0-9]+-(.+)$/.exec(publicSlug);
  return m ? m[1].toLowerCase() : null;
}
