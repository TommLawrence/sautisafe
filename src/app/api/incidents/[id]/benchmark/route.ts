import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadAudio } from "@/lib/audio-storage";
import { audit } from "@/lib/incidents-server";
import { runBenchmarkLanes, languageForBenchmark } from "@/lib/benchmark-runner";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/incidents/[id]/benchmark
 *  Runs all three real STT providers (Sahara/Intron, Whisper, Gemini) on the
 *  report's persisted audio, computes WER/CER/critical-term-recall vs the
 *  report's transcript (the supervisor should verify/correct it first for
 *  honest metrics), saves Whisper + Gemini as transcript rows on the incident
 *  + a BenchmarkRun record, and returns the lane results. No silent fallback. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const inc = await db.incident.findUnique({ where: { id } });
    if (!inc) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    if (!inc.audioStoragePath) {
      return NextResponse.json(
        {
          error:
            "No audio is persisted for this report. New reports (recorded after audio persistence shipped) can be benchmarked; older reports cannot.",
        },
        { status: 404 },
      );
    }
    const reference = inc.rawTranscript?.trim() ?? "";
    if (!reference) {
      return NextResponse.json(
        { error: "This report has no transcript to use as the reference. Add one first." },
        { status: 400 },
      );
    }

    const audioBuf = await loadAudio(inc.audioStoragePath);
    if (!audioBuf) {
      return NextResponse.json(
        { error: "The persisted audio file could not be read." },
        { status: 404 },
      );
    }

    const audioBlob = new Blob([new Uint8Array(audioBuf)], {
      type: inc.audioMimeType || "audio/wav",
    });
    const language = languageForBenchmark(inc.detectedLanguage);

    const { results, aggregateMetrics } = await runBenchmarkLanes({
      audioBlob,
      fileName: inc.audioFileName || "report.wav",
      language,
      referenceTranscript: reference,
    });

    // Save Whisper + Gemini transcripts on the incident (Sahara already has its
    // primary transcript row). Replace any prior benchmark transcripts for
    // these providers so re-running doesn't pile up duplicates.
    const newProviders = ["whisper", "gemini"] as const;
    await db.transcript.deleteMany({
      where: { incidentId: id, isPrimary: false, provider: { in: [...newProviders] } },
    });
    for (const r of results) {
      if (!r.success) continue;
      await db.transcript.create({
        data: {
          incidentId: id,
          provider: r.provider,
          text: r.text,
          language,
          latencyMs: r.latencyMs,
          wordCount: r.wordCount,
          isPrimary: false,
        },
      });
    }

    const run = await db.benchmarkRun.create({
      data: {
        referenceNo: inc.referenceNo,
        scenario: "Field report benchmark",
        audioFileName: inc.audioFileName ?? undefined,
        referenceTranscript: reference,
        resultsJson: JSON.stringify(results),
        aggregateMetrics: aggregateMetrics ? JSON.stringify(aggregateMetrics) : null,
      },
    });

    await audit(id, "benchmarked", `${results.length} lanes · run ${run.referenceNo}`);

    return NextResponse.json({
      runId: run.id,
      referenceNo: run.referenceNo,
      results,
      aggregateMetrics,
      language,
    });
  } catch (e) {
    console.error("[/api/incidents/[id]/benchmark] error", e);
    return NextResponse.json(
      { error: "Benchmark failed", detail: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}
