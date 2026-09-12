"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Filter,
  Loader2,
  ClipboardList,
  Siren,
  Download,
  CheckCircle2,
  ArrowUpCircle,
  ShieldCheck,
  Clock,
  FileAudio,
  ChevronRight,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { UrgentChip, UrgentBanner } from "@/components/urgent-banner";
import {
  INCIDENT_STATUSES,
  SEVERITY_BADGE,
  SEVERITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  INJURY_LABELS,
} from "@/lib/safety";
import type { BenchmarkResult, Incident, IncidentStatus, Severity } from "@/lib/types";
import { pct, ms } from "@/lib/metrics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

async function fetchIncidents(params: { status?: string; urgent?: string; q?: string }) {
  const sp = new URLSearchParams();
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.urgent === "urgent") sp.set("urgent", "true");
  if (params.q) sp.set("q", params.q);
  const res = await fetch(`/api/incidents?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed to load reports");
  return (await res.json()) as { incidents: Incident[] };
}

async function fetchIncident(id: string) {
  const res = await fetch(`/api/incidents/${id}`);
  if (!res.ok) throw new Error("Failed to load report");
  return (await res.json()) as { incident: Incident };
}

export function ReportsTab() {
  const [status, setStatus] = React.useState<string>("all");
  const [urgent, setUrgent] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["incidents", status, urgent, q],
    queryFn: () => fetchIncidents({ status, urgent, q }),
  });

  const incidents = data?.incidents ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Supervisor queue
          </CardTitle>
          <CardDescription>
            Review, escalate, or resolve reported incidents and near misses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by reference, location, equipment…"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-44">
                <Filter className="mr-1 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INCIDENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={urgent} onValueChange={setUrgent}>
              <SelectTrigger className="sm:w-36">
                <SelectValue placeholder="Urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reports</SelectItem>
                <SelectItem value="urgent">Urgent only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading reports…
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
              <ClipboardList className="h-8 w-8" />
              <p className="text-sm">No reports match these filters yet.</p>
              <p className="text-xs">Submit one from the Report tab to see it here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border scroll-thin max-h-[60vh] overflow-y-auto">
              {incidents.map((inc) => (
                <li key={inc.id}>
                  <button
                    onClick={() => setOpenId(inc.id)}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {inc.referenceNo}
                        </span>
                        {inc.isUrgent && <UrgentChip />}
                      </div>
                      <p className="line-clamp-1 text-sm text-foreground">
                        {inc.hazard || inc.rawTranscript || "No description yet"}
                      </p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {inc.location || "Location not specified"}
                        {inc.equipment ? ` · ${inc.equipment}` : ""}
                      </p>
                      <p className="text-[11px] font-medium text-primary sm:hidden">
                        Tap to review →
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <div className="flex items-center gap-1.5">
                        {inc.severity && (
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-xs font-medium",
                              SEVERITY_BADGE[inc.severity],
                            )}
                          >
                            {SEVERITY_LABELS[inc.severity]}
                          </span>
                        )}
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            STATUS_BADGE[inc.status] ?? STATUS_BADGE.draft,
                          )}
                        >
                          {STATUS_LABELS[inc.status] ?? inc.status}
                        </span>
                      </div>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {timeAgo(inc.createdAt)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ReviewSheet incidentId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function ReviewSheet({
  incidentId,
  onClose,
}: {
  incidentId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = React.useState("");
  const [reviewer, setReviewer] = React.useState("");
  const [nextStatus, setNextStatus] = React.useState<IncidentStatus>("review");

  const { data, isLoading } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => fetchIncident(incidentId!),
    enabled: !!incidentId,
  });

  React.useEffect(() => {
    if (data?.incident) {
      setNotes(data.incident.supervisorNotes ?? "");
      setReviewer(data.incident.reviewedBy ?? "");
      setNextStatus((data.incident.status as IncidentStatus) || "review");
    }
  }, [data?.incident?.id]);

  const reviewMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisorNotes: notes,
          reviewedBy: reviewer,
          status: nextStatus,
          reviewedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Review failed");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Review saved");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      onClose();
    },
    onError: (e: Error) => toast.error("Review failed", { description: e.message }),
  });

  const inc = data?.incident;

  function exportReport() {
    if (!inc) return;
    const md = buildExport(inc);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inc.referenceNo}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Sheet open={!!incidentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 sm:max-h-[90vh] sm:max-w-2xl">
        <SheetHeader className="border-b pr-6">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="font-mono">{inc?.referenceNo ?? "Loading…"}</SheetTitle>
            {inc?.isUrgent && <UrgentChip />}
          </div>
          <SheetDescription>
            {inc
              ? `Reported ${timeAgo(inc.createdAt)} · ${STATUS_LABELS[inc.status] ?? inc.status}`
              : "Reviewing incident report"}
          </SheetDescription>
        </SheetHeader>
        {isLoading || !inc ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 scroll-thin">
            <div className="space-y-5 p-4 pr-6">
              {inc.isUrgent && inc.urgencyTags && (
                <UrgentBanner tags={inc.urgencyTags} />
              )}

              {inc.rawTranscript && (
                <Section title="Transcript" icon={<FileAudio className="h-4 w-4" />}>
                  <EditableTranscript
                    incidentId={inc.id}
                    text={inc.rawTranscript}
                    hasAudio={!!inc.audioStoragePath}
                    onBenchmarked={() => qc.refetchQueries({ queryKey: ["incident", incidentId] })}
                  />
                </Section>
              )}

              <Section title="Structured report" icon={<ClipboardList className="h-4 w-4" />}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Location" value={inc.location} />
                  <Field label="Equipment / asset" value={inc.equipment} />
                  <Field label="Hazard / incident" value={inc.hazard} full />
                  <Field label="People affected" value={inc.peopleAffected} />
                  <Field label="Immediate action" value={inc.immediateAction} full />
                  <Field label="Injury status" value={inc.injuryStatus ? INJURY_LABELS[inc.injuryStatus] : undefined} />
                  <Field
                    label="Severity"
                    value={inc.severity ? SEVERITY_LABELS[inc.severity ?? "low"] : undefined}
                  />
                  <Field label="Time of occurrence" value={fmtDate(inc.occurredAt)} />
                  {inc.detectedLanguage && (
                    <Field label="Detected language" value={inc.detectedLanguage} />
                  )}
                </div>
              </Section>

              {inc.followUps.length > 0 && (
                <Section title="Follow-up Q&amp;A">
                  <div className="space-y-3">
                    {inc.followUps.map((fu, i) => (
                      <div key={fu.id} className="rounded-md border border-border p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {fu.field ?? "follow-up"}
                        </p>
                        <p className="text-sm font-medium">{fu.question}</p>
                        {fu.answer && (
                          <p className="mt-1 text-sm text-muted-foreground">{fu.answer}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {inc.transcripts.length > 0 && (
                <Section title="Transcripts">
                  <div className="space-y-2">
                    {inc.transcripts.map((t) => (
                      <div key={t.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {t.provider}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t.latencyMs ? `${t.latencyMs}ms` : ""}
                            {t.wordCount ? ` · ${t.wordCount} words` : ""}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Audit trail" icon={<Clock className="h-4 w-4" />}>
                <ol className="space-y-1.5 text-xs">
                  {inc.auditEvents.map((ev) => (
                    <li key={ev.id} className="flex gap-2">
                      <span className="font-mono text-muted-foreground">
                        {new Date(ev.createdAt).toLocaleTimeString()}
                      </span>
                      <span className="font-medium capitalize">{ev.action}</span>
                      {ev.detail && <span className="text-muted-foreground">— {ev.detail}</span>}
                    </li>
                  ))}
                </ol>
              </Section>

              <Separator />

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Supervisor review</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="reviewer">Reviewer name</Label>
                    <Input
                      id="reviewer"
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                      placeholder="e.g. Supervisor / Safety officer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Decision</Label>
                    <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as IncidentStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="review">Awaiting review</SelectItem>
                        <SelectItem value="submitted">Mark submitted</SelectItem>
                        <SelectItem value="escalated">Escalate</SelectItem>
                        <SelectItem value="resolved">Resolve</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Supervisor notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Corrective action, follow-up assigned, confirmation that equipment was inspected by a qualified person…"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This system never declares equipment safe on its own — confirm in
                  writing that a qualified person inspected it.
                </p>
              </div>
            </div>
          </ScrollArea>
        )}
        <SheetFooter className="border-t p-4 pr-6">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={exportReport} disabled={!inc}>
              <Download className="h-4 w-4" />
              Export (.md)
            </Button>
            <div className="flex gap-2">
              {nextStatus === "escalated" ? (
                <Button
                  variant="destructive"
                  onClick={() => reviewMut.mutate()}
                  disabled={reviewMut.isPending || !inc}
                >
                  {reviewMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4" />
                  )}
                  Confirm escalation
                </Button>
              ) : nextStatus === "resolved" ? (
                <Button
                  onClick={() => reviewMut.mutate()}
                  disabled={reviewMut.isPending || !inc}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {reviewMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Resolve report
                </Button>
              ) : (
                <Button
                  onClick={() => reviewMut.mutate()}
                  disabled={reviewMut.isPending || !inc}
                >
                  {reviewMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save review
                </Button>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={cn("space-y-0.5", full && "sm:col-span-2")}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

/** Editable transcript + "benchmark this report" action.
 *  The supervisor can correct the transcript into a verified reference, then
 *  run all three real STT providers on the report's persisted audio. */
function EditableTranscript({
  incidentId,
  text,
  hasAudio,
  onBenchmarked,
}: {
  incidentId: string;
  text: string;
  hasAudio: boolean;
  onBenchmarked: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(text);
  const [bench, setBench] = React.useState<BenchmarkResult[] | null>(null);
  const [aggregate, setAggregate] = React.useState<{
    avgWer: number | null;
    avgCer: number | null;
    avgCriticalTermRecall: number | null;
    avgLatencyMs: number | null;
  } | null>(null);

  React.useEffect(() => {
    setDraft(text);
  }, [text]);

  const saveMut = useMutation({
    mutationFn: async (value: string) => {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawTranscript: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
    },
    onSuccess: () => {
      setEditing(false);
      toast.success("Transcript verified", {
        description: "It is now the benchmark reference for this report.",
      });
      onBenchmarked();
    },
    onError: (e: Error) => toast.error("Could not save transcript", { description: e.message }),
  });

  const benchMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/incidents/${incidentId}/benchmark`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Benchmark failed");
      return data as {
        results: BenchmarkResult[];
        aggregateMetrics: typeof aggregate;
      };
    },
    onSuccess: (data) => {
      setBench(data.results);
      setAggregate(data.aggregateMetrics ?? null);
      onBenchmarked();
      const ok = data.results.filter((r) => r.success).length;
      toast.success("Benchmark complete", { description: `${ok}/${data.results.length} lanes ran` });
    },
    onError: (e: Error) => toast.error("Benchmark failed", { description: e.message }),
  });

  return (
    <div className="space-y-3">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="resize-y text-sm leading-relaxed"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMut.mutate(draft)}
              disabled={saveMut.isPending || draft.trim() === text.trim()}
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Save as verified reference
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
          {text}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            Edit transcript
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => benchMut.mutate()}
          disabled={benchMut.isPending || !hasAudio}
          className={cn(!hasAudio && "cursor-not-allowed opacity-50")}
          title={hasAudio ? "Run all three providers on this report's audio" : "No audio persisted for this report"}
        >
          {benchMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          Benchmark this report
        </Button>
      </div>

      {!hasAudio && (
        <p className="text-[11px] text-muted-foreground">
          No audio is persisted for this report (it was recorded before audio persistence shipped),
          so it can&apos;t be benchmarked. New reports can be benchmarked.
        </p>
      )}
      {hasAudio && !bench && (
        <p className="text-[11px] text-muted-foreground">
          Tip: edit &amp; save the transcript first to make it a verified reference, then run the
          benchmark for honest WER/CER metrics.
        </p>
      )}

      {bench && bench.length > 0 && (
        <BenchmarkResults results={bench} aggregate={aggregate} />
      )}
    </div>
  );
}

