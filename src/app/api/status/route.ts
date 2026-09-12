import { NextResponse } from "next/server";
import { isIntronConfigured, INTRON_BASE_URL } from "@/lib/intron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/status — tells the UI which speech providers are configured.
 *  Never leaks the key itself — only a boolean + the public base URL. */
export async function GET() {
  return NextResponse.json({
    intron: {
      configured: isIntronConfigured(),
      baseUrl: INTRON_BASE_URL,
    },
    // z-ai ASR is always available in this Z-cloud test instance.
    zaiAsr: { available: true },
    pwa: true,
    offlineDrafts: true,
  });
}
