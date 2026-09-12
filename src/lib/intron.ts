// Server-side Intron Voice (Sahara) speech-to-text client.
// Mirrors the spec in /docs/intron-api-spec.md.
//
// Auth:  Authorization: Bearer INTRON_API_KEY
// Sync:  POST {base}/file/v1/upload/sync  (≤120s audio; 503 → poll {file_id})
// Async: POST {base}/file/v1/upload       → data.file_id
// Poll:  GET  {base}/file/v1/status/{file_id}
//        data.processing_status: FILE_QUEUED | FILE_PENDING | FILE_PROCESSING |
//                                 FILE_TRANSCRIBED | FILE_PROCESSING_FAILED
//        on FILE_TRANSCRIBED → data.audio_transcript
//
// MUST only be imported in server-side code (route handlers / convex actions).

export const INTRON_BASE_URL =
  process.env.INTRON_BASE_URL?.replace(/\/$/, "") ||
  "https://infer.voice.intron.io";

export const INTRON_API_KEY = process.env.INTRON_API_KEY ?? "";

export function isIntronConfigured(): boolean {
  return !!INTRON_API_KEY && INTRON_API_KEY.length > 8;
}

// Re-export the client-safe language list (canonical in src/lib/languages.ts).
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  languageLabel,
  type SttLanguage,
} from "@/lib/languages";

export interface IntronTranscribeResult {
  text: string;
  latencyMs: number;
  durationSec?: number | null;
  fileId?: string | null;
  provider: "sahara";
  /** how the result was obtained, for the audit trail */
  via: "sync" | "async-poll" | "sync-503-then-poll";
}

export interface IntronTranscribeInput {
  audioBlob: Blob | Buffer;
  fileName: string;
  language: string; // e.g. "lg", "sw", "en"
  /** hard ceiling for the polling loop, in ms (default ~100s) */
  pollTimeoutMs?: number;
}

const TERMINAL = new Set([
  "FILE_TRANSCRIBED",
  "FILE_PROCESSING_FAILED",
]);

/** Transcribe an audio file with Intron Voice.
 *  Strategy: try the sync endpoint first (fast path for ≤120s audio). If the
 *  server times out it returns 503 with a file_id - we then poll the async
 *  status endpoint for that file_id (no silent fallback to another model).
 *  If the sync endpoint rejects the audio as too long (400), we re-upload via
 *  the async endpoint and poll. */
export async function transcribeWithIntron(
  input: IntronTranscribeInput,
): Promise<IntronTranscribeResult> {
  if (!isIntronConfigured()) {
    throw new Error("Intron API key not configured (set INTRON_API_KEY)");
  }
  const start = Date.now();
  const base = INTRON_BASE_URL;

  // 1) Sync attempt.
  const syncRes = await fetch(`${base}/file/v1/upload/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${INTRON_API_KEY}` },
    body: buildMultipart(input),
  });

  if (syncRes.ok) {
    const json = (await syncRes.json()) as IntronStatusBody;
    return {
      text: json?.data?.audio_transcript ?? "",
      latencyMs: Date.now() - start,
      durationSec: json?.data?.processed_audio_duration_in_seconds ?? null,
      fileId: json?.data?.file_id ?? null,
      provider: "sahara",
      via: "sync",
    };
  }

  // 2) 503 → the sync request timed out but a file_id was queued for polling.
  if (syncRes.status === 503) {
    const body = (await syncRes.json().catch(() => null)) as IntronStatusBody | null;
    const fileId = body?.data?.file_id;
    if (fileId) {
      const polled = await pollStatus(fileId, input.pollTimeoutMs ?? 100_000);
      return {
        text: polled.text,
        latencyMs: Date.now() - start,
        durationSec: polled.durationSec,
        fileId,
        provider: "sahara",
        via: "sync-503-then-poll",
      };
    }
    throw new Error("Intron sync timed out (503) but no file_id was returned");
  }

  // 3) 400 (likely audio too long for sync) → fall back to async upload + poll.
  if (syncRes.status === 400) {
    const asyncRes = await fetch(`${base}/file/v1/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INTRON_API_KEY}` },
      body: buildMultipart(input),
    });
    if (!asyncRes.ok) {
      throw new Error(
        `Intron async upload failed (${asyncRes.status}): ${await safeText(asyncRes)}`,
      );
    }
    const json = (await asyncRes.json()) as IntronStatusBody;
    const fileId = json?.data?.file_id;
    if (!fileId) {
      throw new Error("Intron async upload returned no file_id");
    }
    const polled = await pollStatus(fileId, input.pollTimeoutMs ?? 100_000);
    return {
      text: polled.text,
      latencyMs: Date.now() - start,
      durationSec: polled.durationSec,
      fileId,
      provider: "sahara",
      via: "async-poll",
    };
  }

  // Any other error - surface safely (no key leakage).
  throw new Error(
    `Intron sync STT failed (${syncRes.status}): ${await safeText(syncRes)}`,
  );
}

/** Poll GET /file/v1/status/{file_id} until terminal. */
export async function pollStatus(
  fileId: string,
  timeoutMs = 100_000,
): Promise<{ text: string; durationSec: number | null }> {
  const deadline = Date.now() + timeoutMs;
  let delay = 1500;
  let lastStatus: string | undefined;
  while (Date.now() < deadline) {
    const res = await fetch(`${INTRON_BASE_URL}/file/v1/status/${fileId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${INTRON_API_KEY}` },
    });
    if (!res.ok) {
      throw new Error(`Intron status poll failed (${res.status}): ${await safeText(res)}`);
    }
    const json = (await res.json()) as IntronStatusBody;
    const status = json?.data?.processing_status;
    lastStatus = status;
    if (status === "FILE_TRANSCRIBED") {
      return {
        text: json?.data?.audio_transcript ?? "",
        durationSec: json?.data?.processed_audio_duration_in_seconds ?? null,
      };
    }
    if (status === "FILE_PROCESSING_FAILED") {
      throw new Error("Intron transcription failed (FILE_PROCESSING_FAILED)");
    }
    await sleep(delay);
    delay = Math.min(delay * 1.4, 5000); // gentle backoff, cap 5s
  }
  throw new Error(
    `Intron transcription did not complete within the timeout (last status: ${lastStatus ?? "unknown"})`,
  );
}

function buildMultipart(input: IntronTranscribeInput): FormData {
  const fd = new FormData();
  fd.append("audio_file_name", input.fileName);
  // Node 18+ FormData.append accepts Blob | string. Wrap a Buffer as a Blob.
  const blob =
    input.audioBlob instanceof Blob
      ? input.audioBlob
      : new Blob([input.audioBlob as Uint8Array], { type: "audio/wav" });
  fd.append("audio_file_blob", blob, input.fileName);
  fd.append("use_language_asr_input", input.language);
  // SautiSafe-specific tuning:
  //  - general category (default is telehealth, wrong for industrial safety)
  //  - disable Intron's LLM "corrections" so code-switched technical terms
  //    (pressure, valve, reactor) survive verbatim; we run our own extraction.
  fd.append("use_category", "file_category_general");
  fd.append("use_disable_llm_corrections", "TRUE");
  return fd;
}

interface IntronStatusBody {
  data?: {
    file_id?: string;
    processing_status?: string;
    audio_transcript?: string;
    processed_audio_duration_in_seconds?: number | null;
    audio_file_name?: string;
    use_language_asr_input?: string;
  };
  message?: string;
  status?: string;
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 300);
  } catch {
    return "<no body>";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
