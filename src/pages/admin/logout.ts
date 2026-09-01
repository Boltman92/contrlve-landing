import type { APIContext } from "astro";
import { destroySession } from "../../lib/auth";

export const prerender = false;

export function GET(context: APIContext): Response {
  destroySession(context);
  return new Response(null, {
    status: 302,
    headers: { Location: "/admin/login", "Cache-Control": "no-store" },
  });
}
