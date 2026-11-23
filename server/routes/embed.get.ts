import { defineHandler, HTTPError } from "nitro";
import { resolveCard } from "../utils/card-data";
import { embedScriptPolicy, renderHtml } from "../utils/render-html";
import { loadCardImages } from "../utils/render-image";

export default defineHandler(async (event) => {
  const input = Object.fromEntries(event.url.searchParams);
  const style = input.style ?? "large";
  if (style !== "large" && style !== "compact") {
    throw new HTTPError("Style must be large or compact", { status: 400 });
  }
  const profile = await resolveCard(input);
  const images = await loadCardImages(profile);
  const embedded = new Map(images.map(({ src, data, mime }) => [src, `data:${mime};base64,${Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64")}`]));
  return new Response(renderHtml(profile, style, (url) => embedded.get(url) ?? ""), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src ${embedScriptPolicy}; base-uri 'none'; form-action 'none'; frame-ancestors *`,
    },
  });
});
