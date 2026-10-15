/**
 * Paleta tirada do logo da empresa (no navegador, sem guardar nada no servidor).
 * - primary: a cor viva que mais aparece no logo (botões, etapa atual, progresso)
 * - ink: a cor escura do logo (títulos e detalhes); sem cor escura, um tom bem
 *   escuro da própria primary
 * Resultado fica em cache no navegador por endereço do logo.
 */
export type LogoPalette = { primary: string; ink: string };

const CACHE = "portal_logo_palette_v1";

function hex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function hsl(r: number, g: number, b: number) {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
  const max = Math.max(R, G, B),
    min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

function readCache(url: string): LogoPalette | null {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, LogoPalette>;
    return all[url] ?? null;
  } catch {
    return null;
  }
}

function writeCache(url: string, p: LogoPalette) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, LogoPalette>;
    all[url] = p;
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch {
    /* sem storage: recalcula na próxima vez */
  }
}

export function paletteFromPixels(data: Uint8ClampedArray): Partial<LogoPalette> {
  type Bucket = { n: number; r: number; g: number; b: number };
  const vivid = new Map<number, Bucket>();
  const dark = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const { s, l } = hsl(r, g, b);
    if (l > 0.93) continue; // fundo branco
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const target = s >= 0.35 && l >= 0.18 && l <= 0.82 ? vivid : l < 0.32 ? dark : null;
    if (!target) continue;
    const cur = target.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    target.set(key, cur);
  }
  const top = (m: Map<number, Bucket>) => {
    let best: Bucket | null = null;
    for (const v of m.values()) if (!best || v.n > best.n) best = v;
    return best && best.n >= 6 ? hex(best.r / best.n, best.g / best.n, best.b / best.n) : undefined;
  };
  return { primary: top(vivid), ink: top(dark) };
}

/** Lê o logo (precisa permitir CORS, como o armazenamento do Core). */
export function extractLogoPalette(url: string): Promise<Partial<LogoPalette>> {
  const cached = readCache(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 72;
        const ratio = Math.min(size / img.width, size / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve({});
        ctx.drawImage(img, 0, 0, w, h);
        const out = paletteFromPixels(ctx.getImageData(0, 0, w, h).data);
        if (out.primary) writeCache(url, { primary: out.primary, ink: out.ink ?? "" });
        resolve(out);
      } catch {
        resolve({}); // logo sem CORS: fica a cor cadastrada
      }
    };
    img.onerror = () => resolve({});
    img.src = url;
  });
}
