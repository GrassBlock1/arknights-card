import { useKV } from "nitro/kv";
// The managed API selects its backend through the target runtime's export conditions.
import { render, renderSvg, type FontLoader } from "takumi-js";
import type { CardProfile } from "../../shared/card.ts";
import { cardSizes, renderCardMarkup, safeImageUrl, type CardStyle } from "../../shared/card.ts";

export type CardFormat = "png" | "webp" | "svg";
let fontsPromise: Promise<FontLoader[]> | undefined;

function getFonts(): Promise<FontLoader[]> {
  return fontsPromise ??= (async (): Promise<FontLoader[]> => {
    const font = await useKV("assets:server").getItemRaw<Uint8Array>("fonts/NotoSansSC.ttf");
    if (!font) throw new Error("Bundled Noto Sans SC font is missing");
    return [
      { name: "Noto Sans SC", data: font, weight: 400, style: "normal" },
      { name: "Noto Sans SC", data: font, weight: 700, style: "normal" },
    ];
  })().catch((error) => {
    fontsPromise = undefined;
    throw error;
  });
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
  const [fonts, images] = await Promise.all([getFonts(), loadCardImages(profile)]);
  const available = new Set(images.map((image) => image.src));
  const palette = {
    accent: "#d4e954",
    background: "#0e1621",
    text: "#eaf0f6",
    panel: "#17212e",
    panelBorder: "#2b3847",
  };
  const markup = renderCardMarkup(profile, style, (url) => available.has(url) ? url : "", palette);
  const options = {
    ...cardSizes[style],
    images,
    fonts,
    fontFamilies: ["Noto Sans SC"],
    lang: "zh-CN",
    // Keep emoji in the font pipeline instead of downloading additional artwork.
    emoji: "from-font" as const,
  };
  if (format === "svg") {
    return new TextEncoder().encode(await renderSvg(markup, options));
  }
  return format === "png"
    ? render(markup, { ...options, format: "png" })
    : render(markup, { ...options, format: "webp" });
}
