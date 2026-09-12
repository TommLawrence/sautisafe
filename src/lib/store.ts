"use client";
import { create } from "zustand";
import type { ExtractedFields, FollowUp, IncidentStatus, InjuryStatus, Severity } from "@/lib/types";

export type TabKey = "report" | "reports" | "benchmark" | "about";

interface ReportDraft {
  incidentId?: string | null;
  referenceNo?: string | null;
  audioBlobUrl?: string | null;
  audioFileName?: string | null;
  audioMimeType?: string | null;
  audioSizeBytes?: number | null;
  audioDurationSec?: number | null;
  audioStoragePath?: string | null;
  transcript?: string | null;
  transcriptLatencyMs?: number | null;
  /** Which STT provider actually ran (e.g. "sahara" | "zai-asr"). */
  transcriptProvider?: string | null;
  transcriptVia?: string | null;
  extracted?: ExtractedFields | null;
  // editable structured fields the user can correct
  fields: {
    location: string;
    equipment: string;
    hazard: string;
    peopleAffected: string;
    immediateAction: string;
    injuryStatus: InjuryStatus | "";
    severity: Severity | "";
    occurredAt: string;
  };
  followUps: { field: string; question: string; answer: string }[];
  urgentTags: string[];
  consentGiven: boolean;
  /** Intron/Sahara STT language code, e.g. "lg" (Luganda-English). */
  language: string;
  status: IncidentStatus | "new";
}

const emptyDraft: ReportDraft = {
  fields: {
    location: "",
    equipment: "",
    hazard: "",
    peopleAffected: "",
    immediateAction: "",
    injuryStatus: "",
    severity: "",
    occurredAt: "",
  },
  followUps: [],
  urgentTags: [],
  consentGiven: false,
  language: "lg",
  status: "new",
};

interface AppState {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  draft: ReportDraft;
  resetDraft: () => void;
  setDraft: (patch: Partial<ReportDraft>) => void;
  setFields: (patch: Partial<ReportDraft["fields"]>) => void;
  setFollowUps: (f: ReportDraft["followUps"]) => void;
  setFollowUpAnswer: (index: number, answer: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  tab: "report",
  setTab: (t) => set({ tab: t }),
  draft: { ...emptyDraft },
  resetDraft: () =>
    set({
      draft: { ...emptyDraft, fields: { ...emptyDraft.fields } },
    }),
  setDraft: (patch) =>
    set((s) => ({ draft: { ...s.draft, ...patch, fields: { ...s.draft.fields } } })),
  setFields: (patch) =>
    set((s) => ({
      draft: { ...s.draft, fields: { ...s.draft.fields, ...patch } },
    })),
  setFollowUps: (f) => set((s) => ({ draft: { ...s.draft, followUps: f } })),
  setFollowUpAnswer: (index, answer) =>
    set((s) => {
      const next = s.draft.followUps.map((f, i) =>
        i === index ? { ...f, answer } : f,
      );
      return { draft: { ...s.draft, followUps: next } };
    }),
}));
