"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useAction, useConvex, useMutation as useConvexMutation } from "convex/react";
import {
  ShieldCheck,
  Loader2,
  FileText,
  Wand2,
  Save,
  RotateCcw,
  MessageSquareQuote,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AudioRecorder, type CapturedAudio } from "@/components/audio-recorder";
import { NativeSelect } from "@/components/ui/native-select";
import { UrgentBanner } from "@/components/urgent-banner";
import { useAppStore } from "@/lib/store";
import { detectUrgentTags, INJURY_LABELS, INJURY_STATUSES, SEVERITIES, SEVERITY_LABELS } from "@/lib/safety";
import { SUPPORTED_LANGUAGES, languageLabel } from "@/lib/languages";
import type { ExtractedFields, InjuryStatus, Severity } from "@/lib/types";
import { toast } from "sonner";
import { convexApi } from "@/lib/convex-api";
import { submitIncident, uploadAudio } from "@/lib/convex-data";

export function ReportTab() {
  const { draft, resetDraft, setDraft, setFields, setFollowUpAnswer, setTab, role } =
    useAppStore();
  const [captured, setCaptured] = React.useState<CapturedAudio | null>(null);
  const transcribe = useAction(convexApi.actions.transcribe.transcribeWithProvider);
  const extractFields = useAction(convexApi.actions.extract.extractSafetyFields);
  const convexClient = useConvex();
  const generateUploadUrl = useConvexMutation(convexApi.audio.generateUploadUrl);
  const saveAudio = useConvexMutation(convexApi.audio.saveAudio);
  const createIncident = useConvexMutation(convexApi.incidents.createIncident);
  const updateIncident = useConvexMutation(convexApi.incidents.updateIncident);
  const addTranscript = useConvexMutation(convexApi.transcripts.addTranscript);
  const createFollowUp = useConvexMutation(convexApi.followUps.createFollowUp);
  const answerFollowUp = useConvexMutation(convexApi.followUps.answerFollowUp);
  const incidentCalls = {
    generateUploadUrl,
    saveAudio,
    nextReferenceNo: (args: Record<string, never>) =>
      convexClient.query(convexApi.incidents.nextReferenceNo, args),
    createIncident,
    updateIncident,
    addTranscript,
    createFollowUp,
    answerFollowUp,
  };

  const transcribeMut = useMutation({
    mutationFn: async (audio: CapturedAudio) => {
      const audioStorageId = await uploadAudio(
        audio.wavBlob,
        audio.fileName,
        audio.mimeType,
        audio.sizeBytes,
        { generateUploadUrl, saveAudio },
      );
      const result = await transcribe({
        provider: "sahara",
        language: draft.language,
        audioStorageId,
      });
      return { ...result, provider: "sahara", audioRef: audioStorageId } as {
        text: string;
        latencyMs: number;
        provider: string;
        language?: string;
        via?: string;
        audioRef: string;
      };
    },
    onSuccess: (data) => {
      setDraft({
        transcript: data.text,
        transcriptLatencyMs: data.latencyMs,
        transcriptProvider: data.provider,
        transcriptVia: data.via ?? null,
        audioStoragePath: data.audioRef ?? null,
      });
      const who =
        data.provider === "sahara"
          ? `Sahara (Intron)${data.via === "sync-503-then-poll" || data.via === "async-poll" ? " · async poll" : ""}`
          : data.via === "no-intron-key"
            ? "z-ai ASR (no Intron key)"
            : "z-ai ASR (fallback)";
      toast.success("Transcription complete", {
        description: `${who} · ${data.latencyMs}ms · ${languageLabel(data.language)}`,
      });
    },
    onError: (e: Error) => toast.error("Transcription failed", { description: e.message }),
  });

  const extractMut = useMutation({
    mutationFn: () =>
      extractFields({ transcript: draft.transcript ?? "" }) as Promise<ExtractedFields>,
    onSuccess: (data) => {
      const tags = data.urgentTags?.length ? data.urgentTags : detectUrgentTags(draft.transcript ?? "");
      setDraft({
        extracted: data,
        urgentTags: tags,
        fields: {
          location: data.location ?? "",
          equipment: data.equipment ?? "",
          hazard: data.hazard ?? "",
          peopleAffected: data.peopleAffected ?? "",
          immediateAction: data.immediateAction ?? "",
          injuryStatus: (data.injuryStatus as InjuryStatus | "") ?? "",
          severity: (data.severity as Severity | "") ?? "",
          occurredAt: data.occurredAt ? data.occurredAt.slice(0, 16) : "",
        },
        followUps: (data.followUpQuestions ?? []).map((q) => ({
          field: q.field,
          question: q.question,
          answer: "",
        })),
        status: "extracted",
      });
      toast.success("Safety fields extracted", {
        description: data.missingFields?.length
          ? `${data.missingFields.length} field(s) need follow-up`
          : "All key fields detected",
      });
    },
    onError: (e: Error) => toast.error("Extraction failed", { description: e.message }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      return await submitIncident({
        audioBlob: captured?.wavBlob,
        reportedBy: draft.reportedBy ?? null,
        audioFileName: captured?.fileName ?? draft.audioFileName,
        audioMimeType: captured?.mimeType ?? draft.audioMimeType,
        audioSizeBytes: captured?.sizeBytes ?? draft.audioSizeBytes,
        audioDurationSec: captured?.durationSec ?? draft.audioDurationSec,
        audioStoragePath: draft.audioStoragePath ?? null,
        transcript: draft.transcript,
        transcriptLatencyMs: draft.transcriptLatencyMs,
        transcriptProvider: draft.transcriptProvider ?? "zai-asr",
        language: draft.language,
        fields: draft.fields,
        followUps: draft.followUps,
        urgentTags: draft.urgentTags,
        consentGiven: draft.consentGiven,
        detectedLanguage: draft.extracted?.detectedLanguage ?? null,
      }, incidentCalls);
    },
    onSuccess: (data) => {
      if (role === "technician") {
        toast.success("Submitted to your supervisor", {
          description: `Reference ${data.referenceNo}. Your supervisor will review it.`,
          duration: 6000,
        });
      } else {
        toast.success("Report submitted", {
          description: `Reference ${data.referenceNo}`,
        });
      }
      resetDraft();
      setCaptured(null);
      // supervisors go to the queue; technicians stay on the recorder
      setTab(role === "supervisor" ? "reports" : "report");
    },
    onError: async (e: Error) => {
      // If the submit failed (offline, network, or server error), persist the
      // complete report - including the audio Blob - to the offline draft
      // queue so it survives refresh and retries when connectivity returns.
      if (captured && draft.transcript) {
        try {
          const id = crypto.randomUUID();
          const { putDraft, notifyDraftsChanged } = await import("@/lib/drafts-store");
          await putDraft({
            id,
            audioBlob: captured.wavBlob,
            reportedBy: draft.reportedBy ?? null,
            audioFileName: captured.fileName,
            audioMimeType: captured.mimeType,
            audioSizeBytes: captured.sizeBytes,
            audioDurationSec: captured.durationSec,
            audioStoragePath: draft.audioStoragePath ?? null,
            transcript: draft.transcript,
            transcriptLatencyMs: draft.transcriptLatencyMs ?? null,
            transcriptProvider: draft.transcriptProvider ?? null,
            language: draft.language,
            fields: { ...draft.fields },
            followUps: [...draft.followUps],
            urgentTags: [...draft.urgentTags],
            consentGiven: draft.consentGiven,
            detectedLanguage: draft.extracted?.detectedLanguage ?? null,
            status: "queued",
            error: e.message,
            createdAt: Date.now(),
          });
          notifyDraftsChanged();
          toast.warning("Saved offline", {
            description: "The report will submit automatically when you're back online.",
            duration: 6000,
          });
          resetDraft();
          setCaptured(null);
          setTab(role === "supervisor" ? "reports" : "report");
          return;
        } catch {
          /* fall through to the normal error toast */
        }
      }
      toast.error("Could not save report", { description: e.message });
    },
  });

  function handleAnalyze() {
    if (!captured) return;
    transcribeMut.mutate(captured, {
      onSuccess: () => extractMut.mutate(),
    });
  }

  function handleNew() {
    resetDraft();
    if (captured) URL.revokeObjectURL(captured.playUrl);
    setCaptured(null);
  }

  const hasAudio = !!captured;
  const hasTranscript = !!draft.transcript;
  const hasExtracted = !!draft.extracted;
  const analyzing = transcribeMut.isPending || extractMut.isPending;

  return (
    <div className="space-y-6">
      {/* Step 1 - consent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
              1
            </span>
            Consent &amp; safety notice
          </CardTitle>
          <CardDescription>
            Before recording, confirm the worker consents and understands this is not an emergency channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <strong>Follow emergency procedures first.</strong> If there is an active
              fire, injury, gas leak, or danger to life, raise the alarm and call your
              site emergency number <em>before</em> recording this report.
            </p>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={draft.consentGiven}
              onCheckedChange={(v) => setDraft({ consentGiven: v === true })}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              The reporter consents to audio recording, transcription, and storage of
              this incident report for supervisor review. Personal names will not be
              included in benchmark material.
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="reportedBy">Your name <span className="text-muted-foreground">(optional, shown to your supervisor)</span></Label>
            <Input
              id="reportedBy"
              value={draft.reportedBy ?? ""}
              onChange={(e) => setDraft({ reportedBy: e.target.value })}
              placeholder="e.g. John M."
              className="h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2 - record */}
      <Card className={draft.consentGiven ? "" : "pointer-events-none opacity-50"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                draft.consentGiven ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              2
            </span>
            Record or upload the report
          </CardTitle>
          <CardDescription>
            Describe what happened in your own words and language. Code-switching is expected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5 sm:max-w-xs sm:flex-1">
              <Label htmlFor="language">Speaking language</Label>
              <NativeSelect
                id="language"
                aria-label="Speaking language"
                value={draft.language}
                onValueChange={(v) => setDraft({ language: v })}
                options={SUPPORTED_LANGUAGES.map((l) => ({
                  value: l.code,
                  label: l.label,
                  hint: l.codeSwitched ? "code-switched" : undefined,
                }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Pick the language the worker is speaking. Intron ships dedicated
                code-switched models for African languages.
              </p>
            </div>
          </div>
          <AudioRecorder
            captured={captured}
            disabled={!draft.consentGiven}
            onCaptured={(a) => {
              setCaptured(a);
              setDraft({
                audioFileName: a.fileName,
                audioMimeType: a.mimeType,
                audioSizeBytes: a.sizeBytes,
                audioDurationSec: a.durationSec,
              });
            }}
            onClear={() => {
              setCaptured(null);
              setDraft({
                audioFileName: undefined,
                audioMimeType: undefined,
                audioSizeBytes: undefined,
                audioDurationSec: undefined,
                audioStoragePath: undefined,
                transcript: undefined,
                transcriptLatencyMs: undefined,
                transcriptProvider: undefined,
                transcriptVia: undefined,
                extracted: undefined,
                urgentTags: [],
              });
            }}
          />
          {hasAudio && !hasTranscript && (
            <div className="mt-4 flex justify-end">
              <Button onClick={handleAnalyze} disabled={analyzing} size="lg">
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Transcribe &amp; analyze
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3 - transcript + extraction */}
      {hasTranscript && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </span>
              Transcript &amp; extracted report
            </CardTitle>
            <CardDescription>
              Verify the transcript and the structured fields. You can correct anything before submitting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {draft.urgentTags && draft.urgentTags.length > 0 && (
              <UrgentBanner tags={draft.urgentTags} />
            )}

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transcript
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.transcriptProvider && (
                    <Badge
                      variant="outline"
                      className={
                        draft.transcriptProvider === "sahara"
                          ? "border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-300"
                          : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                      }
                    >
                      {draft.transcriptProvider === "sahara"
                        ? "Sahara (Intron)"
                        : "z-ai ASR (fallback)"}
                      {draft.transcriptVia === "no-intron-key" && " · no key"}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="font-mono text-xs">
                    {languageLabel(draft.language)}
                  </Badge>
                  {draft.transcriptLatencyMs != null && (
                    <Badge variant="secondary" className="font-mono text-xs">
                      <Clock className="h-3 w-3" />
                      {draft.transcriptLatencyMs}ms
                    </Badge>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {draft.transcript}
              </p>
            </div>

            {analyzing && !hasExtracted && (
              <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting safety fields…
              </div>
            )}

            {hasExtracted && <StructuredFieldsForm />}

            {hasExtracted && draft.followUps.length > 0 && (
              <FollowUpsCard
                followUps={draft.followUps}
                onAnswer={(i, a) => setFollowUpAnswer(i, a)}
              />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={handleNew}>
                <RotateCcw className="h-4 w-4" />
                Start new report
              </Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Submit for supervisor review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasAudio && !hasTranscript && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Once you record or upload audio, SautiSafe will transcribe it, extract the
            safety fields, ask focused follow-ups if anything is missing, and flag
            urgent language for immediate review.
          </p>
        </div>
      )}
    </div>
  );
}

function StructuredFieldsForm() {
  const { draft, setFields } = useAppStore();
  const f = draft.fields;
  const missing = draft.extracted?.missingFields ?? [];

  const fields: { key: keyof typeof f; label: string; required?: boolean }[] = [
    { key: "location", label: "Location", required: true },
    { key: "equipment", label: "Equipment / asset" },
    { key: "hazard", label: "Hazard / incident", required: true },
    { key: "peopleAffected", label: "People affected" },
    { key: "immediateAction", label: "Immediate action taken" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Structured safety report</h4>
        {missing.length > 0 && (
          <Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-700">
            {missing.length} field(s) suggested for follow-up
          </Badge>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ key, label, required }) => {
          const isMissing = missing.includes(key as string);
          return (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="flex items-center gap-1">
                {label}
                {required && <span className="text-destructive">*</span>}
                {isMissing && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-600">
                    needs follow-up
                  </span>
                )}
              </Label>
              <Textarea
                id={key}
                value={f[key]}
                onChange={(e) => setFields({ [key]: e.target.value } as never)}
                rows={key === "hazard" || key === "immediateAction" ? 2 : 1}
                className="resize-none"
                placeholder={`Describe the ${label.toLowerCase()}…`}
              />
            </div>
          );
        })}
        <div className="space-y-1.5">
          <Label htmlFor="occurredAt">Time of occurrence</Label>
          <Input
            id="occurredAt"
            type="datetime-local"
            value={f.occurredAt}
            onChange={(e) => setFields({ occurredAt: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Injury status</Label>
          <Select
            value={f.injuryStatus || ""}
            onValueChange={(v) => setFields({ injuryStatus: v as InjuryStatus })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {INJURY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {INJURY_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Severity</Label>
          <Select
            value={f.severity || ""}
            onValueChange={(v) => setFields({ severity: v as Severity })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {draft.extracted?.detectedLanguage && (
        <p className="text-xs text-muted-foreground">
          Detected language: <span className="font-mono">{draft.extracted.detectedLanguage}</span>
        </p>
      )}
    </div>
  );
}

function FollowUpsCard({
  followUps,
  onAnswer,
}: {
  followUps: { field: string; question: string; answer: string }[];
  onAnswer: (index: number, answer: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Focused follow-up questions</h4>
      </div>
      <Separator />
      {followUps.map((fu, i) => (
        <div key={i} className="space-y-1.5">
          <Label className="flex items-center gap-2 text-sm">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
              {fu.field}
            </span>
            {fu.question}
          </Label>
          <Textarea
            value={fu.answer}
            onChange={(e) => onAnswer(i, e.target.value)}
            rows={2}
            className="resize-none"
            placeholder="Answer in any language…"
          />
        </div>
      ))}
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" />
        Answers are merged into the structured report before submission.
      </p>
    </div>
  );
}
