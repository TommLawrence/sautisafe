import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, serialiseIncident } from "@/lib/incidents-server";
import type { IncidentStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/incidents/[id] — full incident with relations. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const inc = await db.incident.findUnique({
      where: { id },
      include: {
        worker: true,
        followUps: { orderBy: { askedAt: "asc" } },
        transcripts: { orderBy: { createdAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!inc) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ incident: serialiseIncident(inc) });
  } catch (e) {
    console.error("[/api/incidents/[id] GET] error", e);
    return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
  }
}

/** PATCH /api/incidents/[id] — supervisor review (notes, status, reviewer). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { supervisorNotes, reviewedBy, status, reviewedAt } = body as {
      supervisorNotes?: string;
      reviewedBy?: string;
      status?: IncidentStatus;
      reviewedAt?: string;
      rawTranscript?: string;
    };

    const existing = await db.incident.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const reviewed = reviewedAt && !Number.isNaN(new Date(reviewedAt).getTime())
      ? new Date(reviewedAt)
      : new Date();

    const transcriptChanged =
      rawTranscript !== undefined && rawTranscript.trim() !== (existing.rawTranscript ?? "").trim();

    const updated = await db.incident.update({
      where: { id },
      data: {
        rawTranscript: rawTranscript !== undefined ? rawTranscript : existing.rawTranscript,
        supervisorNotes: supervisorNotes ?? existing.supervisorNotes,
        reviewedBy: reviewedBy ?? existing.reviewedBy,
        reviewedAt: reviewed,
        status: status ?? existing.status,
      },
    });

    await audit(
      id,
      transcriptChanged
        ? "transcript_verified"
        : status === "escalated"
          ? "escalated"
          : status === "resolved"
            ? "resolved"
            : "reviewed",
      status ? `status=${status}` : undefined,
      reviewedBy ?? undefined,
    );

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (e) {
    console.error("[/api/incidents/[id] PATCH] error", e);
    return NextResponse.json(
      { error: "Could not save review", detail: safeErr(e) },
      { status: 500 },
    );
  }
}

function safeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}
