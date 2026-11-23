import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cardWidget } from "./widget/vite-plugin.ts";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cardWidget(), svelte(), cloudflare()],
});