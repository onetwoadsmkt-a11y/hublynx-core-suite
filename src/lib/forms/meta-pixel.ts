// Meta Pixel (Facebook) para o formulário público.
// Carregado apenas nas páginas /f/... e só quando a empresa informa o ID do
// pixel na aparência do formulário — cada empresa usa o próprio pixel.

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let initialized = false;

function loadPixelScript() {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq ??= fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

/** Inicializa o pixel e registra o PageView (uma vez por carregamento de página). */
export function initMetaPixel(pixelId: string | null | undefined) {
  const id = (pixelId ?? "").trim();
  if (typeof window === "undefined" || initialized || !/^\d{6,20}$/.test(id)) return;
  try {
    loadPixelScript();
    window.fbq?.("init", id);
    window.fbq?.("track", "PageView");
    initialized = true;
  } catch {
    // Bloqueadores de anúncio não podem impedir o formulário de funcionar.
  }
}

/**
 * Registra o evento Lead após o envio concluído com sucesso.
 * O eventID usa o token da submissão, permitindo deduplicar com a API de Conversões no futuro.
 */
export function trackMetaLead(
  eventId: string | null | undefined,
  params: Record<string, string | number | null | undefined> = {},
) {
  if (typeof window === "undefined" || !window.fbq) return;
  const data = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
  try {
    if (eventId) window.fbq("track", "Lead", data, { eventID: eventId });
    else window.fbq("track", "Lead", data);
  } catch {
    // Ignora falhas do pixel; o lead já foi salvo.
  }
}
