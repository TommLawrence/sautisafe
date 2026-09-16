// SautiSafe — Convex schema (production backend).
//
// This schema mirrors the Prisma schema used by the live Next.js testing
// instance 1:1. Every field, relation and default below has a corresponding
// column in /prisma/schema.prisma. See convex/MIGRATION.md for the mapping.
//
// Conventions:
//   * IDs are implicit (`_id` field, typed as `v.id("tableName")` when used
//     as a foreign key).
//   * Timestamps are stored as `v.number()` (unix milliseconds). Convex does
//     not support DB-level `@default(now())`, so mutations set them
//     explicitly with `Date.now()`.
//   * Nullable fields use `v.optional(...)`.
//   * `confidence` is `v.float64()` (decimal 0..1).
//   * Numeric counts/sizes/durations/latencies use `v.number()` so browser
//     clients can send ordinary JavaScript numbers.
//   * Relations use `v.id("tableName")` (note: Convex uses the table name
//     from the schema key, e.g. `workers`, not the Prisma model name).
//
// Tables: workers, incidents, followUps, transcripts, benchmarkRuns, auditEvents.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ──────────────────────────────────────────────────────────────────────
  // workers  ← Prisma `Worker`
  // ──────────────────────────────────────────────────────────────────────
  // A person who reports or is involved in an incident. Names are intentionally
  // optional to support anonymous reporting.
  workers: defineTable({
    identifier: v.optional(v.string()), // staff/employee code, optional
    displayName: v.optional(v.string()), // optional display name
    role: v.optional(v.string()), // e.g. "Operator", "Supervisor", "Contractor"
    department: v.optional(v.string()), // e.g. "Boiler House", "Logistics"
    createdAt: v.number(),
  }),

  // ──────────────────────────────────────────────────────────────────────
  // incidents  ← Prisma `Incident`
  // ──────────────────────────────────────────────────────────────────────
  // The heart of SautiSafe: created from a voice report, enriched by the
  // extraction pipeline, clarified by follow-ups, reviewed by a supervisor.
  incidents: defineTable({
    referenceNo: v.string(), // human-friendly, e.g. SSA-2026-0001 (unique)
    workerId: v.optional(v.id("workers")),
    reportedBy: v.optional(v.string()), // technician name (free text, for the supervisor queue)

    // --- Raw voice inputs ---
    audioFileName: v.optional(v.string()),
    audioMimeType: v.optional(v.string()),
    audioSizeBytes: v.optional(v.number()),
    audioDurationSec: v.optional(v.number()),
    audioStoragePath: v.optional(v.id("_storage")), // persisted audio blob (for re-transcription / benchmark)
    rawTranscript: v.optional(v.string()), // primary transcript (final chosen)

    // --- Structured safety fields (extracted by the LLM) ---
    location: v.optional(v.string()),
    equipment: v.optional(v.string()),
    hazard: v.optional(v.string()),
    peopleAffected: v.optional(v.string()),
    immediateAction: v.optional(v.string()),
    injuryStatus: v.optional(v.string()), // none | minor | serious | unknown
    severity: v.optional(v.string()), // low | medium | high | critical
    occurredAt: v.optional(v.number()), // when it happened (ms epoch)

    // --- Risk + workflow state ---
    status: v.string(), // draft | extracted | review | submitted | escalated | resolved
    judgeLocked: v.optional(v.boolean()), // immutable snapshot awaiting competition judging
    isUrgent: v.boolean(),
    urgencyTags: v.optional(v.string()), // JSON array string: ["fire","chemical",...]
    consentGiven: v.boolean(),
    detectedLanguage: v.optional(v.string()), // e.g. "eng+lug"

    // --- Supervisor review ---
    supervisorNotes: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()), // ms epoch

    // --- Timestamps (set by mutations) ---
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // referenceNo is human-unique; the index lets us enforce uniqueness in
    // application logic and look up by reference.
    .index("byReferenceNo", ["referenceNo"])
    .index("byWorker", ["workerId"])
    .index("byStatus", ["status"])
    .index("byIsUrgent", ["isUrgent"]),

  // ──────────────────────────────────────────────────────────────────────
  // followUps  ← Prisma `FollowUp`
  // ──────────────────────────────────────────────────────────────────────
  // A follow-up question the system asked to fill missing information,
  // and the worker's answer (text or voice-derived).
  followUps: defineTable({
    incidentId: v.id("incidents"), // onDelete: Cascade (handled manually in deleteIncident)
    field: v.optional(v.string()), // which structured field this addresses
    question: v.string(),
    answer: v.optional(v.string()),
    askedAt: v.number(),
    answeredAt: v.optional(v.number()),
  }).index("byIncident", ["incidentId"]),

  // ──────────────────────────────────────────────────────────────────────
  // transcripts  ← Prisma `Transcript`
  // ──────────────────────────────────────────────────────────────────────
  // One transcription of an incident's audio by a given provider.
  // An incident may have several (one per speech model) when benchmarking.
  transcripts: defineTable({
    incidentId: v.id("incidents"),
    provider: v.string(), // "sahara" | "whisper" | "gemini" | "zai-asr"
    text: v.string(),
    language: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    wordCount: v.optional(v.number()),
    confidence: v.optional(v.float64()),
    isPrimary: v.boolean(),
    createdAt: v.number(),
  }).index("byIncident", ["incidentId"]),

  // ──────────────────────────────────────────────────────────────────────
  // benchmarkRuns  ← Prisma `BenchmarkRun`
  // ──────────────────────────────────────────────────────────────────────
  // A benchmark run compares multiple speech models on the same audio +
  // reference transcript, computing accuracy metrics.
  benchmarkRuns: defineTable({
    referenceNo: v.string(),
    scenario: v.optional(v.string()),
    audioFileName: v.optional(v.string()),
    referenceTranscript: v.string(),
    resultsJson: v.string(), // JSON: [{provider, text, wer, cer, ...}]
    aggregateMetrics: v.optional(v.string()), // JSON: {avgWer, avgCer, ...}
    createdAt: v.number(),
  }),

  // ──────────────────────────────────────────────────────────────────────
  // auditEvents  ← Prisma `AuditEvent`
  // ──────────────────────────────────────────────────────────────────────
  // Append-only audit trail for every meaningful action on an incident.
  auditEvents: defineTable({
    incidentId: v.id("incidents"),
    action: v.string(), // recorded | transcribed | extracted | escalated | reviewed | ...
    actor: v.optional(v.string()),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("byIncident", ["incidentId"]),
});
