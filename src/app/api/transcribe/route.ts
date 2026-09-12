import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/zai";
import { ACCEPTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/audio-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/transcribe
 *  Receives an audio file (FormData), transcribes it with the Z cloud ASR
 *  (acting as the Sahara proxy for testing), and returns { text, latencyMs }.
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
    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");

    const { text, latencyMs } = await transcribeAudio(base64);

    return NextResponse.json({
      text,
      latencyMs,
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
