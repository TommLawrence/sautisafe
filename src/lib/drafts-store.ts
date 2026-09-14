"use client";
// Offline draft queue for SautiSafe reports. Uses IndexedDB (not localStorage)
// because audio Blobs exceed localStorage's 5 MB quota.
//
// When a report submit fails (or the device is offline), the full report -
// including the recorded audio Blob - is saved here and retried when
// connectivity returns or the app reopens. This is the core "works offline"
// PWA behaviour the brief requires.

import * as React from "react";
import { submitIncident } from "@/lib/convex-data";

const DB_NAME = "sautisafe";
const STORE = "drafts";
const VERSION = 1;

export interface DraftReport {
  id: string;
  audioBlob: Blob;
  reportedBy: string | null;
  audioFileName: string;
  audioMimeType: string;
  audioSizeBytes: number;
  audioDurationSec: number;
  audioStoragePath: string | null;
  transcript: string | null;
  transcriptLatencyMs: number | null;
  transcriptProvider: string | null;
  language: string;
  fields: {
    location: string;
    equipment: string;
    hazard: string;
    peopleAffected: string;
    immediateAction: string;
    injuryStatus: string;
    severity: string;
    occurredAt: string;
  };
  followUps: { field: string; question: string; answer: string }[];
  urgentTags: string[];
  consentGiven: boolean;
  detectedLanguage: string | null;
  status: "queued" | "submitting" | "failed";
  error?: string | null;
  createdAt: number;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

export async function putDraft(draft: DraftReport): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllDrafts(): Promise<DraftReport[]> {
  const db = await getDB();
  return await new Promise<DraftReport[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as DraftReport[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

export async function updateDraftStatus(
  id: string,
  status: DraftReport["status"],
  error?: string | null,
): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const d = get.result as DraftReport | undefined;
      if (d) {
        d.status = status;
        d.error = error ?? d.error;
        store.put(d);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface RetryOutcome {
  id: string;
  ok: boolean;
  referenceNo?: string;
  error?: string;
}

/** Re-submit a single queued draft directly to Convex. On success the draft
 *  is removed; on failure its status is set to "failed" with the error. */
export async function retryDraft(draft: DraftReport): Promise<RetryOutcome> {
  try {
    await updateDraftStatus(draft.id, "submitting", null);
    const data = await submitIncident({
      audioBlob: draft.audioBlob,
      reportedBy: draft.reportedBy,
      audioFileName: draft.audioFileName,
      audioMimeType: draft.audioMimeType,
      audioSizeBytes: draft.audioSizeBytes,
      audioDurationSec: draft.audioDurationSec,
      audioStoragePath: draft.audioStoragePath,
      transcript: draft.transcript,
      transcriptLatencyMs: draft.transcriptLatencyMs,
      transcriptProvider: draft.transcriptProvider,
      language: draft.language,
      fields: draft.fields,
      followUps: draft.followUps,
      urgentTags: draft.urgentTags,
      consentGiven: draft.consentGiven,
      detectedLanguage: draft.detectedLanguage,
    });
    await deleteDraft(draft.id);
    return { id: draft.id, ok: true, referenceNo: data.referenceNo };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    await updateDraftStatus(draft.id, "failed", msg);
    return { id: draft.id, ok: false, error: msg };
  }
}

/** Retry every queued/failed draft (used by the online listener + manual button). */
export async function retryAllDrafts(): Promise<RetryOutcome[]> {
  const drafts = await getAllDrafts();
  const outcomes: RetryOutcome[] = [];
  for (const d of drafts) {
    if (d.status === "submitting") continue;
    outcomes.push(await retryDraft(d));
  }
  return outcomes;
}

// ── React hook: subscribes to draft count + signals changes ──────────────

const _listeners = new Set<() => void>();
function emit() {
  _listeners.forEach((l) => l());
}
let _channel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== "undefined") {
  _channel = new BroadcastChannel("sautisafe-drafts");
  _channel.onmessage = () => emit();
}

function notify() {
  emit();
  _channel?.postMessage("changed");
}

export function useDraftCount(): number {
  const [count, setCount] = React.useState(0);
  const refresh = React.useCallback(async () => {
    try {
      const all = await getAllDrafts();
      setCount(all.length);
    } catch {
      /* ignore */
    }
  }, []);
  React.useEffect(() => {
    refresh();
    const l = () => refresh();
    _listeners.add(l);
    const onOnline = () => refresh();
    window.addEventListener("online", onOnline);
    return () => {
      _listeners.delete(l);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);
  return count;
}

export { notify as notifyDraftsChanged };
