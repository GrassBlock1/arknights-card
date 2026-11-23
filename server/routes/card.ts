import { defineHandler, HTTPError } from "nitro";
import { readBody, setResponseHeader } from "nitro/h3";
import { rejectSecretParameters, resolveCard } from "../utils/card-data";
import { renderImage } from "../utils/render-image";
import { cardCacheKey, cardImageCache } from "../utils/card-cache";
import { assertBindingAvailable } from "../utils/store";

export default defineHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  if (event.req.method !== "GET" && event.req.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }
  const query = Object.fromEntries(event.url.searchParams);
  rejectSecretParameters(query);
  let input: Record<string, unknown> = query;
  if (event.req.method === "POST") {
    const body: unknown = await readBody(event);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new HTTPError("Card input must be a JSON object", { status: 400 });
    }
    input = { ...query, ...body };
  }
  rejectSecretParameters(input);
  const style = input.style ?? "large";
  const format = input.format ?? "png";
  if (style !== "large" && style !== "compact") {
    throw new HTTPError("Style must be large or compact", { status: 400 });
  }
  if (format !== "png" && format !== "webp" && format !== "svg") {
    throw new HTTPError("Format must be png, webp or svg", { status: 400 });
  }
  const shareId = input.id ? (typeof input.id === "string" ? input.id : "") : undefined;
  if (shareId !== undefined) await assertBindingAvailable(shareId);
  const profile = await resolveCard(input);
  if (shareId !== undefined) await assertBindingAvailable(shareId);
  const key = cardCacheKey(input, profile, style, format);
  const { bytes, status } = await cardImageCache.getOrCreate(key, async () => {
    const bytes = await renderImage(profile, style, format);
    if (shareId !== undefined) await assertBindingAvailable(shareId);
    return bytes;
  });
  if (shareId !== undefined) await assertBindingAvailable(shareId);
  return new Response(bytes, {
    headers: {
      "Content-Type": format === "svg" ? "image/svg+xml; charset=utf-8" : `image/${format}`,
      "Content-Disposition": `inline; filename="arknights-${style}.${format}"`,
      "Cache-Control": "no-store",
      "X-Card-Cache": status,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
