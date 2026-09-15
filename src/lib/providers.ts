// Server-side OpenAI Whisper + Google Gemini speech-to-text provider lanes.
//
// These are the REAL provider implementations that replace the simulated
// degradation lanes in `/api/benchmark` once the owner supplies real keys.
// They mirror the structure of `src/lib/intron.ts` (the Intron/Sahara client):
//   - an `is<X>Configured()` guard,
//   - a `transcribeWith<X>(input)` async function,
//   - safe, secret-stripped `Error`s on failure (no key leakage),
//   - latency measured with `Date.now()` around the actual HTTP call.
//
// Environment variables:
//   OPENAI_API_KEY   - Bearer token for https://api.openai.com/v1/audio/transcriptions
//   GEMINI_API_KEY   - API key for https://generativelanguage.googleapis.com
//   GEMINI_MODEL     - Gemini model id; defaults to "gemini-3.5-flash"
//                      (the owner's required model for the benchmark lane).
//
// MUST only be imported in server-side code (route handlers / convex actions).
// We do not import the `server-only` package here - instead we rely on the
// fact that this file is only ever imported from route handlers (which never
// ship to the browser bundle) and that we only ever read process.env at call
// time. Mirrors the convention in `src/lib/intron.ts`.

// ──────────────────────────────────────────────────────────────────────────
// Shared result type
// ──────────────────────────────────────────────────────────────────────────

/** Output of a single STT provider call.
 *  `latencyMs` is wall-clock ms around the actual HTTP call (excluding any
 *  upstream storage fetch) so cross-provider latency comparison is fair.
 *  `language` and `wordCount` are optional because not every provider
 *  returns them (e.g. Gemini returns just text). */
export interface ProviderResult {
  text: string;
  latencyMs: number;
  language?: string | null;
  wordCount?: number | null;
}

export interface ProviderTranscribeInput {
  audioBlob: Blob | Buffer;
  fileName: string;
  language?: string; // ISO short code, e.g. "en", "sw", "lg"
}

// ──────────────────────────────────────────────────────────────────────────
// OpenAI Whisper
// ──────────────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_WHISPER_MODEL = "whisper-1";

export function isWhisperConfigured(): boolean {
  return !!OPENAI_API_KEY && OPENAI_API_KEY.length > 8;
}

/**
 * Transcribe an audio blob with OpenAI Whisper (whisper-1).
 *
 * POST https://api.openai.com/v1/audio/transcriptions
 *   Authorization: Bearer OPENAI_API_KEY
 *   multipart/form-data:
 *     file            - the audio blob
 *     model           - "whisper-1"
 *     response_format - "verbose_json" (gives text + language + duration)
 *     language        - optional ISO short code (e.g. "en"/"sw"). Whisper
 *                       supports fewer African languages than Intron does;
 *                       we pass it through anyway and let OpenAI reject it
 *                       if it is unsupported (the error is surfaced safely).
 *
 * Throws a safe, secret-stripped `Error` on failure (no key leakage).
 */
