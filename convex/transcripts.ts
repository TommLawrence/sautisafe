// SautiSafe — transcripts table (production Convex backend).
//
// Mirrors the live Next.js `/api/transcripts/*` routes 1:1. Each exported
// function below has a JSDoc comment naming the live API route it replaces.
//
// A transcript row is the persisted output of a single speech-to-text
// provider on a single incident's audio. An incident may have several
// transcripts (one per provider) when benchmarking — exactly one of which
// is marked `isPrimary` (the one surfaced to the supervisor by default).

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ──────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────

/**
 * List all transcripts for an incident (oldest first).
 *
 * Mirrors: live Next.js `GET /api/incidents/:id/transcripts`.
 */
export const listForIncident = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcripts")
      .withIndex("byIncident", (q) => q.eq("incidentId", args.incidentId))
      .order("asc")
      .collect();
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Persist one transcript result for an incident.
 *
 * Mirrors: live Next.js `POST /api/incidents/:id/transcripts`.
 *
 * The caller passes the provider name ("sahara" | "whisper" | "gemini" |
 * "zai-asr") and the transcript text plus optional metrics (latency, word
 * count, confidence, detected language). When `isPrimary` is true the
 * incident's `rawTranscript` is also updated to this transcript's text, so
 * the supervisor-review screen shows the chosen provider's output by
 * default.
 *
 * Returns the new transcript id.
 */
export const addTranscript = mutation({
  args: {
    incidentId: v.id("incidents"),
    provider: v.string(),
    text: v.string(),
    language: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    wordCount: v.optional(v.number()),
    confidence: v.optional(v.float64()),
    isPrimary: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"transcripts">> => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) {
      throw new Error(`Incident ${args.incidentId} not found; cannot store transcript.`);
    }
    if (incident.judgeLocked) {
      throw new Error("This report is locked while awaiting judge review.");
    }

    const now = Date.now();
    const transcriptId = await ctx.db.insert("transcripts", {
      incidentId: args.incidentId,
      provider: args.provider,
      text: args.text,
      language: args.language,
      durationMs: args.durationMs,
      latencyMs: args.latencyMs,
      wordCount: args.wordCount,
      confidence: args.confidence,
      isPrimary: args.isPrimary,
      createdAt: now,
    });

    // When this transcript is the primary one, propagate it to the
    // incident's `rawTranscript` field (which the supervisor review screen
    // shows by default) and bump the incident's updatedAt.
    if (args.isPrimary) {
      await ctx.db.patch(args.incidentId, {
        rawTranscript: args.text,
        updatedAt: now,
      });

      await ctx.db.insert("auditEvents", {
        incidentId: args.incidentId,
        action: "transcribed",
        actor: args.provider,
        detail: "primary",
        createdAt: now,
      });
    } else {
      await ctx.db.insert("auditEvents", {
        incidentId: args.incidentId,
        action: "transcribed",
        actor: args.provider,
        detail: "non-primary",
        createdAt: now,
      });
    }

    return transcriptId;
  },
});
