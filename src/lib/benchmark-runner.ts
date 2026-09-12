// Server-side shared benchmark runner: runs all three real STT providers
// (Sahara/Intron, Whisper/OpenAI, Gemini) on one audio blob against a
// reference transcript, computes WER/CER/critical-term-recall per lane, and
// returns the results + aggregate metrics. Used by both the standalone
// benchmark route and the per-report "benchmark this report" route.
//
// NO SILENT FALLBACK: if a provider key is missing or a call errors, that
// lane reports its real error and is never substituted by another model.

import { isIntronConfigured, transcribeWithIntron } from "@/lib/intron";
import {
  isWhisperConfigured,
  transcribeWithWhisper,
  isGeminiConfigured,
  transcribeWithGemini,
} from "@/lib/providers";
import { computeAllMetrics, DEFAULT_CRITICAL_TERMS } from "@/lib/metrics";
import type { BenchmarkResult, SpeechProvider } from "@/lib/types";

export interface AggregateMetrics {
  avgWer: number | null;
  avgCer: number | null;
  avgCriticalTermRecall: number | null;
  avgLatencyMs: number | null;
}

export interface BenchmarkLaneInput {
  audioBlob: Blob;
  fileName: string;
  language: string;
  referenceTranscript: string;
}

export interface BenchmarkLaneOutput {
  results: BenchmarkResult[];
  aggregateMetrics: AggregateMetrics | null;
}

export async function runBenchmarkLanes(
  input: BenchmarkLaneInput,
): Promise<BenchmarkLaneOutput> {
  const { audioBlob, fileName, language, referenceTranscript } = input;
  const results: BenchmarkResult[] = [];
  const criticalTerms = DEFAULT_CRITICAL_TERMS;

  // Lane 1 - Sahara (Intron).
  if (!isIntronConfigured()) {
    results.push(emptyLane("sahara", "INTRON_API_KEY not set - add it to .env to run the real Sahara lane"));
  } else {
    try {
      const r = await transcribeWithIntron({ audioBlob, fileName, language });
      const m = computeAllMetrics(referenceTranscript, r.text, { criticalTerms, latencyMs: r.latencyMs });
      results.push({ provider: "sahara", text: r.text, wer: m.wer, cer: m.cer, criticalTermRecall: m.criticalTermRecall, latencyMs: m.latencyMs, wordCount: m.wordCount, success: true, simulated: false });
    } catch (e) {
      results.push(emptyLane("sahara", safeErr(e)));
    }
  }

  // Lane 2 - Whisper (OpenAI).
  if (!isWhisperConfigured()) {
    results.push(emptyLane("whisper", "OPENAI_API_KEY not set - add it to .env to run the real Whisper lane"));
  } else {
    try {
      const r = await transcribeWithWhisper({ audioBlob, fileName, language });
      const m = computeAllMetrics(referenceTranscript, r.text, { criticalTerms, latencyMs: r.latencyMs });
      results.push({ provider: "whisper", text: r.text, wer: m.wer, cer: m.cer, criticalTermRecall: m.criticalTermRecall, latencyMs: m.latencyMs, wordCount: m.wordCount, success: true, simulated: false });
    } catch (e) {
      results.push(emptyLane("whisper", safeErr(e)));
    }
  }

  // Lane 3 - Gemini (gemini-3.8-flash).
  if (!isGeminiConfigured()) {
    results.push(emptyLane("gemini", "GEMINI_API_KEY not set - add it to .env to run the real Gemini lane"));
  } else {
    try {
      const r = await transcribeWithGemini({ audioBlob, fileName, language });
      const m = computeAllMetrics(referenceTranscript, r.text, { criticalTerms, latencyMs: r.latencyMs });
      results.push({ provider: "gemini", text: r.text, wer: m.wer, cer: m.cer, criticalTermRecall: m.criticalTermRecall, latencyMs: m.latencyMs, wordCount: m.wordCount, success: true, simulated: false });
    } catch (e) {
      results.push(emptyLane("gemini", safeErr(e)));
    }
  }

  const real = results.filter((r) => r.success);
  const aggregateMetrics: AggregateMetrics | null = real.length
    ? {
        avgWer: avg(real.map((r) => r.wer)),
        avgCer: avg(real.map((r) => r.cer)),
        avgCriticalTermRecall: avg(real.map((r) => r.criticalTermRecall)),
        avgLatencyMs: avg(real.map((r) => r.latencyMs)),
      }
    : null;

  return { results, aggregateMetrics };
}

function emptyLane(provider: SpeechProvider, error: string): BenchmarkResult {
  return { provider, text: "", wer: null, cer: null, criticalTermRecall: null, latencyMs: null, wordCount: null, error, success: false, simulated: false };
}

function avg(xs: (number | null)[]): number | null {
  const vals = xs.filter((x): x is number => x != null && !Number.isNaN(x));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function safeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}

/** Map the incident's detectedLanguage (e.g. "eng+lug", "swa+eng", "lg") back
 *  to an Intron STT code for re-transcription. Defaults to Luganda-English. */
export function languageForBenchmark(detected?: string | null): string {
  if (!detected) return "lg";
  const d = detected.toLowerCase();
  if (["lg", "sw", "en", "yo", "ha", "ig", "am", "rw", "af", "ak"].includes(d)) return d;
  if (d.includes("lug") || d.includes("lg")) return "lg";
  if (d.includes("swa") || d.includes("sw")) return "sw";
  if (d.includes("eng") || d.includes("en")) return "en";
  return "lg";
}
