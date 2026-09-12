import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — returns the current session user or { user: null }. */
export async function GET() {
  const user = await getSession();
  return NextResponse.json({ user });
}
