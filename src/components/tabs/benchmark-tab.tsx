"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  useAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Gauge,
  Loader2,
  Upload,
  Play,
  FlaskConical,
  History,
  CheckCircle2,
  AlertTriangle,
  FileAudio,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { ACCEPTED_AUDIO_TYPES, MAX_AUDIO_BYTES, formatBytes, mimeTypeForAudioFile } from "@/lib/audio-utils";
import { pct, ms } from "@/lib/metrics";
import type { BenchmarkResult } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { convexApi } from "@/lib/convex-api";
import {
  adaptBenchmarkResult,
  adaptBenchmarkRun,
  aggregateBenchmarkResults,
  uploadAudio,
} from "@/lib/convex-data";

const PROVIDER_COLORS: Record<string, string> = {
  sahara: "oklch(0.55 0.1 178)",
  "zai-asr": "oklch(0.6 0.09 178)",
  whisper: "oklch(0.75 0.15 70)",
  gemini: "oklch(0.6 0.2 25)",
};

const PROVIDER_LABEL: Record<string, string> = {
  sahara: "Sahara (Intron Voice)",
  "zai-asr": "z-ai ASR (fallback)",
  whisper: "Whisper",
  gemini: "Gemini",
};

const JUDGE_REVIEW_CUTOFF = new Date("2026-09-17T00:00:00+03:00").getTime();

