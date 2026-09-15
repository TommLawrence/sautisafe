// SautiSafe — audio upload (production Convex backend).
//
// Mirrors the live Next.js `/api/audio/*` routes 1:1. Each exported function
// below has a JSDoc comment naming the live API route it replaces.
//
// Audio files are stored in Convex File Storage (a content-addressable blob
// store). The client:
//   1. Calls `generateUploadUrl` to get a one-time pre-signed POST URL.
//   2. POSTs the raw audio bytes to that URL (handled automatically by the
//      Convex client `uploadBuffer`/`uploadFile` helpers).
//   3. Receives back a storageId (the `Id<"_storage">`).
//   4. Calls `saveAudio` to record human-friendly metadata (filename, MIME,
//      size) and to validate the upload against the safety policy.
//
// The returned storageId + metadata are then attached to the incident via
// `createIncident`.
//
// SAFETY POLICY (enforced here, not only client-side):
//   * MIME must be one of {webm, wav, mp3, mpeg, ogg, ogv, mp4}.
//   * Size must be <= 25 MB (the Convex single-blob limit; also the
//     competition max recording size).
//   * The client also enforces a maximum recording duration; we cannot
//     directly measure duration server-side without decoding, so duration
//     validation is the client's responsibility, but the size limit caps it
//     indirectly.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/** Maximum audio blob size accepted by SautiSafe (25 MB). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** MIME types accepted for voice reports. */
const ALLOWED_MIME: Record<string, true> = {
  "audio/webm": true,
  "audio/webm;codecs=opus": true,
  "audio/wav": true,
  "audio/x-wav": true,
  "audio/wave": true,
  "audio/mpeg": true,
  "audio/mp3": true,
  "audio/ogg": true,
  "audio/mp4": true,
  "audio/m4a": true,
  "audio/x-m4a": true,
  "audio/aac": true,
  "video/mp4": true,
  "video/webm": true, // some recorders emit webm under video/*
};

// ──────────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────────

/**
 * Get the public metadata for a stored audio blob.
 *
 * Mirrors: live Next.js `GET /api/audio/:storageId`.
 *
 * Returns the Convex storage metadata record. The audio bytes themselves
 * are served via a `getUrl` mutation (generate a time-limited URL).
 */
export const getAudioMeta = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.db.system.get(args.storageId);
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/**
 * Generate a one-time pre-signed upload URL the client POSTs raw audio bytes
 * to.
 *
 * Mirrors: live Next.js `POST /api/audio/upload-url`.
 *
 * The client uses the Convex helper `useUploadFile` (or `fetch` directly)
 * and POSTs the blob; it receives back a storageId it then passes to
 * `saveAudio` and `createIncident`.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Validate and persist metadata about an uploaded audio blob.
 *
 * Mirrors: live Next.js `POST /api/audio` (save metadata).
 *
 * Throws on policy violations (bad MIME, oversized). The metadata row in the
 * `_storage` system table is created automatically by the Convex upload
 * flow; this mutation just validates the upload and returns the storageId
 * + the human metadata the caller already supplied so the caller can
 * attach them to the incident in a single `createIncident` call.
 *
 * @returns { storageId, fileName, mimeType, sizeBytes }
 */
export const saveAudio = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args): Promise<{
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }> => {
    // Validate size first (cheap, no DB hit).
    if (args.sizeBytes > MAX_AUDIO_BYTES) {
      throw new Error(
        `Audio file is too large: ${args.sizeBytes} bytes (max ${MAX_AUDIO_BYTES} bytes = 25 MB).`,
      );
    }

    // Validate MIME against the allow-list.
    const baseMime = args.mimeType.toLowerCase().split(";", 1)[0].trim();
    if (!ALLOWED_MIME[args.mimeType.toLowerCase()] && !ALLOWED_MIME[baseMime]) {
      throw new Error(
        `Unsupported audio MIME type "${args.mimeType}". Allowed: ${Object.keys(ALLOWED_MIME).join(", ")}.`,
      );
    }

    // Verify the storage blob actually exists (so we don't persist a
    // dangling metadata reference).
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) {
      throw new Error(
        `Storage blob ${args.storageId} not found. Did the client POST to the upload URL first?`,
      );
    }

    return {
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: Number(args.sizeBytes),
    };
  },
});

/**
 * Generate a time-limited download URL for an audio blob.
 *
 * Mirrors: live Next.js `GET /api/audio/:storageId/download-url`.
 *
 * Used by the supervisor-review screen to play back the worker's recording.
 */
export const getAudioUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<string | null> => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
