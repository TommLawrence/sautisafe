// Singleton wrapper around the z-ai-web-dev-sdk.
// MUST only be imported in server-side code (route handlers, server actions).
import ZAI from "z-ai-web-dev-sdk";

let _instance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

/** Get a shared ZAI SDK instance (created lazily). */
export async function getZai() {
  if (_instance) return _instance;
  _instance = await ZAI.create();
  return _instance;
}

/** Transcribe a base64 audio blob and return the text + timing. */
export async function transcribeAudio(
  base64Audio: string,
): Promise<{ text: string; latencyMs: number }> {
  const zai = await getZai();
  const start = Date.now();
  const res = await zai.audio.asr.create({ file_base64: base64Audio });
  const latencyMs = Date.now() - start;
  return { text: res.text ?? "", latencyMs };
}

export interface ChatOpts {
  system: string;
  user: string;
  temperature?: number;
  maxRetries?: number;
}

/** Run a single chat completion, with optional retries. */
export async function chat(opts: ChatOpts): Promise<string> {
  const zai = await getZai();
  let lastErr: unknown = null;
  const tries = Math.max(1, opts.maxRetries ?? 2);
  for (let i = 0; i < tries; i++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: opts.system },
          { role: "user", content: opts.user },
        ],
        thinking: { type: "disabled" },
        ...(opts.temperature !== undefined
          ? { temperature: opts.temperature }
          : {}),
      });
      const content = completion.choices?.[0]?.message?.content ?? "";
      if (content.trim()) return content;
      lastErr = new Error("Empty completion content");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("chat failed");
}

/** Ask the LLM for strict JSON. Strips code fences and parses robustly. */
export async function chatJson<T = unknown>(opts: ChatOpts): Promise<T> {
  const raw = await chat(opts);
  const cleaned = stripCodeFences(raw);
  // Find the first {...} or [...] block as a fallback.
  let candidate = cleaned.trim();
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
    const start = candidate.search(/[{[]/);
    if (start >= 0) candidate = candidate.slice(start);
  }
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end > 0) candidate = candidate.slice(0, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // last-resort: try to parse after removing trailing prose
    const m = candidate.match(/[{[][\s\S]*[}\]]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        /* fallthrough */
      }
    }
    throw new Error("LLM did not return valid JSON");
  }
}

export function stripCodeFences(s: string): string {
  return s
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}
