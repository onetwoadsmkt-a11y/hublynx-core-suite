/**
 * Ícone do app do portal de um projeto: logo do cliente no centro e o nome do
 * projeto embaixo, em fundo claro (cabe na área segura dos ícones "maskable").
 * Desenhado no navegador e devolvido como PNG em base64.
 */
export type AppIconInput = { logoUrl: string | null; name: string; ink: string; accent: string };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

export async function renderAppIcon(input: AppIconInput, size: number): Promise<string> {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  const u = size / 512;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  // faixa na cor da marca, embaixo (fora da área do texto)
  ctx.fillStyle = input.accent;
  ctx.fillRect(0, size - 26 * u, size, 26 * u);

  // área segura: círculo de 80% → trabalha num quadrado central de ~360px
  const safe = 340 * u;
  const top = (size - safe) / 2;
  const logoBox = { w: safe * 0.92, h: safe * 0.44 };
  const img = input.logoUrl ? await loadImage(input.logoUrl) : null;
  let textTop: number;
  if (img && img.width && img.height) {
    const r = Math.min(logoBox.w / img.width, logoBox.h / img.height);
    const w = img.width * r;
    const h = img.height * r;
    ctx.drawImage(img, (size - w) / 2, top + (logoBox.h - h) / 2, w, h);
    textTop = top + logoBox.h + 22 * u;
  } else {
    // sem logo: inicial grande na cor da marca
    ctx.fillStyle = input.accent;
    ctx.beginPath();
    ctx.arc(size / 2, top + logoBox.h / 2, logoBox.h / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(110 * u)}px Lexend, Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      (input.name.trim()[0] ?? "P").toUpperCase(),
      size / 2,
      top + logoBox.h / 2 + 4 * u,
    );
    textTop = top + logoBox.h + 22 * u;
  }

  // nome do projeto: até 3 linhas, fonte ajustada para caber
  ctx.fillStyle = input.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const maxW = safe * 0.98;
  const room = top + safe - textTop;
  let fs = 58;
  let lines: string[] = [];
  for (; fs >= 26; fs -= 2) {
    ctx.font = `700 ${Math.round(fs * u)}px Lexend, Inter, system-ui, sans-serif`;
    lines = wrap(ctx, input.name, maxW, 3);
    if (lines.length * fs * 1.15 * u <= room) break;
  }
  lines.forEach((l, i) => ctx.fillText(l, size / 2, textTop + i * fs * 1.15 * u));

  return c.toDataURL("image/png").split(",")[1] ?? "";
}
