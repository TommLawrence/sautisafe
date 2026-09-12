import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transcribeAudio } from "@/lib/zai";
import { computeAllMetrics, DEFAULT_CRITICAL_TERMS } from "@/lib/metrics";
import { ACCEPTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/audio-utils";
import { makeReferenceNo } from "@/lib/safety";
import type { BenchmarkResult, SpeechProvider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/benchmark — list past benchmark runs (most recent first). */
export async function GET() {
  try {
    const runs = await db.benchmarkRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        referenceNo: r.referenceNo,
        scenario: r.scenario,
        audioFileName: r.audioFileName,
        referenceTranscript: r.referenceTranscript,
        results: JSON.parse(r.resultsJson) as BenchmarkResult[],
        aggregateMetrics: r.aggregateMetrics
          ? (JSON.parse(r.aggregateMetrics) as {
              avgWer: number | null;
              avgCer: number | null;
              avgCriticalTermRecall: number | null;
              avgLatencyMs: number | null;
            })
          : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[/api/benchmark GET] error", e);
    return NextResponse.json({ error: "Failed to load benchmark runs" }, { status: 500 });
  }
}

/** POST /api/benchmark — run a multi-lane benchmark.
 *  Body (FormData): audio, referenceTranscript, scenario?
 *
 *  Lanes:
 *   - "zai-asr" (Sahara proxy): REAL transcription via the Z cloud ASR, real metrics.
 *   - "whisper" / "gemini": clearly-labelled SIMULATED degradation lanes that
 *     demonstrate the metrics engine. In production these are real provider calls
 *     wired up in convex/actions/transcribe.ts (no silent fallback). */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    const referenceTranscript = (form.get("referenceTranscript") as string) ?? "";
    const scenario = (form.get("scenario") as string) ?? null;
    const scenarioLabel = scenario
      ? ({ s1: "Reactor relief valve (code-switch)", s2: "Chemical spill (English)", s3: "Forklift near-miss (Swahili+EN)", s4: "Arc flash (technical EN)" } as Record<string, string>)[scenario] ?? scenario
      : null;

    if (!referenceTranscript.trim()) {
      return NextResponse.json(
        { error: "A verified reference transcript is required" },
        { status: 400 },
      );
    }

    const results: BenchmarkResult[] = [];

    // Lane 1 — REAL z-ai ASR (Sahara proxy). ---------------------------------
    if (file instanceof File) {
      if (file.size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: `Audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` },
          { status: 413 },
        );
      }
      const mime = (form.get("mimeType") as string) || file.type || "audio/wav";
      if (!ACCEPTED_AUDIO_TYPES.includes(mime) && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `Unsupported audio type: ${mime}` }, { status: 415 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const base64 = bytes.toString("base64");
      try {
        const { text, latencyMs } = await transcribeAudio(base64);
        const m = computeAllMetrics(referenceTranscript, text, {
          criticalTerms: DEFAULT_CRITICAL_TERMS,
          latencyMs,
        });
        results.push({
          provider: "zai-asr",
          text,
          wer: m.wer,
          cer: m.cer,
          criticalTermRecall: m.criticalTermRecall,
          latencyMs: m.latencyMs,
          wordCount: m.wordCount,
          success: true,
          simulated: false,
        });
      } catch (e) {
        // No silent fallback — report the lane honestly.
        results.push({
          provider: "zai-asr",
          text: "",
          wer: null,
          cer: null,
          criticalTermRecall: null,
          latencyMs: null,
          wordCount: null,
          error: safeErr(e),
          success: false,
          simulated: false,
        });
      }
    } else {
      // No audio provided — the real lane is skipped (clearly).
      results.push({
        provider: "zai-asr",
        text: "",
        wer: null,
        cer: null,
        criticalTermRecall: null,
        latencyMs: null,
        wordCount: null,
        error: "No audio provided for the real ASR lane",
        success: false,
        simulated: false,
      });
    }

    // Lanes 2 & 3 — SIMULATED degradation (clearly labelled). -----------------
    // These demonstrate the metrics engine across error rates. They are NOT
    // real Whisper/Gemini outputs. In production, convex/actions/transcribe.ts
    // replaces them with real provider calls.
    const light = corruptTranscript(referenceTranscript, 0.06, "light");
    const heavy = corruptTranscript(referenceTranscript, 0.18, "heavy");
    for (const [provider, text] of [
      ["whisper", light],
      ["gemini", heavy],
    ] as [SpeechProvider, string][]) {
      const m = computeAllMetrics(referenceTranscript, text, {
        criticalTerms: DEFAULT_CRITICAL_TERMS,
      });
      results.push({
        provider,
        text,
        wer: m.wer,
        cer: m.cer,
        criticalTermRecall: m.criticalTermRecall,
        latencyMs: null,
        wordCount: m.wordCount,
        success: true,
        simulated: true,
      });
    }

    // Aggregate over real (non-simulated) lanes only.
    const real = results.filter((r) => !r.simulated && r.success);
    const aggregateMetrics = real.length
      ? {
          avgWer: avg(real.map((r) => r.wer)),
          avgCer: avg(real.map((r) => r.cer)),
          avgCriticalTermRecall: avg(real.map((r) => r.criticalTermRecall)),
          avgLatencyMs: avg(real.map((r) => r.latencyMs)),
        }
      : null;

    const referenceNo = await nextBenchmarkRefNo();
    const run = await db.benchmarkRun.create({
      data: {
        referenceNo,
        scenario: scenarioLabel,
        audioFileName: file instanceof File ? file.name : null,
        referenceTranscript,
        resultsJson: JSON.stringify(results),
        aggregateMetrics: aggregateMetrics ? JSON.stringify(aggregateMetrics) : null,
      },
    });

    await auditLog(run.id, "benchmark_run", `${results.length} lanes`);

    return NextResponse.json({
      runId: run.id,
      referenceNo: run.referenceNo,
      results,
      aggregateMetrics,
    });
  } catch (e) {
    console.error("[/api/benchmark POST] error", e);
    return NextResponse.json(
      { error: "Benchmark failed", detail: safeErr(e) },
      { status: 500 },
    );
  }
}

