// SautiSafe — in-Zcloud auth: demo OTP + stateless signed session cookie.
//
// There is no email/SMS gateway in the z-ai-web-dev-sdk, so for this prototype
// the OTP is also returned from /api/auth/request-otp (when DEMO_OTP_VISIBLE is
// true) and shown in the UI. Production would deliver it by email/SMS — the
// flow (hash-at-rest, single-use, expiry, attempt-limited) is real.
//
// Sessions are stateless: an httpOnly cookie holds a signed payload
// { uid, email, role, exp }. HMAC-SHA256 with AUTH_SECRET. No session table,
// no external service — everything stays in the Z cloud.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";

const COOKIE = "sautisafe_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    // Fall back to a per-process random secret so the app still boots in dev
    // without AUTH_SECRET — sessions just won't survive a restart.
    return process.env.AUTH_SECRET_FALLBACK || randomBytes(32).toString("hex");
  }
  return s;
}

export interface SessionUser {
  uid: string;
  email: string;
  role: string;
  name?: string | null;
}

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString("base64url");
}

function sign(payload: SessionUser & { exp: number }): string {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): SessionUser | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionUser & { exp: number };
    if (payload.exp && Date.now() > payload.exp) return null;
    return { uid: payload.uid, email: payload.email, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

/** Read + verify the session from the request cookie (server-only). */
export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  return verify(token);
}

/** Set the session cookie on the response. */
export async function setSessionCookie(user: SessionUser): Promise<void> {
  const c = await cookies();
  const token = sign({
    ...user,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clear the session cookie. */
export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Create a fresh 6-digit OTP for an identifier, invalidating prior codes.
 *  Returns the plain code (for demo display) — the stored row holds only the hash. */
export async function requestOtp(identifier: string): Promise<{ code: string }> {
  // Invalidate any unconsumed codes for this identifier.
  await db.otpCode.updateMany({
    where: { identifier, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.otpCode.create({
    data: {
      identifier,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return { code };
}

/** Verify a code for an identifier. On success, consume it + upsert the User
 *  + return the session user. Throws on invalid/expired/locked-out. */
export async function verifyOtp(identifier: string, code: string): Promise<SessionUser> {
  const row = await db.otpCode.findFirst({
    where: { identifier, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new Error("No active code — request a new one.");
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    throw new Error("Too many attempts — request a new code.");
  }
  if (Date.now() > row.expiresAt.getTime()) {
    await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    throw new Error("Code expired — request a new one.");
  }
  if (hashOtp(code) !== row.codeHash) {
    await db.otpCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    throw new Error("Wrong code.");
  }
  // Consume + upsert user.
  await db.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  const email = identifier.toLowerCase().trim();
  const user = await db.user.upsert({
    where: { email },
    create: { email, lastLoginAt: new Date() },
    update: { lastLoginAt: new Date() },
  });
  return { uid: user.id, email: user.email, role: user.role, name: user.name };
}

/** Gate helper for API routes: returns the user or null. Callers 401 on null. */
export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) {
    throw new UnauthorizedError();
  }
  return s;
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super("Unauthorized — please sign in.");
  }
}

export function isDemoOtpVisible(): boolean {
  return process.env.DEMO_OTP_VISIBLE === "true" || process.env.NODE_ENV !== "production";
}

export const AUTH_COOKIE_NAME = COOKIE;
