// SautiSafe — follow-up questions & answers (production Convex backend).
//
// Mirrors the live Next.js `/api/followups/*` routes 1:1. Each exported
// function below has a JSDoc comment naming the live API route it replaces.
//
// Follow-ups are the system's "ask a clarifying question" loop: after the
// extraction step identifies missing or low-confidence fields, the LLM
// suggests up to 2 follow-up questions; the worker answers them (text or
// voice); the answers feed back into the incident.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ──────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────

/**
 * List all follow-ups for an incident (oldest first).
 *
 * Mirrors: live Next.js `GET /api/incidents/:id/followups`.
 */
export const listForIncident = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("followUps")
      .withIndex("byIncident", (q) => q.eq("incidentId", args.incidentId))
      .order("asc")
      .collect();
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a follow-up question for an incident.
 *
 * Mirrors: live Next.js `POST /api/incidents/:id/followups` (ask question).
 *
 * Sets `askedAt = now`, `answeredAt = null`. Writes an audit event
 * `followup_asked` so the supervisor can see the question trail.
 *
 * Returns the new follow-up id.
 */
export const createFollowUp = mutation({
  args: {
    incidentId: v.id("incidents"),
    field: v.optional(v.string()),
    question: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"followUps">> => {
    // Verify the parent incident exists; this throws on dangling references.
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) {
      throw new Error(`Incident ${args.incidentId} not found; cannot create follow-up.`);
    }

    const now = Date.now();
    const followUpId = await ctx.db.insert("followUps", {
      incidentId: args.incidentId,
      field: args.field,
      question: args.question,
      askedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      incidentId: args.incidentId,
      action: "followup_asked",
      actor: "system",
      detail: args.field ? `field=${args.field}` : "general",
      createdAt: now,
    });

    return followUpId;
  },
});

/**
 * Answer a follow-up question.
 *
 * Mirrors: live Next.js `POST /api/followups/:id/answer` (record answer).
 *
 * Sets `answer` and `answeredAt = now`. Writes an audit event
 * `followup_answered`.
 */
export const answerFollowUp = mutation({
  args: {
    id: v.id("followUps"),
    answer: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"followUps">> => {
    const followUp = await ctx.db.get(args.id);
    if (!followUp) throw new Error(`Follow-up ${args.id} not found`);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      answer: args.answer,
      answeredAt: now,
    });

    await ctx.db.insert("auditEvents", {
      incidentId: followUp.incidentId,
      action: "followup_answered",
      actor: "worker",
      detail: followUp.field ? `field=${followUp.field}` : "general",
      createdAt: now,
    });

    return args.id;
  },
});