/** Deterministic-ish transcript corruption to simulate a weaker ASR lane.
 *  `rate` is the fraction of words affected. `mode` controls how aggressive
 *  the substitution pool is. */
function corruptTranscript(reference: string, rate: number, mode: "light" | "heavy"): string {
  const words = reference.split(/\s+/);
  const lightPool = ["the", "a", "it", "was", "is", "then", "and", "but", "we", "they"];
  const heavyPool = [
    "presser", "volve", "reactor", "burner", "boilar", "hidraulic",
    "isolator", "emergensy", "chemikal", "steam", "convoyer", "forklift",
    "scafold", "electrikal", "injry", "burn", "leek", "fume", "oxgyen",
  ];
  const pool = mode === "heavy" ? heavyPool : lightPool;
  let out = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // never touch very short tokens or pure punctuation
    if (w.length < 2 || /^[^a-z0-9]+$/i.test(w)) {
      out += w + " ";
      continue;
    }
    if (Math.random() < rate) {
      const op = Math.floor(Math.random() * 3);
      if (op === 0) {
        // drop the word
        continue;
      } else if (op === 1) {
        // substitute with a pool word
        out += pool[Math.floor(Math.random() * pool.length)] + " ";
      } else {
        // mangle: drop a random interior letter
        const idx = 1 + Math.floor(Math.random() * (w.length - 2));
        out += w.slice(0, idx) + w.slice(idx + 1) + " ";
      }
    } else {
      out += w + " ";
    }
  }
  return out.trim();
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

async function nextBenchmarkRefNo(): Promise<string> {
  const count = await db.benchmarkRun.count();
  return makeReferenceNo(count);
}

// Benchmark runs don't belong to an incident, so we log to a tiny file-based
// note rather than the incident audit trail. Kept minimal for the test env.
async function auditLog(_runId: string, _action: string, _detail: string) {
  // no-op for benchmark runs (no incident to attach to)
}
