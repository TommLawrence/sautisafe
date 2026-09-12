"use client";
import * as React from "react";
import { Mic, Square, Upload, Trash2, Play, Pause, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  blobToWavBlob,
  estimateBlobDuration,
  formatBytes,
  formatDuration,
  pickRecorderMime,
} from "@/lib/audio-utils";

export interface CapturedAudio {
  wavBlob: Blob;
  playBlob: Blob;
  playUrl: string;
  durationSec: number;
  sizeBytes: number;
  fileName: string;
  mimeType: string;
}

interface Props {
  onCaptured: (audio: CapturedAudio) => void;
  onClear: () => void;
  captured?: CapturedAudio | null;
  disabled?: boolean;
}

type Phase = "idle" | "recording" | "recorded";

export function AudioRecorder({ onCaptured, onClear, captured, disabled }: Props) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [level, setLevel] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    return () => cleanup();
  }, []);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = handleStop;
      rec.start(200);

      // level meter
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 2.4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setPhase("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return MAX_RECORDING_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setError(
        "Could not access the microphone. Check browser permissions, or upload an audio file instead.",
      );
      console.error(e);
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop();
    } catch {
      /* noop */
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function handleStop() {
    setProcessing(true);
    try {
      const raw = new Blob(chunksRef.current, {
        type: recorderRef.current?.mimeType || "audio/webm",
      });
      const wav = await blobToWavBlob(raw);
      const duration = await estimateBlobDuration(wav);
      const url = URL.createObjectURL(raw);
      onCaptured({
        wavBlob: wav,
        playBlob: raw,
        playUrl: url,
        durationSec: duration || elapsed,
        sizeBytes: wav.size,
        fileName: `recording-${Date.now()}.wav`,
        mimeType: "audio/wav",
      });
      setPhase("recorded");
    } catch (e) {
      console.error(e);
      setError("Failed to process the recording. Try again or upload a file.");
      setPhase("idle");
    } finally {
      setProcessing(false);
      cleanup();
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setProcessing(true);
    try {
      if (file.size > MAX_AUDIO_BYTES) {
        setError(`Audio file is too large (max ${formatBytes(MAX_AUDIO_BYTES)}).`);
        return;
      }
      // If it's already a WAV, use as-is; otherwise transcode to WAV for the ASR.
      let wav: Blob;
      let playBlob: Blob = file;
      if (file.type.includes("wav") || file.name.toLowerCase().endsWith(".wav")) {
        wav = file;
      } else {
        wav = await blobToWavBlob(file);
      }
      const duration = await estimateBlobDuration(wav);
      const url = URL.createObjectURL(playBlob);
      onCaptured({
        wavBlob: wav,
        playBlob,
        playUrl: url,
        durationSec: duration,
        sizeBytes: wav.size,
        fileName: file.name,
        mimeType: wav.type || "audio/wav",
      });
      setPhase("recorded");
    } catch (e) {
      console.error(e);
      setError("Could not read that audio file. Try WAV, MP3, M4A, or OGG.");
    } finally {
      setProcessing(false);
    }
  }

  function clearAll() {
    if (captured) URL.revokeObjectURL(captured.playUrl);
    setPhase("idle");
    setElapsed(0);
    setLevel(0);
    setError(null);
    onClear();
  }

  function togglePlay() {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }

  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase !== "recorded" && (
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
            if (f) handleFile(f);
          }}
          className={cn(
            "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {/* Record button */}
          <button
            type="button"
            onClick={phase === "idle" ? startRecording : stopRecording}
            disabled={processing}
            aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
            className={cn(
              "relative flex h-24 w-24 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
              phase === "recording"
                ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30"
                : "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:brightness-110",
            )}
          >
            {phase === "recording" ? (
              <span className="absolute inset-0 animate-rec-pulse rounded-full bg-destructive/40" />
            ) : null}
            {phase === "recording" ? (
              <Square className="h-8 w-8" fill="currentColor" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </button>

          <div className="space-y-1">
            <p className="text-sm font-medium">
              {phase === "recording"
                ? "Recording… tap the square to stop"
                : "Tap the microphone to record"}
            </p>
            <p className="text-xs text-muted-foreground">
              Speak naturally — mix English with Luganda, Swahili, or your local language.
            </p>
          </div>

          {phase === "recording" && (
            <div className="flex w-full max-w-xs items-center gap-3">
              <span className="font-mono text-lg tabular-nums text-destructive">
                {formatDuration(elapsed)}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-destructive"
                  style={{ width: `${(elapsed / MAX_RECORDING_SECONDS) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(remaining)} left
              </span>
            </div>
          )}

          {/* level meter */}
          {phase === "recording" && (
            <div className="flex h-8 items-end gap-1" aria-hidden>
              {Array.from({ length: 18 }).map((_, i) => {
                const active = level * 18 > i;
                return (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 rounded-full transition-all",
                      active ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                    style={{ height: `${8 + (i / 18) * 24}px` }}
                  />
                );
              })}
            </div>
          )}

          {phase === "idle" && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px w-8 bg-border" /> or <span className="h-px w-8 bg-border" />
            </div>
          )}

          {phase === "idle" && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" />
              Upload audio file
              <input
                type="file"
                accept={ACCEPTED_AUDIO_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {processing && (
            <p className="text-xs text-muted-foreground">Processing audio…</p>
          )}
        </div>
      )}

      {phase === "recorded" && captured && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={togglePlay}
                className="h-10 w-10 rounded-full"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              <div>
                <p className="text-sm font-medium">{captured.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(captured.durationSec)} · {formatBytes(captured.sizeBytes)} · WAV
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
              Discard
            </Button>
          </div>
          <audio
            ref={audioElRef}
            src={captured.playUrl}
            onEnded={() => setIsPlaying(false)}
            className="mt-3 w-full"
            controls
          />
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Max recording {formatDuration(MAX_RECORDING_SECONDS)} · Max file size{" "}
        {formatBytes(MAX_AUDIO_BYTES)} · Audio is kept linked to the report for verification.
      </p>
    </div>
  );
}
