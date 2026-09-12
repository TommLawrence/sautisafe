// Client-side audio helpers: recording, WAV encoding, formatting.

/** Format seconds as mm:ss. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Pick the best supported MediaRecorder mimeType. */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** Convert a recorded audio Blob into a 16-bit PCM mono WAV Blob at 16kHz,
 *  which is the format most reliably accepted by speech-to-text APIs. */
export async function blobToWavBlob(input: Blob): Promise<Blob> {
  const arrayBuf = await input.arrayBuffer();
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    const wavBuffer = encodeWav(audioBuffer, 16000);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    ctx.close();
  }
}

/** Encode an AudioBuffer to a 16-bit PCM WAV ArrayBuffer at the target rate. */
function encodeWav(audioBuffer: AudioBuffer, targetRate: number): ArrayBuffer {
  const numChannels = 1; // force mono
  const srcRate = audioBuffer.sampleRate;
  const srcLen = audioBuffer.length;
  const ratio = targetRate / srcRate;
  const outLen = Math.max(1, Math.round(srcLen * ratio));
  // downsample to mono + target rate
  const channel = audioBuffer.getChannelData(0);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const a = channel[i0] ?? 0;
    const b = channel[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = targetRate * blockAlign;
  const dataSize = outLen * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  const writeU32 = (v: number) => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const writeU16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  writeStr("RIFF");
  writeU32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  writeU32(16);
  writeU16(1); // PCM
  writeU16(numChannels);
  writeU32(targetRate);
  writeU32(byteRate);
  writeU16(blockAlign);
  writeU16(16); // bits per sample
  writeStr("data");
  writeU32(dataSize);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, out[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    p += 2;
  }
  return buffer;
}

/** Estimate duration (seconds) of a WAV/ogg/webm blob via an <audio> element. */
export function estimateBlobDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? d : 0);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}

export const MAX_RECORDING_SECONDS = 180; // 3-minute cap
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
export const ACCEPTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/m4a",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/x-m4a",
];
