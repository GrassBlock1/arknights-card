import { createHash } from "node:crypto";
import { renderCardMarkup as renderSharedCard, safeImageUrl, type CardProfile, type CardStyle } from "../../shared/card.ts";
import type { CardPalette } from "../../shared/card.ts";
export type { CardStyle } from "../../shared/card.ts";
import { cardSizes, escapeHtml } from "../../shared/card.ts";
export { type CardProfile } from "../../shared/card.ts";

type ImageResolver = (url: string) => string;

export function renderCardMarkup(profile: CardProfile, style: CardStyle = "large", resolveImage: ImageResolver = safeImageUrl, palette: Partial<CardPalette> = {}): string {
  return renderSharedCard(profile, style, resolveImage, palette);
}

const resizeScript = `const frame=document.querySelector('.frame'),canvas=document.querySelector('.canvas');new ResizeObserver(([entry])=>{canvas.style.transform='scale('+entry.contentRect.width/canvas.offsetWidth+')'}).observe(frame);`;
export const embedScriptPolicy = `'sha256-${createHash("sha256").update(resizeScript).digest("base64")}'`;

export function renderHtml(profile: CardProfile, style: CardStyle = "large", resolveImage: ImageResolver = safeImageUrl): string {
  const { width, height } = cardSizes[style];
  const palette = { accent: "#d4e954", background: "#0e1621", text: "#eaf0f6", panel: "#17212e", panelBorder: "#2b3847" };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(profile.name)} · 罗德岛人事档案</title><style>*{box-sizing:border-box}html,body{margin:0;width:100%;background:transparent}.frame{position:relative;width:100%;max-width:${width}px;aspect-ratio:${width}/${height};overflow:hidden}.canvas{position:absolute;width:${width}px;height:${height}px;transform-origin:top left}</style></head><body><main class="frame" aria-label="${escapeHtml(profile.name)}的明日方舟名片"><div class="canvas">${renderCardMarkup(profile, style, resolveImage, palette)}</div></main><script>${resizeScript}</script></body></html>`;
}
