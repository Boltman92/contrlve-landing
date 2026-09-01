import { env } from "cloudflare:workers";
import type { APIContext } from "astro";

/** Both the `Astro` page global and an endpoint's APIContext satisfy this. */
type SessionContext = Pick<APIContext, "cookies">;

/**
 * Session for /admin. Deliberately minimal: one shared password held as a
 * Cloudflare secret, exchanged for a signed, expiring, HttpOnly cookie.
 * There are no user accounts to manage and nothing sensitive behind it beyond
 * anonymous click counts.
 */

export const ADMIN_COOKIE = "clv_admin";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

/** Length-independent comparison, so a mismatch tells an attacker nothing. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Compare a fixed number of bytes either way; the length check is folded in
  // as a final difference rather than an early return.
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export function isPasswordCorrect(candidate: string): boolean {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(candidate, expected);
}

export async function createSession(context: SessionContext): Promise<void> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expires);
  const token = `${payload}.${await hmac(payload)}`;

  context.cookies.set(ADMIN_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function destroySession(context: SessionContext): void {
  context.cookies.delete(ADMIN_COOKIE, { path: "/" });
}

export async function hasValidSession(context: SessionContext): Promise<boolean> {
  const token = context.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;

  try {
    return timingSafeEqual(signature, await hmac(payload));
  } catch {
    // Secret missing or unusable — fail closed.
    return false;
  }
}
