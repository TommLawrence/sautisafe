// SautiSafe — benchmark runs (production Convex backend).
//
// Mirrors the live Next.js `/api/benchmark/*` routes 1:1. Each exported
// function below has a JSDoc comment naming the live API route it replaces.
//
// A benchmark run compares multiple speech-to-text providers on the same
// audio + a human-confirmed reference transcript. The actual transcription
// + metrics computation happens in convex/actions/transcribe.ts
// (`runBenchmark`); this file persists the resulting payload for the
// benchmark dashboard.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ──────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────

/**
 * List all benchmark runs, newest first.
 *
 * Mirrors: live Next.js `GET /api/benchmark`.
 */
export const listBenchmarkRuns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("benchmarkRuns").order("desc").collect();
  },
});

/**
 * Fetch a single benchmark run by id.
 *
 * Mirrors: live Next.js `GET /api/benchmark/:id`.
 */
export const getBenchmarkRun = query({
  args: { id: v.id("benchmarkRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Persist a benchmark run.
 *
 * Mirrors: live Next.js `POST /api/benchmark`.
 *
 * The caller supplies the reference transcript, the JSON-encoded array of
 * per-provider results (already computed by `runBenchmark`), and an optional
 * aggregate-metrics JSON blob. The referenceNo ties the run to a real
 * incident (or to a synthetic scenario identifier).
 *
 * Returns the new benchmark run id.
 */
export const saveBenchmarkRun = mutation({
  args: {
    referenceNo: v.string(),
    scenario: v.optional(v.string()),
    audioFileName: v.optional(v.string()),
    referenceTranscript: v.string(),
    resultsJson: v.string(),
    aggregateMetrics: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"benchmarkRuns">> => {
    const now = Date.now();
    return await ctx.db.insert("benchmarkRuns", {
      referenceNo: args.referenceNo,
      scenario: args.scenario,
      audioFileName: args.audioFileName,
      referenceTranscript: args.referenceTranscript,
      resultsJson: args.resultsJson,
      aggregateMetrics: args.aggregateMetrics,
      createdAt: now,
    });
  },
});

/** Delete a benchmark history record. Audio and incidents are left untouched. */
export const deleteBenchmarkRun = mutation({
  args: { id: v.id("benchmarkRuns") },
  handler: async (ctx, { id }): Promise<Id<"benchmarkRuns">> => {
    const run = await ctx.db.get(id);
    if (!run) throw new Error(`Benchmark run ${id} not found`);
    await ctx.db.delete(id);
    return id;
  },
});
