import { convex } from "@/lib/convex";
import { convexApi } from "@/lib/convex-api";
import type {
  AuditEvent,
  BenchmarkResult,
  BenchmarkRun,
  FollowUp,
  Incident,
  Transcript,
} from "@/lib/types";

type UnknownRecord = Record<string, any>;

export interface IncidentSubmission {
  audioBlob?: Blob | null;
  reportedBy?: string | null;
  audioFileName?: string | null;
  audioMimeType?: string | null;
  audioSizeBytes?: number | null;
  audioDurationSec?: number | null;
  audioStoragePath?: string | null;
  transcript?: string | null;
  transcriptLatencyMs?: number | null;
  transcriptProvider?: string | null;
  language?: string | null;
  fields: {
    location?: string;
    equipment?: string;
    hazard?: string;
    peopleAffected?: string;
    immediateAction?: string;
    injuryStatus?: string;
    severity?: string;
    occurredAt?: string;
  };
  followUps?: { field: string; question: string; answer: string }[];
  urgentTags?: string[];
  consentGiven: boolean;
  detectedLanguage?: string | null;
}

export interface AudioCalls {
  generateUploadUrl: (args: Record<string, never>) => Promise<unknown>;
  saveAudio: (args: UnknownRecord) => Promise<unknown>;
}

export interface IncidentCalls extends AudioCalls {
  nextReferenceNo: (args: Record<string, never>) => Promise<unknown>;
  createIncident: (args: UnknownRecord) => Promise<unknown>;
  updateIncident: (args: UnknownRecord) => Promise<unknown>;
  addTranscript: (args: UnknownRecord) => Promise<unknown>;
  createFollowUp: (args: UnknownRecord) => Promise<unknown>;
  answerFollowUp: (args: UnknownRecord) => Promise<unknown>;
}

const directAudioCalls: AudioCalls = {
  generateUploadUrl: (args) => convex.mutation(convexApi.audio.generateUploadUrl, args),
  saveAudio: (args) => convex.mutation(convexApi.audio.saveAudio, args),
};

const directIncidentCalls: IncidentCalls = {
  ...directAudioCalls,
  nextReferenceNo: (args) => convex.query(convexApi.incidents.nextReferenceNo, args),
  createIncident: (args) => convex.mutation(convexApi.incidents.createIncident, args),
  updateIncident: (args) => convex.mutation(convexApi.incidents.updateIncident, args),
  addTranscript: (args) => convex.mutation(convexApi.transcripts.addTranscript, args),
  createFollowUp: (args) => convex.mutation(convexApi.followUps.createFollowUp, args),
  answerFollowUp: (args) => convex.mutation(convexApi.followUps.answerFollowUp, args),
};

function defined<T extends UnknownRecord>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export async function uploadAudio(
  blob: Blob,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  calls: AudioCalls = directAudioCalls,
): Promise<string> {
  const uploadUrl = (await calls.generateUploadUrl({})) as string;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!response.ok) throw new Error(`Audio upload failed (HTTP ${response.status})`);
  const { storageId } = (await response.json()) as { storageId: string };
  const saved = (await calls.saveAudio({ storageId, fileName, mimeType, sizeBytes })) as {
    storageId: string;
  };
  return saved.storageId;
}

export async function submitIncident(
  input: IncidentSubmission,
  calls: IncidentCalls = directIncidentCalls,
): Promise<{
  id: string;
  referenceNo: string;
}> {
  if (!input.consentGiven) throw new Error("Consent is required before saving a report");
  if (!input.transcript && !input.fields.hazard) {
    throw new Error("A transcript or hazard description is required");
  }

  let audioStoragePath = input.audioStoragePath ?? undefined;
  if (!audioStoragePath && input.audioBlob) {
    audioStoragePath = await uploadAudio(
      input.audioBlob,
      input.audioFileName || "report.wav",
      input.audioMimeType || input.audioBlob.type || "audio/wav",
      input.audioSizeBytes ?? input.audioBlob.size,
      calls,
    );
  }

  const referenceNo = (await calls.nextReferenceNo({})) as string;
  const incidentId = (await calls.createIncident(
    defined({
      referenceNo,
      reportedBy: input.reportedBy || undefined,
      audioFileName: input.audioFileName || undefined,
      audioMimeType: input.audioMimeType || undefined,
      audioSizeBytes: input.audioSizeBytes ?? undefined,
      audioDurationSec: input.audioDurationSec ?? undefined,
      audioStoragePath,
      rawTranscript: input.transcript || undefined,
      consentGiven: input.consentGiven,
      detectedLanguage: input.detectedLanguage || input.language || undefined,
    }),
  )) as string;

  const tags = input.urgentTags ?? [];
  const occurredAt = input.fields.occurredAt
    ? new Date(input.fields.occurredAt).getTime()
    : undefined;
  await calls.updateIncident(
    defined({
      id: incidentId,
      location: input.fields.location || undefined,
      equipment: input.fields.equipment || undefined,
      hazard: input.fields.hazard || undefined,
      peopleAffected: input.fields.peopleAffected || undefined,
      immediateAction: input.fields.immediateAction || undefined,
      injuryStatus: input.fields.injuryStatus || undefined,
      severity: input.fields.severity || undefined,
      occurredAt: occurredAt && !Number.isNaN(occurredAt) ? occurredAt : undefined,
      status: "review",
      isUrgent: tags.length > 0,
      urgencyTags: JSON.stringify(tags),
      actionOverride: tags.length > 0 ? "escalated" : "extracted",
      actionDetail: `${tags.length} urgent tag(s)`,
    }),
  );

  if (input.transcript) {
    await calls.addTranscript(
      defined({
        incidentId,
        provider: input.transcriptProvider || "sahara",
        text: input.transcript,
        language: input.language || undefined,
        latencyMs: input.transcriptLatencyMs ?? undefined,
        wordCount: input.transcript.split(/\s+/).filter(Boolean).length,
        isPrimary: true,
      }),
    );
  }

  for (const followUp of input.followUps ?? []) {
    if (!followUp.question.trim()) continue;
    const followUpId = (await calls.createFollowUp(
      defined({
        incidentId,
        field: followUp.field || undefined,
        question: followUp.question,
      }),
    )) as string;
    if (followUp.answer.trim()) {
      await calls.answerFollowUp({
        id: followUpId,
        answer: followUp.answer.trim(),
      });
    }
  }

  return { id: incidentId, referenceNo };
}

