import { NextResponse } from "next/server";
import { isIntronConfigured, INTRON_BASE_URL } from "@/lib/intron";
import { isWhisperConfigured, isGeminiConfigured } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/status — tells the UI which speech providers are configured.
 *  Never leaks the key itself — only booleans + the public Intron base URL. */
export async function GET() {
  return NextResponse.json({
    intron: { configured: isIntronConfigured(), baseUrl: INTRON_BASE_URL },
    whisper: { configured: isWhisperConfigured() },
    gemini: { configured: isGeminiConfigured(), model: process.env.GEMINI_MODEL || "gemini-3.8-flash" },
    zaiAsr: { available: true },
    pwa: true,
    offlineDrafts: true,
  });
}
