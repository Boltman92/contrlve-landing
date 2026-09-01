Card posters for /events.

Drop an image here and reference it from the event's frontmatter, relative to
the Markdown file:

    cover: ../../assets/events/pesday.webp

Astro resizes and optimizes it at build time. The card frame is 9:16, matching
the usual story-format poster, so a 1080x1920 image shows in full. Other ratios
are centre-cropped to fit. An event without a `cover` falls back to the logo.

Save posters as .webp (sharp is available: quality 82 gave an 83% saving over
the source JPEG at identical resolution).
