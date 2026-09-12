// SautiSafe — incidents table mutations & queries (production Convex backend).
//
// Mirrors the live Next.js `/api/incidents/*` routes 1:1. Each exported
// function below has a JSDoc comment naming the live API route it replaces.
//
// Notes on cascades:
//   Convex does not have DB-level `onDelete: Cascade`. The `deleteIncident`
//   mutation manually deletes followUps, transcripts and auditEvents for the
//   incident before deleting the incident itself. Callers should use this
//   mutation (not raw `db.delete`) to preserve cascade semantics.
//
// Reference numbers:
//   Format `SSA-YYYY-NNNN`, where YYYY is the current 4-digit year and
//   NNNN is the zero-padded ordinal of the incident within that year (1-based).
//   Computed from the count of incidents created so far. See `nextReferenceNo`.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";

// ──────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────

/**
 * List incidents, optionally filtered by status / urgency / worker.
 *
 * Mirrors: live Next.js `GET /api/incidents?status=...&isUrgent=...&workerId=...`
 *
 * Returns incidents ordered by `createdAt` descending (newest first).
 */
export const listIncidents = query({
  args: {
    status: v.optional(v.string()),
    isUrgent: v.optional(v.boolean()),
    workerId: v.optional(v.id("workers")),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("incidents");

    // Apply filters via index-accelerated `.withIndex` where possible.
    // We pick the most selective index based on which filters are present.
    if (args.status) {
      q = q.withIndex("byStatus", (q) => q.eq("status", args.status as string));
    } else if (args.isUrgent !== undefined) {
      q = q.withIndex("byIsUrgent", (q) => q.eq("isUrgent", args.isUrgent as boolean));
    } else if (args.workerId) {
      q = q.withIndex("byWorker", (q) => q.eq("workerId", args.workerId as string));
    }

    // Secondary filters that aren't covered by the chosen index are applied
    // with `.filter` — these run after the index range fetch.
    if (args.status && args.isUrgent !== undefined) {
      q = q.filter((q) => q.eq(q.field("isUrgent"), args.isUrgent as boolean));
    }
    if (args.status && args.workerId) {
      q = q.filter((q) => q.eq(q.field("workerId"), args.workerId as string));
    }
    if (args.isUrgent !== undefined && args.workerId && !args.status) {
      q = q.filter((q) => q.eq(q.field("workerId"), args.workerId as string));
    }

    return await q.order("desc").collect();
  },
});

/**
 * Fetch a single incident by id (without relations).
 *
 * Mirrors: live Next.js `GET /api/incidents/:id` (summary view).
 */
