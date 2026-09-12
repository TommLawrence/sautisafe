import { NextResponse } from "next/server";
import { requestOtp, isDemoOtpVisible } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/request-otp
 *  Body: { identifier: "user@example.com" }
 *  Returns { ok: true } and, in demo mode (no email gateway in the Z cloud),
 *  also { demoOtp } so the UI can surface it. */
export async function POST(req: Request) {
  try {
    const { identifier } = (await req.json()) as { identifier?: string };
    if (!identifier || !identifier.trim()) {
      return NextResponse.json({ error: "Email or phone is required" }, { status: 400 });
    }
    const id = identifier.trim();
    const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
    const looksPhone = /^[+]?[\d\s-]{7,}$/.test(id);
    if (!looksEmail && !looksPhone) {
      return NextResponse.json(
        { error: "Enter a valid email or phone number" },
        { status: 400 },
      );
    }
    const { code } = await requestOtp(looksEmail ? id.toLowerCase() : id);

    const body: { ok: true; demoOtp?: string; deliveredBy: string } = {
      ok: true,
      deliveredBy: isDemoOtpVisible() ? "screen (demo)" : "email/sms",
    };
    if (isDemoOtpVisible()) {
      body.demoOtp = code;
    }
    return NextResponse.json(body);
  } catch (e) {
    console.error("[/api/auth/request-otp]", e);
    return NextResponse.json(
      { error: "Could not send code", detail: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}
