// Server-side helpers for incidents: reference numbers + audit events.
import { db } from "@/lib/db";

/** Generate the next reference number SSA-YYYY-NNNN from the current count. */
export async function nextReferenceNo(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.incident.count();
  return `SSA-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Append an audit event to an incident. */
export async function audit(
  incidentId: string,
  action: string,
  detail?: string,
  actor?: string,
) {
  try {
    await db.auditEvent.create({
      data: { incidentId, action, detail, actor },
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

/** Serialise an incident (with relations) into a plain JSON-safe object. */
export function serialiseIncident<T extends {
  id: string;
  referenceNo: string;
  occurredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  urgencyTags: string | null;
  followUps: { askedAt: Date; answeredAt: Date | null }[];
  transcripts: { createdAt: Date }[];
  auditEvents: { createdAt: Date }[];
}>(inc: T) {
  return {
    ...inc,
    occurredAt: inc.occurredAt?.toISOString() ?? null,
    createdAt: inc.createdAt.toISOString(),
    updatedAt: inc.updatedAt.toISOString(),
    reviewedAt: inc.reviewedAt?.toISOString() ?? null,
    urgencyTags: inc.urgencyTags ? (JSON.parse(inc.urgencyTags as string) as string[]) : [],
    followUps: inc.followUps.map((f) => ({
      ...f,
      askedAt: f.askedAt.toISOString(),
      answeredAt: f.answeredAt?.toISOString() ?? null,
    })),
    transcripts: inc.transcripts.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
    auditEvents: inc.auditEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