function iso(value: number | undefined): string | null {
  return value === undefined ? null : new Date(value).toISOString();
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function adaptIncident(doc: UnknownRecord, detail?: UnknownRecord): Incident {
  const source = detail?.incident ?? doc;
  return {
    ...source,
    id: source._id,
    workerId: source.workerId ?? null,
    audioStoragePath: source.audioStoragePath ?? null,
    occurredAt: iso(source.occurredAt),
    reviewedAt: iso(source.reviewedAt),
    urgencyTags: parseTags(source.urgencyTags),
    followUps: ((detail?.followUps ?? []) as UnknownRecord[]).map(adaptFollowUp),
    transcripts: ((detail?.transcripts ?? []) as UnknownRecord[]).map(adaptTranscript),
    auditEvents: ((detail?.auditEvents ?? []) as UnknownRecord[]).map(adaptAuditEvent),
    createdAt: iso(source.createdAt)!,
    updatedAt: iso(source.updatedAt)!,
  } as Incident;
}

function adaptFollowUp(doc: UnknownRecord): FollowUp {
  return {
    ...doc,
    id: doc._id,
    askedAt: iso(doc.askedAt)!,
    answeredAt: iso(doc.answeredAt),
  } as FollowUp;
}

function adaptTranscript(doc: UnknownRecord): Transcript {
  return { ...doc, id: doc._id, createdAt: iso(doc.createdAt)! } as Transcript;
}

function adaptAuditEvent(doc: UnknownRecord): AuditEvent {
  return { ...doc, id: doc._id, createdAt: iso(doc.createdAt)! } as AuditEvent;
}

export function adaptBenchmarkResult(result: UnknownRecord): BenchmarkResult {
  const metrics = result.metrics ?? {};
  return {
    provider: result.provider,
    text: result.text ?? "",
    wer: metrics.wer ?? null,
    werUnnorm: metrics.werUnnorm ?? metrics.wer ?? null,
    cer: metrics.cer ?? null,
    cerUnnorm: metrics.cerUnnorm ?? metrics.cer ?? null,
    criticalTermRecall: metrics.criticalTermRecall ?? null,
    latencyMs: metrics.latencyMs ?? null,
    wordCount: metrics.wordCount ?? null,
    error: result.error ?? null,
    success: !result.error,
    simulated: false,
  };
}

export function aggregateBenchmarkResults(results: BenchmarkResult[]) {
  const successful = results.filter((result) => result.success);
  const average = (field: keyof BenchmarkResult) => {
    const values = successful
      .map((result) => result[field])
      .filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  return {
    avgWer: average("wer"),
    avgCer: average("cer"),
    avgCriticalTermRecall: average("criticalTermRecall"),
    avgLatencyMs: average("latencyMs"),
  };
}

export function adaptBenchmarkRun(doc: UnknownRecord): BenchmarkRun {
  let rawResults: UnknownRecord[] = [];
  try {
    rawResults = JSON.parse(doc.resultsJson);
  } catch {
    rawResults = [];
  }
  return {
    id: doc._id,
    referenceNo: doc.referenceNo,
    scenario: doc.scenario ?? null,
    audioFileName: doc.audioFileName ?? null,
    referenceTranscript: doc.referenceTranscript,
    results: rawResults.map((result) =>
      result.metrics ? adaptBenchmarkResult(result) : (result as unknown as BenchmarkResult),
    ),
    aggregateMetrics: doc.aggregateMetrics ? JSON.parse(doc.aggregateMetrics) : null,
    createdAt: iso(doc.createdAt)!,
  };
}
