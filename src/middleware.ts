import { defineMiddleware } from "astro:middleware";
import { hasValidSession } from "./lib/auth";

/**
 * Guards /admin/*. Everything else returns immediately — this also runs at
 * build time while prerendering, where there is no request to authenticate.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/admin/login" || pathname === "/admin/login/";
  if (!isAdmin || isLogin) return next();

  if (await hasValidSession(context)) return next();

  const login = new URL("/admin/login", context.url);
  login.searchParams.set("next", pathname + context.url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: login.href, "Cache-Control": "no-store" },
  });
});
