import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
  // Workers: set preset: "cloudflare_module" or build with NITRO_PRESET=cloudflare_module.
  // Replace the private fs mount below with:
  // private: { driver: "cloudflare-kv-binding", binding: "CARD_PRIVATE" }
  // Create a KV namespace, then add this top-level configuration using its actual ID:
  // cloudflare: {
  //   wrangler: { kv_namespaces: [{ binding: "CARD_PRIVATE", id: "<namespace-id>" }] },
  // },
  // Workers KV is eventually consistent; session updates and revocations can propagate with delay.
  // Set CARD_ENCRYPTION_KEY as a Worker secret in the Cloudflare dashboard or, after building:
  // pnpm exec wrangler secret put CARD_ENCRYPTION_KEY --config .output/server/wrangler.json
  // The value must be a base64-encoded 32-byte key. Keep it stable to decrypt existing data.
  // To migrate Node data, use the base64 encoding of CARD_DATA_DIR/encryption.key.
  // Do not put the key in cloudflare.wrangler.vars or commit it to source control.
  // Workers require this secret; only Node falls back to CARD_DATA_DIR/encryption.key.
  // Workers' temporary filesystem is not persistent storage for private data or encryption keys.
  kv: {
    private: { driver: 'fs', base: process.env.CARD_DATA_DIR || './.data/private' },
  },
});
