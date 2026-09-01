// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://contrlve.com.ua",
  adapter: cloudflare({
    // Build-time sharp optimization for prerendered pages, and no dependency on
    // Cloudflare Images being enabled for the account.
    //
    // /events is rendered on demand (its list depends on /admin/visibility), so
    // its posters are not resized at build time: the adapter serves the original
    // file through /_image for every srcset width. That is one Worker hit per
    // poster, cached immutably for a year, and ~100 KB per poster instead of a
    // per-width variant. Switch this to { runtime: "cloudflare-binding" } to get
    // real transforms back, at the cost of requiring Cloudflare Images.
    imageService: "compile",
  }),
  integrations: [
    sitemap({
      // On-demand routes are still enumerated in server mode, so the admin
      // dashboard and the tracked ticket redirects have to be excluded here as
      // well as in robots.txt.
      filter: (page) => !/\/(admin|go)(\/|$)/.test(new URL(page).pathname),
    }),
  ],
  devToolbar: {
    enabled: false,
  },
  outDir: "./dist",
});