export function BenchmarkTab() {
  const [audioFile, setAudioFile] = React.useState<File | null>(null);
  const [reference, setReference] = React.useState("");
  const [language, setLanguage] = React.useState<string>("lg");
  const [dragOver, setDragOver] = React.useState(false);
  const runBenchmark = useAction(convexApi.actions.transcribe.runBenchmark);
  const generateUploadUrl = useConvexMutation(convexApi.audio.generateUploadUrl);
  const saveAudio = useConvexMutation(convexApi.audio.saveAudio);
  const saveBenchmarkRun = useConvexMutation(convexApi.benchmark.saveBenchmarkRun);
  const existingRuns = useConvexQuery(convexApi.benchmark.listBenchmarkRuns, {}) as
    | Record<string, any>[]
    | undefined;

  const runMut = useMutation({
    mutationFn: async () => {
      if (!audioFile || !reference.trim())
        throw new Error("Add an audio file and a reference transcript");
      const audioStorageId = await uploadAudio(
        audioFile,
        audioFile.name || "benchmark.wav",
        mimeTypeForAudioFile(audioFile),
        audioFile.size,
        { generateUploadUrl, saveAudio },
      );
      const rawResults = (await runBenchmark({
        audioStorageId,
        referenceTranscript: reference.trim(),
        providers: ["sahara", "whisper", "gemini"],
        language,
      })) as Record<string, any>[];
      const results = rawResults.map(adaptBenchmarkResult);
      const aggregateMetrics = aggregateBenchmarkResults(results);
      const referenceNo = `SSA-${new Date().getFullYear()}-${String((existingRuns?.length ?? 0) + 1).padStart(4, "0")}`;
      const runId = (await saveBenchmarkRun({
        referenceNo,
        audioFileName: audioFile.name,
        referenceTranscript: reference.trim(),
        resultsJson: JSON.stringify(rawResults),
        aggregateMetrics: JSON.stringify(aggregateMetrics),
      })) as string;
      return { runId, referenceNo, results };
    },
    onSuccess: (data) => {
      toast.success("Benchmark complete", {
        description: `${data.results.length} lanes evaluated`,
      });
    },
    onError: (e: Error) => toast.error("Benchmark failed", { description: e.message }),
  });

  const results = runMut.data?.results ?? [];
  const chartData = results.map((r) => ({
    name: PROVIDER_LABEL[r.provider] ?? r.provider,
    WER: r.wer == null ? null : +(r.wer * 100).toFixed(1),
    CER: r.cer == null ? null : +(r.cer * 100).toFixed(1),
    Recall: r.criticalTermRecall == null ? null : +(r.criticalTermRecall * 100).toFixed(1),
    simulated: r.simulated,
  }));

  return (
    <div className="space-y-6">
      {/* Runner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Benchmark runner
          </CardTitle>
          <CardDescription>
            Compare speech models on the same audio against a verified reference
            transcript using Sahara, Whisper, and Gemini. Each lane calls its real
            provider and reports failures honestly - never silently substituting another model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <Label>Audio sample</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleAudioFile(f, setAudioFile);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
                )}
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Drop an audio file here, or
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  <FileAudio className="h-3.5 w-3.5" />
                  Choose file
                  <input
                    type="file"
                    accept={ACCEPTED_AUDIO_TYPES.join(",")}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAudioFile(f, setAudioFile);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {audioFile && (
                  <p className="mt-1 text-xs text-foreground">
                    {audioFile.name} · {formatBytes(audioFile.size)}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Max {formatBytes(MAX_AUDIO_BYTES)}. WAV/MP3/M4A/OGG.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bench-language">Sahara language</Label>
                <NativeSelect
                  id="bench-language"
                  aria-label="Sahara language"
                  value={language}
                  onValueChange={setLanguage}
                  options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  The language the Sahara (Intron) model transcribes in.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ref">Reference transcript (verified)</Label>
              <Textarea
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                rows={8}
                placeholder="Paste the verified reference transcript here…"
                className="resize-none font-mono text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Benchmark mode never silently falls back between models. If a provider key
                is missing, that lane reports a clear error instead of substituting another model.
              </p>
            </div>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending} className="shrink-0 sm:w-auto w-full">
              {runMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run benchmark
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Results
              {runMut.data && (
                <Badge variant="secondary" className="font-mono text-xs">
                  {runMut.data.referenceNo}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Lower WER/CER is better. Higher critical-term recall is better.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3 text-right">WER (norm)</th>
                    <th className="py-2 pr-3 text-right">WER (raw)</th>
                    <th className="py-2 pr-3 text-right">CER (norm)</th>
                    <th className="py-2 pr-3 text-right">CER (raw)</th>
                    <th className="py-2 pr-3 text-right">Recall</th>
                    <th className="py-2 pr-3 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.provider} className="border-b border-border/60">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: PROVIDER_COLORS[r.provider] }}
                          />
                          <span className="font-medium">
                            {PROVIDER_LABEL[r.provider] ?? r.provider}
                          </span>
                          {r.simulated && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              simulated
                            </Badge>
                          )}
                          {r.error && (
                            <span className="text-xs text-destructive">{r.error}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{pct(r.wer)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">{pct(r.werUnnorm)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{pct(r.cer)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">{pct(r.cerUnnorm)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{pct(r.criticalTermRecall)}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{ms(r.latencyMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" unit="%" />
                  <RTooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v: number) => `${v}%`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="WER" fill="oklch(0.6 0.2 25)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="CER" fill="oklch(0.75 0.15 70)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Recall" fill="oklch(0.6 0.13 145)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transcripts
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                {results.map((r) => (
                  <div key={r.provider} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        {PROVIDER_LABEL[r.provider] ?? r.provider}
                      </span>
                      {r.simulated && (
                        <Badge variant="outline" className="text-[10px]">simulated</Badge>
                      )}
                    </div>
                    <p className="max-h-40 overflow-y-auto scroll-thin whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {r.text || <span className="italic">no output</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <BenchmarkHistory />
    </div>
  );
}

function BenchmarkHistory() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const deleteBenchmarkRun = useConvexMutation(convexApi.benchmark.deleteBenchmarkRun);
  const data = useConvexQuery(convexApi.benchmark.listBenchmarkRuns, {}) as
    | Record<string, any>[]
    | undefined;
  const runs = (data ?? []).map(adaptBenchmarkRun);
  const isLoading = data === undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Benchmark history
        </CardTitle>
        <CardDescription>
          Aggregate accuracy across runs. Lower WER/CER is better.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-6 w-6" />
            <p className="text-sm">No benchmark runs yet.</p>
          </div>
        ) : (
          <div className="scroll-thin max-h-80 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {runs.map((run) => {
                const isJudgeLocked = new Date(run.createdAt).getTime() < JUDGE_REVIEW_CUTOFF;
                const real = run.results.filter((r) => !r.simulated);
                const avgWer =
                  real.length > 0
                    ? real.reduce((s, r) => s + (r.wer ?? 0), 0) / real.length
                    : null;
                return (
                  <li
                    key={run.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold">{run.referenceNo}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {run.scenario && (
                      <p className="mt-1 text-xs text-muted-foreground">{run.scenario}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <span>
                        Lanes: <span className="font-mono">{run.results.length}</span>
                      </span>
                      {avgWer != null && (
                        <span>
                          Avg WER (real):{" "}
                          <span className="font-mono">{pct(avgWer)}</span>
                        </span>
                      )}
                    </div>
                    {openId === run.id && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {run.results.map((result) => (
                          <div key={result.provider} className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium">{PROVIDER_LABEL[result.provider] ?? result.provider}</span>
                            <span className={result.success ? "text-muted-foreground" : "text-destructive"}>
                              {result.success ? `WER ${pct(result.wer)}` : "Failed"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive disabled:text-muted-foreground"
                        disabled={isJudgeLocked || deletingId === run.id}
                        title={isJudgeLocked ? "Locked while awaiting judge review" : "Delete benchmark"}
                        aria-label={isJudgeLocked ? "Benchmark locked while awaiting judge review" : "Delete benchmark"}
                        onClick={async () => {
                          setDeletingId(run.id);
                          try {
                            await deleteBenchmarkRun({ id: run.id as any });
                            if (openId === run.id) setOpenId(null);
                            toast.success("Benchmark deleted");
                          } catch (error) {
                            toast.error("Could not delete benchmark", {
                              description: error instanceof Error ? error.message : "Please try again",
                            });
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                      >
                        {deletingId === run.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={openId === run.id ? "Collapse benchmark details" : "Show benchmark details"}
                        onClick={() => setOpenId(openId === run.id ? null : run.id)}
                      >
                        <ChevronRight className={`h-4 w-4 transition-transform ${openId === run.id ? "rotate-90" : ""}`} />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function handleAudioFile(file: File, setAudioFile: (f: File) => void) {
  if (file.size > MAX_AUDIO_BYTES) {
    toast.error(`Audio file is too large (max ${formatBytes(MAX_AUDIO_BYTES)})`);
    return;
  }
  setAudioFile(file);
}
