import { NextResponse } from "next/server";
import { verifyOtp, setSessionCookie, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/verify-otp
 *  Body: { identifier, code }
 *  On success: sets an httpOnly signed session cookie + returns { user }. */
export async function POST(req: Request) {
  try {
    const { identifier, code } = (await req.json()) as { identifier?: string; code?: string };
    if (!identifier || !code) {
      return NextResponse.json({ error: "Identifier and code are required" }, { status: 400 });
    }
    const id = identifier.trim();
    const user = await verifyOtp(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) ? id.toLowerCase() : id,
      code.trim(),
    );
    await setSessionCookie(user);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    // Bad code / expired / locked out — these are 400, not 401, so the UI
    // can show the message rather than redirect to login.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed" },
      { status: 400 },
    );
  }
}