/** Compact per-report benchmark results table. */
function BenchmarkResults({
  results,
  aggregate,
}: {
  results: BenchmarkResult[];
  aggregate: {
    avgWer: number | null;
    avgCer: number | null;
    avgCriticalTermRecall: number | null;
    avgLatencyMs: number | null;
  } | null;
}) {
  const label: Record<string, string> = {
    sahara: "Sahara (Intron)",
    whisper: "Whisper",
    gemini: "Gemini",
    "zai-asr": "z-ai ASR",
  };
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Benchmark vs verified transcript</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3">Provider</th>
              <th className="py-1.5 pr-3 text-right">WER</th>
              <th className="py-1.5 pr-3 text-right">CER</th>
              <th className="py-1.5 pr-3 text-right">Recall</th>
              <th className="py-1.5 text-right">Latency</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.provider} className="border-b border-border/60">
                <td className="py-1.5 pr-3">
                  <span className="font-medium">{label[r.provider] ?? r.provider}</span>
                  {r.error && (
                    <span className="ml-1 text-xs text-destructive"> — {r.error}</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pct(r.wer)}</td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pct(r.cer)}</td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{pct(r.criticalTermRecall)}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{ms(r.latencyMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aggregate && (
        <p className="text-xs text-muted-foreground">
          Avg WER {pct(aggregate.avgWer)} · Avg CER {pct(aggregate.avgCer)} · Avg recall{" "}
          {pct(aggregate.avgCriticalTermRecall)} · Avg latency {ms(aggregate.avgLatencyMs)}
        </p>
      )}
    </div>
  );
}

