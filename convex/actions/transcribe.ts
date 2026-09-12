// SautiSafe — transcription provider actions (production Convex backend).
//
// Mirrors the live Next.js `/api/transcribe/*` routes 1:1. Each exported
// action has a JSDoc comment naming the live API route it replaces.
//
// CRITICAL COMPETITION REQUIREMENT — NO SILENT FALLBACK:
//   If a provider is not configured (missing env vars) the action MUST throw
//   a clear error rather than silently substituting another provider. The
//   benchmark UI must surface "provider not configured" honestly so the
//   owner never publishes a benchmark that was actually a different model.
//   Same applies inside `runBenchmark`: per-provider failures are recorded
//   with their real error message; we never retry on a different provider.

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import {
  computeAllMetrics,
  DEFAULT_CRITICAL_TERMS,
  type ProviderMetrics,
} from "../lib/metrics";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/** Single-provider transcription output. Mirrors live `/api/transcribe/:provider`. */
export interface TranscriptionResult {
  text: string;
  language?: string;
  durationMs?: number;
  latencyMs: number;
  confidence?: number;
}

/** One row of a benchmark result, including computed metrics + any error. */
export interface BenchmarkResult {
  provider: string;
  text: string;
  language?: string;
  confidence?: number;
  metrics: ProviderMetrics;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// transcribeWithProvider
// ──────────────────────────────────────────────────────────────────────────

/**
 * Transcribe one audio blob with one provider.
 *
 * Mirrors: live Next.js `POST /api/transcribe/:provider`.
 *
 * Supported providers:
 *   * "sahara"  — POST to SAHARA_TRANSCRIPTION_URL with Authorization: Bearer
 *                 SAHARA_API_KEY; expects JSON { transcript|text, language?,
 *                 durationMs?, confidence? }.
 *   * "whisper" — OpenAI Whisper (https://api.openai.com/v1/audio/transcriptions)
 *                 with verbose_json response; needs OPENAI_API_KEY.
 *   * "gemini"  — Google Gemini `generateContent` with inline audio data;
 *                 needs GEMINI_API_KEY. Model is GEMINI_MODEL or "gemini-2.0-flash".
 *
 * If a required env var is missing, throws a clear `Error("provider not
 * configured: set <VAR>")` so the UI can surface the real reason.
 *
 * `latencyMs` is measured with Date.now() around the actual HTTP call,
 * excluding storage fetch time so cross-provider latency comparison is fair.
 *
 * All provider errors are wrapped in a human-readable message; no secrets
 * (API keys, full URLs) are leaked in the thrown error.
 */
export const transcribeWithProvider = action({
  args: {
    audioStorageId: v.id("_storage"),
    provider: v.string(),
  },
  handler: async (ctx, { audioStorageId, provider }): Promise<TranscriptionResult> => {
    // Fetch the audio blob once, before switching on provider. This throws
    // cleanly if the blob doesn't exist.
    const blob = await ctx.storage.get(audioStorageId);
    if (!blob) {
      throw new Error(`Audio blob ${audioStorageId} not found in storage.`);
    }

    switch (provider) {
      case "sahara":
        return await transcribeSahara(blob);
      case "whisper":
        return await transcribeWhisper(blob);
      case "gemini":
        return await transcribeGemini(blob);
      default:
        throw new Error(
          `Unknown transcription provider "${provider}". Supported: sahara, whisper, gemini.`,
        );
    }
  },
});

// ──────────────────────────────────────────────────────────────────────────
// runBenchmark
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run multiple providers on the same audio + reference transcript and
 * compute per-provider metrics.
 *
 * Mirrors: live Next.js `POST /api/benchmark/run`.
 *
 * Providers are run sequentially to keep the implementation simple and to
 * avoid hammering paid APIs with concurrent requests. Each provider's
 * success or failure is recorded in the results array; failures do NOT
 * abort the whole run (the benchmark UI shows partial results), but they
 * are recorded with the real error message — never silently substituted.
 *
 * The returned `BenchmarkResult[]` is what the client should pass (as JSON)
 * to `benchmark.saveBenchmarkRun` for persistence.
 *
 * @param audioStorageId      Storage id of the audio to transcribe.
 * @param referenceTranscript Human-confirmed reference transcript.
 * @param providers           ["sahara", "whisper", "gemini", ...].
 * @param criticalTerms       Optional override for the critical-terms list
 *                            used in criticalTermRecall. Defaults to
 *                            DEFAULT_CRITICAL_TERMS from convex/lib/metrics.
 */
export const runBenchmark = action({
  args: {
    audioStorageId: v.id("_storage"),
    referenceTranscript: v.string(),
    providers: v.array(v.string()),
    criticalTerms: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<BenchmarkResult[]> => {
    const results: BenchmarkResult[] = [];

    for (const provider of args.providers) {
      try {
        // Cross-action call so each provider runs in its own action context
        // (cleaner errors, isolated Date.now() latency measurement).
        const tr = await ctx.runAction(api.actions.transcribe.transcribeWithProvider, {
          audioStorageId: args.audioStorageId,
          provider,
        });

        const metrics = computeAllMetrics(args.referenceTranscript, tr.text, {
          criticalTerms: args.criticalTerms ?? DEFAULT_CRITICAL_TERMS,
          latencyMs: tr.latencyMs,
        });

        results.push({
          provider,
          text: tr.text,
          language: tr.language,
          confidence: tr.confidence,
          metrics,
          error: null,
        });
      } catch (err) {
        // No silent fallback. Record the real error; metrics are degenerate
        // so the dashboard ranks this provider last honestly.
        results.push({
          provider,
          text: "",
          language: undefined,
          confidence: undefined,
          metrics: {
            wer: 1,
            cer: 1,
            criticalTermRecall: 0,
            wordCount: 0,
            latencyMs: 0,
          },
          error: safeErrorMessage(err),
        });
      }
    }

    return results;
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Provider implementations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sahara ASR — internal/private provider, configured by the deployment.
 *
 * POST multipart/form-data (field name `audio`) to SAHARA_TRANSCRIPTION_URL
 * with `Authorization: Bearer ${SAHARA_API_KEY}`. Response is JSON. We
 * accept several common field names for the transcript so we tolerate
 * minor schema drift in the Sahara service.
 */
async function transcribeSahara(blob: Blob): Promise<TranscriptionResult> {
  const url = process.env.SAHARA_TRANSCRIPTION_URL;
  const key = process.env.SAHARA_API_KEY;
  if (!url || !key) {
    throw new Error(
      "Sahara transcription provider not configured: set SAHARA_TRANSCRIPTION_URL and SAHARA_API_KEY.",
    );
  }

  const start = Date.now();
  try {
    const form = new FormData();
    form.append("audio", blob, "audio.webm");

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Sahara API error HTTP ${res.status}: ${truncate(body)}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const text = pickString(data, ["transcript", "text", "result"]);
    if (!text) {
      throw new Error("Sahara API returned no transcript text.");
    }

    return {
      text,
      language: pickOptionalString(data, ["language", "lang"]),
      durationMs: pickOptionalNumber(data, ["durationMs", "duration_ms", "durationMs"]),
      latencyMs: Date.now() - start,
      confidence: pickOptionalNumber(data, ["confidence", "score"]),
    };
  } catch (err) {
    throw new Error(`Sahara transcription failed: ${safeErrorMessage(err)}`);
  }
}

/**
 * OpenAI Whisper — https://api.openai.com/v1/audio/transcriptions.
 *
 * Uses verbose_json response_format so we get language + duration. Falls
 * back to plain-text parsing if the API returns text/plain.
 */
async function transcribeWhisper(blob: Blob): Promise<TranscriptionResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OpenAI Whisper provider not configured: set OPENAI_API_KEY.");
  }

  const start = Date.now();
  try {
    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", process.env.OPENAI_WHISPER_MODEL ?? "whisper-1");
    form.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI Whisper API error HTTP ${res.status}: ${truncate(body)}`);
    }

    // verbose_json returns { text, language, duration, ... }. The OpenAI API
    // sometimes returns plain text when response_format is not honoured;
    // tolerate both.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as Record<string, unknown>;
      const text = pickString(data, ["text", "transcript"]);
      return {
        text,
        language: pickOptionalString(data, ["language", "lang"]),
        durationMs: pickOptionalNumber(data, ["duration"])
          ? Math.round((pickOptionalNumber(data, ["duration"]) as number) * 1000)
          : undefined,
        latencyMs: Date.now() - start,
      };
    } else {
      const text = await res.text();
      return { text, latencyMs: Date.now() - start };
    }
  } catch (err) {
    throw new Error(`Whisper transcription failed: ${safeErrorMessage(err)}`);
  }
}

/**
 * Google Gemini — generative `generateContent` with inline audio data.
 *
 * Uses the gemini-2.0-flash model by default (override with GEMINI_MODEL).
 * Sends the audio as base64 inline_data and prompts the model to transcribe
 * verbatim, returning only the transcript text.
 */
async function transcribeGemini(blob: Blob): Promise<TranscriptionResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Google Gemini provider not configured: set GEMINI_API_KEY.");
  }

  const start = Date.now();
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const base64 = bufferToBase64(buf);
    const mimeType = blob.type && blob.type.length > 0 ? blob.type : "audio/webm";
    const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const body = {
      contents: [
        {
          parts: [
            {
              text:
                "Transcribe this audio verbatim. Output only the transcript text, " +
                "no preamble, no markdown, no commentary. Preserve code-switched tokens.",
            },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "text/plain",
      },
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Gemini API error HTTP ${res.status}: ${truncate(t)}`);
    }

    const data = (await res.json()) as GeminiResponse;
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("\n")
        .trim() ?? "";

    if (!text) {
      // The model may refuse or return empty; surface this honestly.
      const blocked = data?.candidates?.[0]?.finishReason;
      throw new Error(
        blocked ? `Gemini returned no transcript (finishReason: ${blocked}).` : "Gemini returned no transcript.",
      );
    }

    return {
      text,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    throw new Error(`Gemini transcription failed: ${safeErrorMessage(err)}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Pull a string out of a JSON object trying several common key names. */
function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
    // Allow nested "data.transcript"-style keys.
    if (k.includes(".")) {
      const v2 = k.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
        return undefined;
      }, obj);
      if (typeof v2 === "string" && v2.length > 0) return v2;
    }
  }
  return "";
}

function pickOptionalString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const v = pickString(obj, keys);
  return v ? v : undefined;
}

function pickOptionalNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

/** Convert a Uint8Array to a base64 string without leaking into btoa errors. */
function bufferToBase64(buf: Uint8Array): string {
  // Convex actions run in a Node-like runtime that exposes Buffer.
  // We use the smallest possible slice loop to keep memory low for big files.
  let binary = "";
  const CHUNK = 0x8000; // 32k chars per push to avoid call-stack limits.
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(buf.subarray(i, i + CHUNK)),
    );
  }
  return btoa(binary);
}

/** Truncate a response body so error messages stay readable. */
function truncate(s: string): string {
  const MAX = 200;
  return s.length > MAX ? `${s.slice(0, MAX)}… (${s.length} bytes)` : s;
}

/**
 * Extract a safe, leak-free message from an Error or thrown value.
 * Strips anything that looks like a key (Authorization header, Bearer token,
 * api_key=...) just in case a provider echoes it back.
 */
function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // Strip obvious secrets.
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1***")
    .replace(/(sk-[A-Za-z0-9]{10,})/g, "sk-***")
    .slice(0, 500);
}

// Minimal type for the Gemini response (only the fields we read).
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}
