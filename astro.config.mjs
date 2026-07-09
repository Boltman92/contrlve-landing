// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://contrlve.com.ua",
  adapter: cloudflare(),
  integrations: [sitemap()],
  devToolbar: {
    enabled: false,
  },
  outDir: "./dist",
});
