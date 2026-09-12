import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBenchmarkLanes, type AggregateMetrics } from "@/lib/benchmark-runner";
import { ACCEPTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "@/lib/audio-utils";
import { makeReferenceNo } from "@/lib/safety";
import type { BenchmarkResult, SpeechProvider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/benchmark - list past benchmark runs (most recent first). */
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

/** POST /api/benchmark - run a multi-lane benchmark.
 *  Body (FormData): audio, referenceTranscript, scenario?, language?
 *
 *  Lanes:
 *   - "sahara": REAL Intron Voice STT (the competition's required Sahara model).
 *     In benchmark mode there is NO silent fallback: if INTRON_API_KEY is
 *     missing or the call fails, the lane reports a clear error and is NOT
 *     retried on another model.
 *   - "whisper" / "gemini": clearly-labelled SIMULATED degradation lanes that
 *     demonstrate the metrics engine. In production these are real provider
 *     calls wired up in convex/actions/transcribe.ts. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");
    const referenceTranscript = (form.get("referenceTranscript") as string) ?? "";
    const scenario = (form.get("scenario") as string) ?? null;
    const scenarioMeta = scenario
      ? ({
          s1: { label: "Reactor relief valve (code-switch)", lang: "lg" },
          s2: { label: "Chemical spill (English)", lang: "en" },
          s3: { label: "Forklift near-miss (Swahili+EN)", lang: "sw" },
          s4: { label: "Arc flash (technical EN)", lang: "en" },
        } as Record<string, { label: string; lang: string }>)[scenario] ?? {
          label: scenario,
          lang: "lg",
        }
      : null;
    const scenarioLabel = scenarioMeta?.label ?? null;
    const language =
      (form.get("language") as string) || scenarioMeta?.lang || "lg";

    if (!referenceTranscript.trim()) {
      return NextResponse.json(
        { error: "A verified reference transcript is required" },
        { status: 400 },
      );
    }

    let results: BenchmarkResult[];
    let aggregateMetrics: AggregateMetrics | null;

    if (!(file instanceof File)) {
      results = [
        emptyLane("sahara", "No audio provided for the Sahara lane"),
        emptyLane("whisper", "No audio provided for the Whisper lane"),
        emptyLane("gemini", "No audio provided for the Gemini lane"),
      ];
      aggregateMetrics = null;
    } else if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` },
        { status: 413 },
      );
    } else {
      const mime = (form.get("mimeType") as string) || file.type || "audio/wav";
      if (!ACCEPTED_AUDIO_TYPES.includes(mime) && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `Unsupported audio type: ${mime}` }, { status: 415 });
      }
      const audioBlob = new Blob([new Uint8Array(await file.arrayBuffer())], {
        type: mime,
      });
      const out = await runBenchmarkLanes({
        audioBlob,
        fileName: file.name || "benchmark.wav",
        language,
        referenceTranscript,
      });
      results = out.results;
      aggregateMetrics = out.aggregateMetrics;
    }

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

function emptyLane(provider: SpeechProvider, error: string): BenchmarkResult {
  return {
    provider,
    text: "",
    wer: null,
    cer: null,
    criticalTermRecall: null,
    latencyMs: null,
    wordCount: null,
    error,
    success: false,
    simulated: false,
  };
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
