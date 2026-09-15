"use node";

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
 *   * "sahara"  — Intron Voice (https://infer.voice.intron.io). POST
 *                 /file/v1/upload/sync (multipart: audio_file_name,
 *                 audio_file_blob, use_language_asr_input, use_category,
 *                 use_disable_llm_corrections); on HTTP 503 it polls
 *                 GET /file/v1/status/{file_id}; on HTTP 400 (audio too
 *                 long for sync) it re-uploads via /file/v1/upload and
 *                 polls. Needs INTRON_API_KEY (alias SAHARA_API_KEY).
 *   * "whisper" — OpenAI Whisper (https://api.openai.com/v1/audio/transcriptions)
 *                 with verbose_json response; needs OPENAI_API_KEY.
 *   * "gemini"  — Google Gemini `generateContent` with inline audio data;
 *                 needs GEMINI_API_KEY. Model is GEMINI_MODEL or "gemini-3.5-flash".
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
    language: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { audioStorageId, provider, language },
  ): Promise<TranscriptionResult> => {
    // Fetch the audio blob once, before switching on provider. This throws
    // cleanly if the blob doesn't exist.
    const blob = await ctx.storage.get(audioStorageId);
    if (!blob) {
      throw new Error(`Audio blob ${audioStorageId} not found in storage.`);
    }
    // Convex File Storage does NOT preserve Content-Type on the Blob object
    // (blob.type is empty). Read it from the _storage system metadata and
    // graft it onto the blob so the providers get the right MIME -> extension.
    const meta = await ctx.runQuery(api.audio.getAudioMeta, { storageId: audioStorageId });
    const contentType = meta?.contentType ?? "audio/wav";
    const blobWithType = contentType && !blob.type
      ? new Blob([await blob.arrayBuffer()], { type: contentType })
      : blob;
    const lang = normalizeSaharaLanguage(language);

    switch (provider) {
      case "sahara":
        return await transcribeSahara(blobWithType, lang);
      case "whisper":
        return await transcribeWhisper(blobWithType);
      case "gemini":
        return await transcribeGemini(blobWithType);
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
    language: v.optional(v.string()),
    criticalTerms: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<BenchmarkResult[]> => {
    const results: BenchmarkResult[] = [];
    const lang = normalizeSaharaLanguage(args.language);

    for (const provider of args.providers) {
      try {
        // Cross-action call so each provider runs in its own action context
        // (cleaner errors, isolated Date.now() latency measurement).
        const tr = await ctx.runAction(api.actions.transcribe.transcribeWithProvider, {
          audioStorageId: args.audioStorageId,
          provider,
          language: lang,
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
 * Sahara ASR — the Intron Voice API (https://infer.voice.intron.io).
 *
 * Flow (mirrors the live src/lib/intron.ts):
 *  1. POST /file/v1/upload/sync (multipart: audio_file_name, audio_file_blob,
 *     use_language_asr_input=<lang>, use_category=file_category_general,
 *     use_disable_llm_corrections=TRUE). 200 → return data.audio_transcript.
 *  2. 503 (sync timeout) → the body carries data.file_id; poll
 *     GET /file/v1/status/{file_id} until FILE_TRANSCRIBED.
 *  3. 400 (audio too long for sync) → re-upload via /file/v1/upload and poll.
 *
 * Needs INTRON_API_KEY (SAHARA_API_KEY alias) and optionally INTRON_BASE_URL
 * (SAHARA_TRANSCRIPTION_URL alias, for on-prem/relay). No silent fallback:
 * if the key is missing the action throws a clear error.
 */
async function transcribeSahara(
  blob: Blob,
  language: string,
): Promise<TranscriptionResult> {
  const base = (
    process.env.INTRON_BASE_URL ||
    process.env.SAHARA_TRANSCRIPTION_URL ||
    "https://infer.voice.intron.io"
  ).replace(/\/$/, "");
  const key = process.env.INTRON_API_KEY || process.env.SAHARA_API_KEY;
  if (!key) {
    throw new Error(
      "Sahara (Intron) not configured: set INTRON_API_KEY (and optionally INTRON_BASE_URL).",
    );
  }

  const start = Date.now();
  const fileName = "sautisafe." + audioExtensionFor(blob.type);
  const buildForm = () => {
    const form = new FormData();
    form.append("audio_file_name", fileName);
    form.append("audio_file_blob", blob, fileName);
    form.append("use_language_asr_input", language);
    // SautiSafe tuning: general category (default is telehealth), and disable
    // Intron's LLM "corrections" so code-switched technical terms survive
    // verbatim (we run our own safety extraction separately).
    form.append("use_category", "file_category_general");
    form.append("use_disable_llm_corrections", "TRUE");
    return form;
  };

  try {
    const syncRes = await fetch(`${base}/file/v1/upload/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: buildForm(),
    });

    if (syncRes.ok) {
      const j = (await syncRes.json()) as { data?: IntronStatusData };
      const d = j?.data;
      return {
        text: d?.audio_transcript ?? "",
        language: d?.use_language_asr_input ?? language,
        durationMs: d?.processed_audio_duration_in_seconds
          ? Math.round(d.processed_audio_duration_in_seconds * 1000)
          : undefined,
        latencyMs: Date.now() - start,
      };
    }

    // 503 — sync timed out but a file_id was queued: poll it (no fallback).
    if (syncRes.status === 503) {
      const body = (await syncRes.json().catch(() => null)) as { data?: IntronStatusData } | null;
      const fileId = body?.data?.file_id;
      if (fileId) {
        return await pollIntronStatus(fileId, base, key, language, start);
      }
      throw new Error("Sahara sync timed out (503) but no file_id was returned.");
    }

    // 400 — audio too long for sync: re-upload async and poll.
    if (syncRes.status === 400) {
      const asyncRes = await fetch(`${base}/file/v1/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: buildForm(),
      });
      if (!asyncRes.ok) {
        const t = await asyncRes.text().catch(() => "");
        throw new Error(`Sahara async upload failed (HTTP ${asyncRes.status}): ${truncate(t)}`);
      }
      const j = (await asyncRes.json()) as { data?: IntronStatusData };
      const fileId = j?.data?.file_id;
      if (!fileId) {
        throw new Error("Sahara async upload returned no file_id.");
      }
      return await pollIntronStatus(fileId, base, key, language, start);
    }

    const body = await syncRes.text().catch(() => "");
    throw new Error(`Sahara sync STT failed (HTTP ${syncRes.status}): ${truncate(body)}`);
  } catch (err) {
    throw new Error(`Sahara transcription failed: ${safeErrorMessage(err)}`);
  }
}

/** Poll GET /file/v1/status/{file_id} until a terminal status. */
async function pollIntronStatus(
  fileId: string,
  base: string,
  key: string,
  language: string,
  start: number,
): Promise<TranscriptionResult> {
  const deadline = Date.now() + 100_000;
  let delay = 1500;
  let lastStatus: string | undefined;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/file/v1/status/${fileId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      throw new Error(`Sahara status poll failed (HTTP ${res.status})`);
    }
    const j = (await res.json()) as { data?: IntronStatusData };
    const d = j?.data;
    const status = d?.processing_status;
    lastStatus = status;
    if (status === "FILE_TRANSCRIBED") {
      return {
        text: d?.audio_transcript ?? "",
        language: d?.use_language_asr_input ?? language,
        durationMs: d?.processed_audio_duration_in_seconds
          ? Math.round(d.processed_audio_duration_in_seconds * 1000)
          : undefined,
        latencyMs: Date.now() - start,
      };
    }
    if (status === "FILE_PROCESSING_FAILED") {
      throw new Error("Sahara transcription failed (FILE_PROCESSING_FAILED)");
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 5000);
  }
  throw new Error(
    `Sahara transcription did not complete within the timeout (last status: ${lastStatus ?? "unknown"})`,
  );
}

/** Shape of the Intron status/result response `data` field. */
interface IntronStatusData {
  file_id?: string;
  processing_status?: string;
  audio_transcript?: string;
  processed_audio_duration_in_seconds?: number | null;
  audio_file_name?: string;
  use_language_asr_input?: string;
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
    form.append("file", blob, "audio." + audioExtensionFor(blob.type));
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
 * Uses the gemini-3.5-flash model by default (override with GEMINI_MODEL).
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
    const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
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

/** Map an audio MIME type to the correct file extension so providers parse
 *  the blob in the right format. Falls back to "wav" (Sahara's safest). */
function audioExtensionFor(mimeType: string | undefined): string {
  if (!mimeType) return "wav";
  const m = mimeType.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("flac")) return "flac";
  return "wav";
}

/** Convert extraction labels such as "eng+lug+swa" into an input code the
 * Sahara API accepts. Prefer the African language in a code-switched mix. */
function normalizeSaharaLanguage(language: string | undefined): string {
  if (!language) return "lg";
  const value = language.toLowerCase().trim();
  const supported = ["lg", "sw", "en", "yo", "ha", "ig", "am", "rw", "af", "ak"];
  if (supported.includes(value)) return value;
  if (value.includes("lug")) return "lg";
  if (value.includes("swa")) return "sw";
  if (value.includes("eng")) return "en";
  return "lg";
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
  const raw = (err instanceof Error ? err.message : String(err ?? ""))
    .replace(/^Uncaught Error:\s*/i, "")
    .split(/\n\s*at\s|\s+at\s+transcribe(?:Sahara|Whisper|Gemini)\s*\(/i)[0];
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
