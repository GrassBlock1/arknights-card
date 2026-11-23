import { useKV } from "nitro/kv";
import { Renderer } from "takumi-js/node";
import type { CardProfile } from "./card-data";
import { cardSizes, renderCardMarkup, safeImageUrl, type CardStyle } from "./render-html";

export type CardFormat = "png" | "webp" | "svg";
let rendererPromise: Promise<Renderer> | undefined;

async function getRenderer(): Promise<Renderer> {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const renderer = new Renderer();
      const font = await useKV("assets:server").getItemRaw<Uint8Array>("fonts/NotoSansSC.ttf");
      if (!font) throw new Error("Bundled Noto Sans SC font is missing");
      const data = Buffer.from(font.buffer, font.byteOffset, font.byteLength);
      await renderer.registerFont({ name: "Noto Sans SC", data, weight: 400, style: "normal" });
      await renderer.registerFont({ name: "Noto Sans SC", data, weight: 700, style: "normal" });
      return renderer;
    })().catch((error) => {
      rendererPromise = undefined;
      throw error;
    });
  }
  return rendererPromise;
}

async function fetchCardImage(src: string): Promise<{ src: string; data: Uint8Array; mime: string } | null> {
  if (!src) return null;
  try {
    const response = await fetch(src, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: "image/png,image/webp,image/jpeg" },
    });
    if (!response.ok || !response.body) return null;
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const maxBytes = 8 * 1024 * 1024;
    if (!mime || !["image/png", "image/webp", "image/jpeg"].includes(mime) ||
      Number(response.headers.get("content-length")) > maxBytes) {
      await response.body.cancel();
      return null;
    }
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { src, data, mime };
  } catch {
    // Remote artwork is optional; the card retains its text and portrait placeholder.
    return null;
  }
}

export async function loadCardImages(profile: CardProfile) {
  const sources = new Set([
    profile.avatar,
    profile.secretary.portrait || profile.secretary.avatar,
    profile.secretary.avatar,
    ...profile.assists.flatMap((assist) => [assist.avatar, assist.skillIcon]),
  ].map(safeImageUrl).filter(Boolean));
  const loaded = await Promise.all([...sources].map(fetchCardImage));
  return loaded.filter((image): image is NonNullable<typeof image> => image !== null);
}

export async function renderImage(profile: CardProfile, style: CardStyle = "large", format: CardFormat = "png"): Promise<Uint8Array<ArrayBuffer>> {
  const [renderer, images] = await Promise.all([getRenderer(), loadCardImages(profile)]);
  const available = new Set(images.map((image) => image.src));
  const markup = renderCardMarkup(profile, style, (url) => available.has(url) ? url : "");
  if (format === "svg") {
    const svg = await renderer.renderSvg(markup, {
      ...cardSizes[style],
      images,
      fontFamilies: ["Noto Sans SC"],
      lang: "zh-CN",
    });
    return new TextEncoder().encode(svg);
  }
  return renderer.render(markup, {
    ...cardSizes[style],
    format,
    images,
    fontFamilies: ["Noto Sans SC"],
    lang: "zh-CN",
  });
}
