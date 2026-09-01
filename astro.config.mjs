// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://contrlve.com.ua",
  adapter: cloudflare({
    // Optimize posters at build time with sharp and emit static files, instead
    // of the adapter's default runtime transforms through the Cloudflare Images
    // binding. /events is prerendered and has a handful of images, so this
    // serves them straight from the CDN with no Worker invocation and no
    // dependency on Cloudflare Images being enabled for the account.
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
