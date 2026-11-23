import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [nitro(), svelte()],
});
