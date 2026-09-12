"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
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
import { UrgentBanner } from "@/components/urgent-banner";
import { useAppStore } from "@/lib/store";
import { detectUrgentTags, INJURY_LABELS, INJURY_STATUSES, SEVERITIES, SEVERITY_LABELS } from "@/lib/safety";
import { formatBytes } from "@/lib/audio-utils";
import type { ExtractedFields, InjuryStatus, Severity } from "@/lib/types";
import { toast } from "sonner";

async function postTranscribe(audio: CapturedAudio) {
  const fd = new FormData();
  fd.append("audio", audio.wavBlob, audio.fileName);
  fd.append("mimeType", audio.mimeType);
  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json()).error || "Transcription failed");
  return (await res.json()) as { text: string; latencyMs: number };
}

async function postExtract(transcript: string) {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Extraction failed");
  return (await res.json()) as ExtractedFields;
}

export function ReportTab() {
  const { draft, resetDraft, setDraft, setFields, setFollowUpAnswer, setTab } =
    useAppStore();
  const [captured, setCaptured] = React.useState<CapturedAudio | null>(null);

  const transcribeMut = useMutation({
    mutationFn: postTranscribe,
    onSuccess: (data) => {
      setDraft({ transcript: data.text, transcriptLatencyMs: data.latencyMs });
      toast.success("Transcription complete", {
        description: `Sahara (test) · ${data.latencyMs}ms`,
      });
    },
    onError: (e: Error) => toast.error("Transcription failed", { description: e.message }),
  });

  const extractMut = useMutation({
    mutationFn: () => postExtract(draft.transcript ?? ""),
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
      const body = {
        audioFileName: captured?.fileName ?? draft.audioFileName,
        audioMimeType: captured?.mimeType ?? draft.audioMimeType,
        audioSizeBytes: captured?.sizeBytes ?? draft.audioSizeBytes,
        audioDurationSec: captured?.durationSec ?? draft.audioDurationSec,
        transcript: draft.transcript,
        transcriptLatencyMs: draft.transcriptLatencyMs,
        fields: draft.fields,
        followUps: draft.followUps,
        urgentTags: draft.urgentTags,
        consentGiven: draft.consentGiven,
        detectedLanguage: draft.extracted?.detectedLanguage ?? null,
      };
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      return (await res.json()) as { id: string; referenceNo: string };
    },
    onSuccess: (data) => {
      toast.success("Report submitted", {
        description: `Reference ${data.referenceNo}`,
      });
      resetDraft();
      setCaptured(null);
      setTab("reports");
    },
    onError: (e: Error) => toast.error("Could not save report", { description: e.message }),
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
      {/* Step 1 — consent */}
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
        </CardContent>
      </Card>

      {/* Step 2 — record */}
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
                transcript: undefined,
                transcriptLatencyMs: undefined,
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

      {/* Step 3 — transcript + extraction */}
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
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transcript
                </span>
                {draft.transcriptLatencyMs != null && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    <Clock className="h-3 w-3" />
                    {draft.transcriptLatencyMs}ms
                  </Badge>
                )}
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