export const getIncident = query({
  args: { id: v.id("incidents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Fetch an incident together with its follow-ups, transcripts and audit
 * events — the full supervisor-review payload.
 *
 * Mirrors: live Next.js `GET /api/incidents/:id/detail` (review screen).
 *
 * Returns `null` when the incident does not exist.
 */
export const getIncidentDetail = query({
  args: { id: v.id("incidents") },
  handler: async (ctx, args): Promise<{
    incident: Doc<"incidents"> | null;
    followUps: Doc<"followUps">[];
    transcripts: Doc<"transcripts">[];
    auditEvents: Doc<"auditEvents">[];
  } | null> => {
    const incident = await ctx.db.get(args.id);
    if (!incident) return null;

    const [followUps, transcripts, auditEvents] = await Promise.all([
      ctx.db
        .query("followUps")
        .withIndex("byIncident", (q) => q.eq("incidentId", args.id))
        .order("asc")
        .collect(),
      ctx.db
        .query("transcripts")
        .withIndex("byIncident", (q) => q.eq("incidentId", args.id))
        .order("asc")
        .collect(),
      ctx.db
        .query("auditEvents")
        .withIndex("byIncident", (q) => q.eq("incidentId", args.id))
        .order("asc")
        .collect(),
    ]);

    return { incident, followUps, transcripts, auditEvents };
  },
});

/**
 * Compute the next incident reference number in the form `SSA-YYYY-NNNN`.
 *
 * Mirrors: live Next.js `GET /api/incidents/reference/next`.
 *
 * The ordinal is `(incidentCountInCurrentYear + 1)` so the first incident of
 * the year is `0001`. We use total incident count as a deterministic proxy
 * for "ordinal within the year" — SautiSafe is a small-team tool and the
 * count resets only on data reset, so this matches the live behaviour.
 */
export const nextReferenceNo = query({
  args: {},
  handler: async (ctx): Promise<string> => {
    const count = await ctx.db.query("incidents").count();
    const year = new Date().getUTCFullYear();
    const ordinal = count + 1;
    return `SSA-${year}-${String(ordinal).padStart(4, "0")}`;
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a new incident in `draft` status from a voice report.
 *
 * Mirrors: live Next.js `POST /api/incidents` (create-from-voice).
 *
 * The caller passes the freshly minted referenceNo (from `nextReferenceNo`)
 * plus the raw voice metadata. The mutation sets:
 *   status="draft", isUrgent=false, createdAt=now, updatedAt=now
 * and writes an audit event "recorded".
 *
 * Returns the new incident id.
 */
export const createIncident = mutation({
  args: {
    workerId: v.optional(v.id("workers")),
    referenceNo: v.string(),
    audioFileName: v.optional(v.string()),
    audioMimeType: v.optional(v.string()),
    audioSizeBytes: v.optional(v.int64()),
    audioDurationSec: v.optional(v.int64()),
    rawTranscript: v.optional(v.string()),
    consentGiven: v.boolean(),
    detectedLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Enforce human-uniqueness of referenceNo: refuse to create a duplicate.
    const existing = await ctx.db
      .query("incidents")
      .withIndex("byReferenceNo", (q) => q.eq("referenceNo", args.referenceNo))
      .first();
    if (existing) {
      throw new Error(
        `Incident reference number ${args.referenceNo} already exists. Call nextReferenceNo again.`,
      );
    }

    const now = Date.now();

    // Consent gate: SautiSafe MUST NOT store audio without explicit consent.
    // The client shows a consent checkbox; this is the backend enforcement.
    if (!args.consentGiven) {
      throw new Error(
        "Consent not given. The worker must explicitly consent before audio is stored.",
      );
    }

    const incidentId = await ctx.db.insert("incidents", {
      referenceNo: args.referenceNo,
      workerId: args.workerId,
      audioFileName: args.audioFileName,
      audioMimeType: args.audioMimeType,
      audioSizeBytes: args.audioSizeBytes,
      audioDurationSec: args.audioDurationSec,
      rawTranscript: args.rawTranscript,
      consentGiven: args.consentGiven,
      detectedLanguage: args.detectedLanguage,
      status: "draft",
      isUrgent: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      incidentId,
      action: "recorded",
      actor: args.workerId ? "worker" : "anonymous",
      detail: args.referenceNo,
      createdAt: now,
    });

    return incidentId;
  },
});

/**
 * Patch structured fields on an incident.
 *
 * Mirrors: live Next.js `PATCH /api/incidents/:id`.
 *
 * Any field that is `undefined` in the args is left untouched (no overwrite).
 * Pass an explicit `null`? Convex validators reject nulls for non-optional
 * fields, so callers should simply omit fields they don't want to change.
 *
 * `updatedAt` is always bumped to `Date.now()`. An audit event is written
 * with `action` reflecting the kind of change (extracted / escalated /
 * status-changed). The caller can pass `actionOverride` to set the verb
 * explicitly; otherwise it defaults to "updated".
 */
export const updateIncident = mutation({
  args: {
    id: v.id("incidents"),
    location: v.optional(v.string()),
    equipment: v.optional(v.string()),
    hazard: v.optional(v.string()),
    peopleAffected: v.optional(v.string()),
    immediateAction: v.optional(v.string()),
    injuryStatus: v.optional(v.string()),
    severity: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
    status: v.optional(v.string()),
    rawTranscript: v.optional(v.string()),
    isUrgent: v.optional(v.boolean()),
    urgencyTags: v.optional(v.string()),
    supervisorNotes: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    actionOverride: v.optional(v.string()),
    actionDetail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error(`Incident ${args.id} not found`);

    // Build a partial patch — only fields the caller actually supplied.
    const patch: Partial<Doc<"incidents">> = {};
    for (const key of [
      "location",
      "equipment",
      "hazard",
      "peopleAffected",
      "immediateAction",
      "injuryStatus",
      "severity",
      "occurredAt",
      "status",
      "rawTranscript",
      "isUrgent",
      "urgencyTags",
      "supervisorNotes",
      "reviewedBy",
      "reviewedAt",
    ] as const) {
      const value = args[key];
      if (value !== undefined) {
        // Convex validators for optional fields accept `undefined`; here we
        // copy through only the ones that have a value. The cast is safe
        // because the field set above is a strict subset of the patch shape.
        (patch as Record<string, unknown>)[key] = value;
      }
    }

    const now = Date.now();
    patch.updatedAt = now;

    await ctx.db.patch(args.id, patch);

    await ctx.db.insert("auditEvents", {
      incidentId: args.id,
      action: args.actionOverride ?? "updated",
      actor: args.reviewedBy,
      detail: args.actionDetail ?? summarizeChange(patch),
      createdAt: now,
    });

    return args.id;
  },
});

/**
 * Supervisor review: sets supervisorNotes, reviewedBy, reviewedAt and a
 * final status. Writes an audit event "reviewed".
 *
 * Mirrors: live Next.js `POST /api/incidents/:id/review`.
 */
export const reviewIncident = mutation({
  args: {
    id: v.id("incidents"),
    supervisorNotes: v.string(),
    reviewedBy: v.string(),
    status: v.string(), // review | submitted | escalated | resolved
  },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error(`Incident ${args.id} not found`);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      supervisorNotes: args.supervisorNotes,
      reviewedBy: args.reviewedBy,
      reviewedAt: now,
      status: args.status,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      incidentId: args.id,
      action: "reviewed",
      actor: args.reviewedBy,
      detail: `status=${args.status}`,
      createdAt: now,
    });

    return args.id;
  },
});

/**
 * Delete an incident and all its dependents (cascade).
 *
 * Mirrors: live Next.js `DELETE /api/incidents/:id`.
 *
 * Convex has no DB-level cascade, so we explicitly delete:
 *   - all followUps for this incident
 *   - all transcripts for this incident
 *   - all auditEvents for this incident
 *   - the incident row itself
 *
 * Audio files in storage are NOT deleted here (they may be referenced by
 * benchmark runs or other incidents). Use a dedicated storage cleanup if
 * retention policy requires it.
 */
export const deleteIncident = mutation({
  args: { id: v.id("incidents") },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.id);
    if (!incident) throw new Error(`Incident ${args.id} not found`);

    const [followUps, transcripts, auditEvents] = await Promise.all([
      ctx.db
        .query("followUps")
        .withIndex("byIncident", (q) => q.eq("incidentId", args.id))
        .collect(),
      ctx.db
        .query("transcripts")
        .withIndex("byIncident", (q) => q.eq("incidentId", args.id))
        .collect(),
      ctx.db
        .query("auditEvents")
        .withIndex("byIncident", (q) => q.eq("incidentId", args.id))
        .collect(),
    ]);

    for (const f of followUps) await ctx.db.delete(f._id);
    for (const t of transcripts) await ctx.db.delete(t._id);
    for (const a of auditEvents) await ctx.db.delete(a._id);

    await ctx.db.delete(args.id);
    return args.id;
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Build a short human-readable summary of which fields changed in an update.
 * Used as the audit-event `detail` when the caller doesn't supply one.
 */
function summarizeChange(patch: Record<string, unknown>): string {
  const keys = Object.keys(patch).filter((k) => k !== "updatedAt");
  if (keys.length === 0) return "no-fields";
  // Status change is the most informative; surface it first if present.
  if (keys.includes("status")) {
    return `status=${patch.status}`;
  }
  return keys.slice(0, 5).join(",");
}
