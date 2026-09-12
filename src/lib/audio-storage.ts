// Server-side audio blob persistence (test instance).
// Saves uploaded/recorded audio to db/uploads/ so it can be re-transcribed
// by the benchmark (all three providers) later. Production uses Convex file
// storage (see convex/audio.ts); this is the local equivalent.
//
// MUST only be imported in server-side code.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "db", "uploads");

function extFor(mimeType?: string | null, fileName?: string | null): string {
  const fromName = fileName?.toLowerCase().match(/\.(wav|mp3|m4a|ogg|webm|flac)$/)?.[1];
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/flac": "flac",
  };
  return map[mimeType || ""] ?? "wav";
}

/** Persist an audio blob to disk. Returns a storage id (the filename) - store
 *  this on the incident as `audioStoragePath`. Never exposes the absolute path
 *  to the client. */
export async function saveAudio(
  bytes: Uint8Array,
  opts: { mimeType?: string | null; fileName?: string | null },
): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const id = `${randomUUID()}.${extFor(opts.mimeType, opts.fileName)}`;
  await fs.writeFile(path.join(UPLOAD_DIR, id), bytes);
  return id;
}

/** Load a persisted audio blob as a Node Buffer (for re-transcription). */
export async function loadAudio(storagePath: string): Promise<Buffer | null> {
  try {
    const full = path.join(UPLOAD_DIR, path.basename(storagePath));
    // Guard against path traversal: only allow filenames inside UPLOAD_DIR.
    if (path.dirname(full) !== UPLOAD_DIR) return null;
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

/** Delete a persisted audio blob (called when an incident is deleted). */
export async function deleteAudio(storagePath: string): Promise<void> {
  try {
    const full = path.join(UPLOAD_DIR, path.basename(storagePath));
    if (path.dirname(full) !== UPLOAD_DIR) return;
    await fs.unlink(full);
  } catch {
    /* ignore */
  }
}
