"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SAMPLE_SCENARIOS } from "@/lib/safety";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { ACCEPTED_AUDIO_TYPES, MAX_AUDIO_BYTES, formatBytes } from "@/lib/audio-utils";
import { pct, ms } from "@/lib/metrics";
import type { BenchmarkResult } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export function BenchmarkTab() {
  const qc = useQueryClient();
  const [audioFile, setAudioFile] = React.useState<File | null>(null);
  const [reference, setReference] = React.useState("");
  const [scenarioId, setScenarioId] = React.useState<string>("");
  const [language, setLanguage] = React.useState<string>("lg");
  const [dragOver, setDragOver] = React.useState(false);

  const runMut = useMutation({
    mutationFn: async () => {
      if (!audioFile && !reference)
        throw new Error("Add an audio file and a reference transcript");
      const fd = new FormData();
      if (audioFile) fd.append("audio", audioFile);
      fd.append("referenceTranscript", reference);
      if (scenarioId) fd.append("scenario", scenarioId);
      fd.append("language", language);
      const res = await fetch("/api/benchmark", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Benchmark failed");
      return (await res.json()) as {
        runId: string;
        referenceNo: string;
        results: BenchmarkResult[];
      };
    },
    onSuccess: (data) => {
      toast.success("Benchmark complete", {
        description: `${data.results.length} lanes evaluated`,
      });
      qc.invalidateQueries({ queryKey: ["benchmarkRuns"] });
    },
    onError: (e: Error) => toast.error("Benchmark failed", { description: e.message }),
  });

  function applyScenario(id: string) {
    setScenarioId(id);
    const s = SAMPLE_SCENARIOS.find((x) => x.id === id);
    if (s) {
      setReference(s.referenceText);
      // match the Sahara lane language to the scenario's code-switch profile
      const langFor: Record<string, string> = { s1: "lg", s2: "en", s3: "sw", s4: "en" };
      if (langFor[id]) setLanguage(langFor[id]);
    }
  }

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
            transcript. The Sahara lane calls the real Intron Voice API (set
            <code className="mx-1 rounded bg-muted px-1 font-mono text-[11px]">INTRON_API_KEY</code>
            in <code className="rounded bg-muted px-1 font-mono text-[11px]">.env</code>
            to enable it); without a key it reports an honest “not configured”
            error and is never silently substituted. Whisper &amp; Gemini lanes are
            clearly-labelled simulations in this test env — the Convex migration
            wires them to the real providers.
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
                <Label>Quick scenario</Label>
                <Select value={scenarioId} onValueChange={applyScenario}>
                  <SelectTrigger>
                    <SelectValue placeholder="Load a sample reference transcript" />
                  </SelectTrigger>
                  <SelectContent>
                    {SAMPLE_SCENARIOS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Reference transcripts must be manually verified.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Sahara language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                Benchmark mode never silently falls back between models. If a provider key
                is missing, that lane reports a clear error instead of substituting another model.
              </p>
            </div>
            <Button onClick={() => runMut.mutate()} disabled={runMut.isPending}>
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
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4 text-right">WER</th>
                    <th className="py-2 pr-4 text-right">CER</th>
                    <th className="py-2 pr-4 text-right">Critical-term recall</th>
                    <th className="py-2 pr-4 text-right">Latency</th>
                    <th className="py-2 pr-4 text-right">Words</th>
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
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{pct(r.wer)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{pct(r.cer)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">
                        {pct(r.criticalTermRecall)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{ms(r.latencyMs)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">{r.wordCount ?? "—"}</td>
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
  const { data, isLoading } = useQuery({
    queryKey: ["benchmarkRuns"],
    queryFn: async () => {
      const res = await fetch("/api/benchmark");
      if (!res.ok) throw new Error("Failed to load runs");
      return (await res.json()) as { runs: Array<{ id: string; referenceNo: string; scenario?: string | null; createdAt: string; results: BenchmarkResult[] }> };
    },
  });
  const runs = data?.runs ?? [];

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
          <ScrollArea className="scroll-thin max-h-72">
            <ul className="space-y-2 pr-2">
              {runs.map((run) => {
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
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
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
