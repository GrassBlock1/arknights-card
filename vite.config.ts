import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cardWidget } from "./widget/vite-plugin.ts";

export default defineConfig({
  plugins: [cardWidget(), nitro(), svelte()],
});