function fmtDate(s?: string | null) {
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function timeAgo(s: string) {
  const then = new Date(s).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function buildExport(inc: Incident): string {
  const lines: string[] = [];
  lines.push(`# Incident Report — ${inc.referenceNo}`);
  lines.push("");
  lines.push(`**Status:** ${STATUS_LABELS[inc.status] ?? inc.status}`);
  lines.push(`**Severity:** ${inc.severity ? SEVERITY_LABELS[inc.severity] : "—"}`);
  lines.push(`**Urgent:** ${inc.isUrgent ? "YES" : "no"}`);
  if (inc.urgencyTags?.length) lines.push(`**Urgent tags:** ${inc.urgencyTags.join(", ")}`);
  lines.push(`**Reported:** ${new Date(inc.createdAt).toLocaleString()}`);
  if (inc.occurredAt) lines.push(`**Occurred:** ${fmtDate(inc.occurredAt)}`);
  if (inc.detectedLanguage) lines.push(`**Detected language:** ${inc.detectedLanguage}`);
  lines.push("");
  lines.push("## Transcript");
  lines.push(inc.rawTranscript || "_No transcript_");
  lines.push("");
  lines.push("## Structured report");
  lines.push(`- **Location:** ${inc.location ?? "—"}`);
  lines.push(`- **Equipment / asset:** ${inc.equipment ?? "—"}`);
  lines.push(`- **Hazard / incident:** ${inc.hazard ?? "—"}`);
  lines.push(`- **People affected:** ${inc.peopleAffected ?? "—"}`);
  lines.push(`- **Immediate action:** ${inc.immediateAction ?? "—"}`);
  lines.push(`- **Injury status:** ${inc.injuryStatus ? INJURY_LABELS[inc.injuryStatus] : "—"}`);
  lines.push("");
  if (inc.followUps.length) {
    lines.push("## Follow-up Q&A");
    for (const fu of inc.followUps) {
      lines.push(`**${fu.field ?? "follow-up"}:** ${fu.question}`);
      lines.push(`> ${fu.answer ?? "_unanswered_"}`);
      lines.push("");
    }
  }
  if (inc.supervisorNotes) {
    lines.push("## Supervisor notes");
    lines.push(inc.supervisorNotes);
    lines.push("");
  }
  lines.push("## Audit trail");
  for (const ev of inc.auditEvents) {
    lines.push(
      `- ${new Date(ev.createdAt).toLocaleString()} — **${ev.action}**${ev.detail ? ` — ${ev.detail}` : ""}`,
    );
  }
  return lines.join("\n");
}
