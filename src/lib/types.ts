// SautiSafe shared TypeScript types.
// These mirror the Prisma models in /prisma/schema.prisma and the Convex
// tables in /convex/schema.ts. Keep the three in sync when changing fields.

export type InjuryStatus = "none" | "minor" | "serious" | "unknown";
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatus =
  | "draft"
  | "extracted"
  | "review"
  | "submitted"
  | "escalated"
  | "resolved";

export type SpeechProvider = "sahara" | "whisper" | "gemini" | "zai-asr";

/** A single safety incident or near-miss report. */
export interface Incident {
  id: string;
  referenceNo: string;
  workerId?: string | null;
  worker?: { id: string; displayName?: string | null; role?: string | null; department?: string | null } | null;
  audioFileName?: string | null;
  audioMimeType?: string | null;
  audioSizeBytes?: number | null;
  audioDurationSec?: number | null;
  audioStoragePath?: string | null;
  rawTranscript?: string | null;
  location?: string | null;
  equipment?: string | null;
  hazard?: string | null;
  peopleAffected?: string | null;
  immediateAction?: string | null;
  injuryStatus?: InjuryStatus | null;
  severity?: Severity | null;
  occurredAt?: string | null;
  status: IncidentStatus;
  isUrgent: boolean;
  urgencyTags?: string[] | null;
  consentGiven: boolean;
  detectedLanguage?: string | null;
  supervisorNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  followUps: FollowUp[];
  transcripts: Transcript[];
  auditEvents: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  incidentId: string;
  field?: string | null;
  question: string;
  answer?: string | null;
  askedAt: string;
  answeredAt?: string | null;
}

export interface Transcript {
  id: string;
  incidentId: string;
  provider: SpeechProvider;
  text: string;
  language?: string | null;
  durationMs?: number | null;
  latencyMs?: number | null;
  wordCount?: number | null;
  confidence?: number | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  incidentId: string;
  action: string;
  actor?: string | null;
  detail?: string | null;
  createdAt: string;
}

export interface BenchmarkResult {
  provider: SpeechProvider;
  text: string;
  wer: number | null; // word error rate 0..1
  cer: number | null; // char error rate 0..1
  criticalTermRecall: number | null; // 0..1
  latencyMs: number | null;
  wordCount: number | null;
  error?: string | null; // safe provider error message
  success: boolean;
  /** True when this lane was produced by a degradation simulation in the test
   *  environment (no real provider key configured). Always labelled clearly. */
  simulated?: boolean;
}

export interface BenchmarkRun {
  id: string;
  referenceNo: string;
  scenario?: string | null;
  audioFileName?: string | null;
  referenceTranscript: string;
  results: BenchmarkResult[];
  aggregateMetrics?: {
    avgWer: number | null;
    avgCer: number | null;
    avgCriticalTermRecall: number | null;
    avgLatencyMs: number | null;
  } | null;
  createdAt: string;
}

/** Structured extraction output from the LLM. */
export interface ExtractedFields {
  location?: string | null;
  equipment?: string | null;
  hazard?: string | null;
  peopleAffected?: string | null;
  immediateAction?: string | null;
  injuryStatus?: InjuryStatus | null;
  severity?: Severity | null;
  occurredAt?: string | null; // ISO
  detectedLanguage?: string | null;
  urgentTags: string[];
  missingFields: string[];
  followUpQuestions: { field: string; question: string }[];
}

export interface IncidentDetailResponse {
  incident: Incident;
}

export interface ApiError {
  error: string;
  detail?: string;
}
