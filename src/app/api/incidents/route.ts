import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, nextReferenceNo, serialiseIncident } from "@/lib/incidents-server";
import { applyInjuryNegation, detectUrgentTags } from "@/lib/safety";
import type { InjuryStatus, Severity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/incidents?status=...&urgent=true&q=...
 *  Returns { incidents: Incident[] } (most recent first). Requires a session. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const urgent = url.searchParams.get("urgent");
    const q = url.searchParams.get("q") ?? undefined;

    const where: {
      status?: string;
      isUrgent?: boolean;
      OR?: { [k: string]: { contains: string } }[];
    } = {};
    if (status) where.status = status;
    if (urgent === "true") where.isUrgent = true;
    if (q) {
      where.OR = [
        { referenceNo: { contains: q } },
        { location: { contains: q } },
        { equipment: { contains: q } },
        { hazard: { contains: q } },
        { rawTranscript: { contains: q } },
      ];
    }

    const rows = await db.incident.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { worker: true },
    });

    return NextResponse.json({
      incidents: rows.map((r) => ({
        ...serialiseIncident({
          ...r,
          followUps: [],
          transcripts: [],
          auditEvents: [],
        }),
        worker: r.worker,
      })),
    });
  } catch (e) {
    console.error("[/api/incidents GET] error", e);
    return NextResponse.json({ error: "Failed to load incidents" }, { status: 500 });
  }
}

/** POST /api/incidents
 *  Creates an incident from a finalised voice report (transcript + extracted
 *  fields + follow-ups + urgency). Mirrors convex/incidents.ts → createIncident. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      audioFileName,
      audioMimeType,
      audioSizeBytes,
      audioDurationSec,
      audioStoragePath,
      reportedBy,
      transcript,
      transcriptLatencyMs,
      transcriptProvider,
      language,
      fields,
      followUps,
      urgentTags,
      consentGiven,
      detectedLanguage,
    } = body as {
      audioFileName?: string | null;
      audioMimeType?: string | null;
      audioSizeBytes?: number | null;
      audioDurationSec?: number | null;
      audioStoragePath?: string | null;
      reportedBy?: string | null;
      transcript?: string | null;
      transcriptLatencyMs?: number | null;
      transcriptProvider?: string | null;
      language?: string | null;
      fields: {
        location?: string;
        equipment?: string;
        hazard?: string;
        peopleAffected?: string;
        immediateAction?: string;
        injuryStatus?: InjuryStatus | "";
        severity?: Severity | "";
        occurredAt?: string;
      };
      followUps?: { field: string; question: string; answer: string }[];
      urgentTags?: string[];
      consentGiven?: boolean;
      detectedLanguage?: string | null;
    };

    if (!consentGiven) {
      return NextResponse.json(
        { error: "Consent is required before saving a report" },
        { status: 400 },
      );
    }
    if (!transcript && !fields?.hazard) {
      return NextResponse.json(
        { error: "A transcript or hazard description is required" },
        { status: 400 },
      );
    }

    // Backstop urgency scan on the transcript.
    const scanned = transcript ? detectUrgentTags(transcript) : [];
    const tags = applyInjuryNegation(
      Array.from(new Set([...(urgentTags ?? []), ...scanned])),
      transcript ?? "",
    );
    const isUrgent = tags.length > 0;

    const referenceNo = await nextReferenceNo();

    const occurredAt =
      fields?.occurredAt && !Number.isNaN(new Date(fields.occurredAt).getTime())
        ? new Date(fields.occurredAt)
        : null;

    const created = await db.incident.create({
      data: {
        referenceNo,
        audioFileName: audioFileName ?? null,
        audioMimeType: audioMimeType ?? null,
        audioSizeBytes: audioSizeBytes ?? null,
        audioDurationSec: audioDurationSec ?? null,
        audioStoragePath: audioStoragePath ?? null,
        reportedBy: reportedBy ?? null,
        rawTranscript: transcript ?? null,
        location: fields?.location || null,
        equipment: fields?.equipment || null,
        hazard: fields?.hazard || null,
        peopleAffected: fields?.peopleAffected || null,
        immediateAction: fields?.immediateAction || null,
        injuryStatus: (fields?.injuryStatus as InjuryStatus | null) || null,
        severity: (fields?.severity as Severity | null) || null,
        occurredAt,
        status: "review",
        isUrgent,
        urgencyTags: JSON.stringify(tags),
        consentGiven: true,
        detectedLanguage: detectedLanguage ?? language ?? null,
      },
    });

    // Primary transcript record - provider reflects what actually ran
    // ("sahara" for the real Intron Voice API, "zai-asr" for the test fallback).
    if (transcript) {
      const provider =
        transcriptProvider === "sahara" ? "sahara" : "zai-asr";
      await db.transcript.create({
        data: {
          incidentId: created.id,
          provider,
          text: transcript,
          latencyMs: transcriptLatencyMs ?? null,
          wordCount: transcript.split(/\s+/).filter(Boolean).length,
          isPrimary: true,
        },
      });
    }

    // Follow-up records.
    if (followUps && followUps.length) {
      await db.followUp.createMany({
        data: followUps
          .filter((f) => f.question?.trim())
          .map((f) => ({
            incidentId: created.id,
            field: f.field || null,
            question: f.question,
            answer: f.answer?.trim() || null,
            askedAt: new Date(),
            answeredAt: f.answer?.trim() ? new Date() : null,
          })),
      });
    }

    await audit(created.id, "recorded", "Voice report submitted");
    if (transcript) {
      const prov = transcriptProvider === "sahara" ? "sahara (Intron)" : "zai-asr";
      await audit(created.id, "transcribed", `${prov} · ${transcriptLatencyMs ?? "?"}ms${language ? ` · ${language}` : ""}`);
    }
    await audit(created.id, "extracted", `${tags.length} urgent tag(s)`);
    if (isUrgent) await audit(created.id, "escalated", tags.join(", "));

    return NextResponse.json({ id: created.id, referenceNo: created.referenceNo });
  } catch (e) {
    console.error("[/api/incidents POST] error", e);
    return NextResponse.json(
      { error: "Could not save report", detail: safeErr(e) },
      { status: 500 },
    );
  }
}

function safeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}
