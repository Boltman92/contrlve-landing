// Central SEO / site config — single source of truth for the production domain
// and default metadata. Update the domain here only.
export const SITE_URL = "https://contrlve.com.ua";
export const SITE_NAME = "ШОУ КОНТРЛВЕ";
export const LOCALE = "uk_UA";

export const DEFAULT_TITLE = "ШОУ КОНТРЛВЕ";
export const DEFAULT_DESCRIPTION =
  "ШОУ КОНТРЛВЕ — українське гумористичне шоу. Офіційні правила, команди та нові випуски на YouTube.";

// 1200×630 social share card in /public — regenerate via scripts/generate-og.mjs.
export const DEFAULT_OG_IMAGE = "/og-image.jpg";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const YOUTUBE_URL =
  "https://www.youtube.com/playlist?list=PLLHZWI9bLm5mu2UvhLsH6l0CW0ejyKbCd";

// GA4 web stream. Public by design: it ships in every page's HTML.
export const GA_MEASUREMENT_ID = "G-KXS5JVNQ2F";