export async function transcribeWithWhisper(
  input: ProviderTranscribeInput,
): Promise<ProviderResult> {
  if (!isWhisperConfigured()) {
    throw new Error(
      "OpenAI Whisper not configured: set OPENAI_API_KEY (and ensure it is at least 9 chars).",
    );
  }
  const start = Date.now();
  const blob =
    input.audioBlob instanceof Blob
      ? input.audioBlob
      : new Blob([input.audioBlob as Uint8Array], { type: "audio/wav" });

  // Build the multipart form. We use the OpenAI-recommended field order.
  const form = new FormData();
  form.append("file", blob, input.fileName || "audio.wav");
  form.append("model", OPENAI_WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  if (input.language && input.language.trim().length > 0) {
    form.append("language", input.language.trim());
  }

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
  } catch (e) {
    throw new Error(`Whisper transcription network error: ${safeErr(e)}`);
  }

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(
      `Whisper API error (HTTP ${res.status}): ${body}`,
    );
  }

  // OpenAI normally returns application/json for verbose_json, but tolerate
  // text/plain responses too (their API has been known to ignore the param).
  const contentType = res.headers.get("content-type") ?? "";
  let text = "";
  let language: string | null = null;
  let wordCount: number | null = null;

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as Record<string, unknown>;
    text = pickString(data, ["text", "transcript"]);
    language = pickOptionalString(data, ["language", "lang"]) ?? null;
    // verbose_json exposes `words` (array) and/or `segments` - prefer the
    // words array length when present, else count from `text`.
    const words = data["words"];
    if (Array.isArray(words)) {
      wordCount = words.length;
    } else if (text) {
      wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    }
  } else {
    text = await res.text();
    if (text) {
      wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    }
  }

  return {
    text,
    latencyMs: Date.now() - start,
    language,
    wordCount,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Google Gemini (gemini-3.5-flash)
// ──────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
/** Default model - the owner's required model for the Gemini benchmark lane.
 *  Override with the GEMINI_MODEL env var. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY && GEMINI_API_KEY.length > 8;
}

/**
 * Transcribe an audio blob with Google Gemini's `generateContent` endpoint.
 *
 * POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=GEMINI_API_KEY
 *   body:
 *     {
 *       contents: [{
 *         parts: [
 *           { text: "Transcribe this audio verbatim, preserving any
 *                    code-switched English/technical terms exactly as spoken." },
 *           { inline_data: { mime_type: <audio mime>, data: <base64> } }
 *         ]
 *       }],
 *       generationConfig: { temperature: 0 }
 *     }
 *
 * The audio is base64-encoded via `Buffer.from(await audioBlob.arrayBuffer()).toString("base64")`.
 * mime_type falls back to `audio/wav` when the blob has no type.
 *
 * Response text is `candidates[0].content.parts[].text` joined (filtered for
 * empty parts). Throws a safe error on failure or when the model returns no
 * transcript (e.g. blocked by safety filters).
 */
export async function transcribeWithGemini(
  input: ProviderTranscribeInput,
): Promise<ProviderResult> {
  if (!isGeminiConfigured()) {
    throw new Error(
      "Google Gemini not configured: set GEMINI_API_KEY (and ensure it is at least 9 chars).",
    );
  }
  const start = Date.now();
  const model = GEMINI_MODEL;

  const audioBlob =
    input.audioBlob instanceof Blob
      ? input.audioBlob
      : new Blob([input.audioBlob as Uint8Array], { type: "audio/wav" });

  const mimeType = audioBlob.type && audioBlob.type.length > 0
    ? audioBlob.type
    : "audio/wav";

  // Base64-encode the audio. Node 18+ exposes Buffer; this is the exact
  // pattern requested by the orchestrator (Buffer.from(...).toString("base64")).
  let base64: string;
  try {
    base64 = Buffer.from(await audioBlob.arrayBuffer()).toString("base64");
  } catch (e) {
    throw new Error(`Gemini audio encoding failed: ${safeErr(e)}`);
  }

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              "Transcribe this audio verbatim, preserving any code-switched English/technical terms exactly as spoken.",
          },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  };

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    throw new Error(`Gemini transcription network error: ${safeErr(e)}`);
  }

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Gemini API error (HTTP ${res.status}): ${body}`);
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null;
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p) => (p && typeof p.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim()
    : "";

  if (!text) {
    const blocked = data?.candidates?.[0]?.finishReason;
    throw new Error(
      blocked
        ? `Gemini returned no transcript (finishReason: ${blocked}).`
        : "Gemini returned no transcript.",
    );
  }

  return {
    text,
    latencyMs: Date.now() - start,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Minimal shape of the Gemini `generateContent` response (only the fields
 *  we read). */
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

/** Pull a string out of a JSON object trying several common key names. */
function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function pickOptionalString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const v = pickString(obj, keys);
  return v ? v : undefined;
}

/** Read up to 300 chars of a response body for safe error messages. */
async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 300);
  } catch {
    return "<no body>";
  }
}

/** Extract a safe, leak-free message from an Error or thrown value.
 *  Strips anything that looks like a key (Authorization header, Bearer token,
 *  api_key=..., sk-... prefix) in case a provider echoes it back. */
function safeErr(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1***")
    .replace(/(sk-[A-Za-z0-9]{10,})/g, "sk-***")
    .replace(
      /(AIza[A-Za-z0-9_\-]{20,})/g,
      "AIza***",
    ) // Gemini key prefix
    .slice(0, 500);
}
