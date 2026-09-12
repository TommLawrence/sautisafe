import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/zai";
import {
  isIntronConfigured,
  transcribeWithIntron,
} from "@/lib/intron";
import { ACCEPTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/audio-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/transcribe
 *  Body (FormData): audio, mimeType?, language?  (language defaults to "lg")
 *
 *  Uses the REAL Intron Voice (Sahara) STT when INTRON_API_KEY is set, via the
 *  sync endpoint with a 503/400 → async-poll fallback. When no key is present
 *  in this test environment it transparently falls back to the z-ai ASR proxy
 *  (the response always tells the client which provider ran).
 *  Mirrors convex/actions/transcribe.ts → transcribeWithProvider("sahara"). */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio file too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` },
        { status: 413 },
      );
    }
    const declaredMime = (form.get("mimeType") as string) || file.type || "audio/wav";
    const okMime =
      ACCEPTED_AUDIO_TYPES.includes(declaredMime) ||
      ACCEPTED_AUDIO_TYPES.includes(file.type);
    if (!okMime) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${declaredMime}` },
        { status: 415 },
      );
    }
    const language = (form.get("language") as string) || "lg";

    const audioBlob = new Blob([new Uint8Array(await file.arrayBuffer())], {
      type: declaredMime,
    });

    // 1) Real Intron (Sahara) — preferred.
    if (isIntronConfigured()) {
      try {
        const result = await transcribeWithIntron({
          audioBlob,
          fileName: file.name || "recording.wav",
          language,
        });
        return NextResponse.json({
          text: result.text,
          latencyMs: result.latencyMs,
          durationSec: result.durationSec,
          provider: "sahara",
          via: result.via,
          language,
          wordCount: result.text.split(/\s+/).filter(Boolean).length,
        });
      } catch (e) {
        // In product mode a transparent retry on another provider is allowed.
        // Log and fall through to the z-ai ASR proxy, but tag it clearly so the
        // client/supervisor knows the Sahara lane did not run.
        console.error("[/api/transcribe] Intron failed, falling back to z-ai ASR:", safeErr(e));
      }
    }

    // 2) Fallback (test env with no Intron key, or Intron error): z-ai ASR.
    const bytes = Buffer.from(await audioBlob.arrayBuffer());
    const base64 = bytes.toString("base64");
    const { text, latencyMs } = await transcribeAudio(base64);
    return NextResponse.json({
      text,
      latencyMs,
      provider: "zai-asr",
      via: isIntronConfigured() ? "fallback-after-intron-error" : "no-intron-key",
      language,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    });
  } catch (e) {
    console.error("[/api/transcribe] error", e);
    return NextResponse.json(
      { error: "Transcription failed", detail: safeErr(e) },
      { status: 500 },
    );
  }
}

function safeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}
