import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  kv: {
    private: { driver: 'fs', base: process.env.CARD_DATA_DIR || './.data/private' },
  },
});
