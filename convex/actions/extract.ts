// SautiSafe — LLM-based safety-field extraction (production Convex backend).
//
// Mirrors the live Next.js `/api/extract` route 1:1.
//
// Given a transcript (possibly code-switched English/Luganda/Swahili), this
// action asks an LLM to extract a structured safety report: location,
// equipment, hazard, people affected, immediate action taken, injury status,
// severity, when it happened, detected language, the list of fields the LLM
// could not confidently fill (so we can ask follow-ups), at most 2 follow-up
// questions, and a list of urgent risk tags (so the UI can flag incidents
// for supervisor escalation).
//
// The LLM call goes to an OpenAI-compatible chat-completions endpoint
// configured by `LLM_API_BASE` and `LLM_API_KEY`. In production this can be
// any OpenAI-API-compatible gateway (OpenAI itself, Azure OpenAI, Together,
// Anyscale, a self-hosted vLLM, etc.). If those env vars are not set, the
// action throws a clear error so the UI can show "extraction unavailable"
// instead of silently returning empty fields.

import { action } from "../_generated/server";
import { v } from "convex/values";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/** One follow-up question the LLM suggests, tagged with the field it targets. */
export interface SuggestedFollowUp {
  field: string;
  question: string;
}

/** Structured extraction result. Mirrors the live `/api/extract` response. */
export interface ExtractedFields {
  location: string | null;
  equipment: string | null;
  hazard: string | null;
  peopleAffected: string | null;
  immediateAction: string | null;
  injuryStatus: string | null; // none | minor | serious | unknown
  severity: string | null; // low | medium | high | critical
  occurredAt: string | null; // ISO date or natural-language; parsed by client
  detectedLanguage: string | null; // e.g. "eng+lug"
  missingFields: string[];
  followUpQuestions: SuggestedFollowUp[]; // at most 2
  urgentTags: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// extractSafetyFields
// ──────────────────────────────────────────────────────────────────────────

/**
 * Extract structured safety fields from a transcript.
 *
 * Mirrors: live Next.js `POST /api/extract`.
 *
 * The transcript may be code-switched English / Luganda / Swahili (workers
 * switch languages mid-sentence; SautiSafe is designed for that). The LLM
 * system prompt is tuned for industrial-safety context: it understands plant
 * equipment vocabulary, knows the difference between "near-miss" and
 * "incident", and is told to NEVER declare equipment "safe" without an
 * explicit supervisor sign-off (the live UI surfaces this safeguard too).
 *
 * The response is a JSON object — the LLM is instructed to return ONLY JSON.
 * We strip markdown code fences defensively, then `JSON.parse` the result.
 *
 * Throws a clear error if `LLM_API_BASE` or `LLM_API_KEY` is missing so the
 * UI shows "extraction unavailable" rather than silently failing.
 */
export const extractSafetyFields = action({
  args: {
    transcript: v.string(),
  },
  handler: async (ctx, { transcript }): Promise<ExtractedFields> => {
    const base = process.env.LLM_API_BASE;
    const key = process.env.LLM_API_KEY;
    if (!base || !key) {
      throw new Error(
        "LLM extraction provider not configured: set LLM_API_BASE and LLM_API_KEY.",
      );
    }

    const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
    const endpoint = `${base.replace(/\/+$/, "")}/chat/completions`;

    // Compose the chat-completions request with a strong system prompt.
    const body = {
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Extract the safety fields from this incident transcript.\n\n` +
            `Transcript (may be code-switched English/Luganda/Swahili):\n"""\n${transcript}\n"""\n\n` +
            `Return ONLY a JSON object matching the schema. Do not include prose or markdown.`,
        },
      ],
    };

    let data: Record<string, unknown>;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`LLM API error HTTP ${res.status}: ${truncate(t)}`);
      }

      data = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`LLM extraction request failed: ${safeErrorMessage(err)}`);
    }

    // Pull the assistant message text out of the chat-completions response.
    const content = extractAssistantContent(data);
    if (!content) {
      throw new Error("LLM response missing assistant content.");
    }

    // Robustly parse the JSON content — strip code fences if present.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stripCodeFences(content));
    } catch (err) {
      throw new Error(
        `LLM response was not valid JSON: ${safeErrorMessage(err)}. Raw: ${truncate(content)}`,
      );
    }

    return coerceExtractedFields(parsed);
  },
});

// ──────────────────────────────────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────────────────────────────────

/**
 * The system prompt for the extraction LLM. Strong, industrial-safety tuned,
 * with explicit safeguards:
 *   * Output only JSON, no prose, no markdown.
 *   * Code-switched tokens are preserved verbatim (the worker said "boiler"
 *     and "keboila" interchangeably; both are valid).
 *   * Never declare equipment "safe" or an incident "resolved" — that is
 *     a supervisor-only decision. Missing information goes in missingFields.
 *   * Severity and injuryStatus follow fixed vocabularies.
 *   * urgentTags is the list of risk tags that should escalate (fire,
 *     chemical, electrocution, fall, crush, etc.).
 *   * At most 2 follow-up questions, each tied to a specific missing field.
 */
const SYSTEM_PROMPT = `You are SautiSafe's safety-incident extraction assistant.

You read a voice transcript from a worker reporting a safety incident or near-miss in an industrial facility. The transcript may be code-switched between English, Luganda, and Swahili — workers switch languages mid-sentence; treat all three as first-class. Preserve code-switched tokens (e.g. "boiler", "keboila", "ppp", "omuliro") verbatim.

Extract the following fields. If a field cannot be confidently inferred from the transcript, return null for it AND list its key in missingFields.

Fields:
  - location: where it happened (e.g. "Boiler House, west wing")
  - equipment: equipment / asset involved (e.g. "Reactor R-7 pressure valve")
  - hazard: what the hazard or incident was (e.g. "steam leak near burner")
  - peopleAffected: who was affected or at risk (e.g. "two operators on shift")
  - immediateAction: what was done immediately (e.g. "isolated feed, called supervisor")
  - injuryStatus: one of "none" | "minor" | "serious" | "unknown"
  - severity: one of "low" | "medium" | "high" | "critical"
  - occurredAt: when it happened — ISO 8601 if you can parse it, otherwise a short natural-language string the client can re-parse (e.g. "yesterday around 14:00")
  - detectedLanguage: detected language mix, e.g. "eng", "lug", "swa", "eng+lug", "eng+lug+swa"

  - missingFields: array of field keys above that you could NOT confidently fill (e.g. ["peopleAffected", "occurredAt"])
  - followUpQuestions: AT MOST 2 objects {field, question} — each "field" must be one of the missing fields; each "question" is a single short, plain-language question the worker can answer in one sentence. Never ask more than 2.
  - urgentTags: array of urgent risk tags present in the transcript, drawn from this vocabulary when applicable: ["fire","chemical","electrocution","fall","crush","explosion","gas-leak","pressure","entanglement","confined-space","slip","burn","asphyxiation"]. Use an empty array if none apply.

CRITICAL SAFEGUARDS (competition requirements — violating any of these is a critical bug):
  1. Never declare equipment "safe", an incident "resolved", or severity "low" without explicit evidence in the transcript. When in doubt, leave the field null and add it to missingFields.
  2. Never invent follow-up questions beyond the 2-item cap.
  3. Never hallucinate hazards not supported by the transcript. If the worker did not mention a hazard, hazard = null and add "hazard" to missingFields.
  4. urgentTags must reflect what the worker actually reported — do not pad.
  5. Output ONLY a JSON object, no prose, no markdown fences, no leading or trailing text.

Return JSON shaped like:
{
  "location": string | null,
  "equipment": string | null,
  "hazard": string | null,
  "peopleAffected": string | null,
  "immediateAction": string | null,
  "injuryStatus": "none" | "minor" | "serious" | "unknown" | null,
  "severity": "low" | "medium" | "high" | "critical" | null,
  "occurredAt": string | null,
  "detectedLanguage": string | null,
  "missingFields": string[],
  "followUpQuestions": [{ "field": string, "question": string }],
  "urgentTags": string[]
}`;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Extract the assistant message content from an OpenAI-style response. */
function extractAssistantContent(data: Record<string, unknown>): string | null {
  const choices = data["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  const message = first["message"] as Record<string, unknown> | undefined;
  if (!message) return null;
  const content = message["content"];
  if (typeof content === "string") return content;
  // Some gateways return content as an array of parts.
  if (Array.isArray(content)) {
    return content
      .map((p) => (p as Record<string, unknown>)?.text)
      .filter((t): t is string => typeof t === "string")
      .join("\n");
  }
  return null;
}

/**
 * Strip ```json ... ``` code fences if the LLM added them despite the prompt.
 * Tolerates leading/trailing whitespace and missing closing fences.
 */
function stripCodeFences(s: string): string {
  let t = s.trim();
  // Opening fence: ``` or ```json
  const openMatch = t.match(/^```(?:json)?\s*\n?/i);
  if (openMatch) {
    t = t.slice(openMatch[0].length);
  }
  // Closing fence
  if (t.endsWith("```")) {
    t = t.slice(0, -3);
  }
  return t.trim();
}

/**
 * Coerce a parsed JSON object into the strict ExtractedFields shape, applying
 * defaults and trimming. Always returns arrays (never undefined).
 */
function coerceExtractedFields(o: Record<string, unknown>): ExtractedFields {
  return {
    location: asNullableString(o["location"]),
    equipment: asNullableString(o["equipment"]),
    hazard: asNullableString(o["hazard"]),
    peopleAffected: asNullableString(o["peopleAffected"]),
    immediateAction: asNullableString(o["immediateAction"]),
    injuryStatus: asNullableString(o["injuryStatus"]),
    severity: asNullableString(o["severity"]),
    occurredAt: asNullableString(o["occurredAt"]),
    detectedLanguage: asNullableString(o["detectedLanguage"]),
    missingFields: asStringArray(o["missingFields"]),
    followUpQuestions: asFollowUps(o["followUpQuestions"]).slice(0, 2),
    urgentTags: asStringArray(o["urgentTags"]),
  };
}

/** Accept string | null | undefined; return string | null (trimmed). */
function asNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Accept array-ish; return string[] (always defined, trimmed). */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : String(x)))
    .filter((x) => x.length > 0);
}

/** Accept array-ish of {field, question}; return at most N valid items. */
function asFollowUps(v: unknown): SuggestedFollowUp[] {
  if (!Array.isArray(v)) return [];
  const out: SuggestedFollowUp[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const field = typeof obj["field"] === "string" ? (obj["field"] as string).trim() : "";
    const question =
      typeof obj["question"] === "string" ? (obj["question"] as string).trim() : "";
    if (field && question) {
      out.push({ field, question });
    }
  }
  return out;
}

/** Truncate a response body so error messages stay readable. */
function truncate(s: string): string {
  const MAX = 300;
  return s.length > MAX ? `${s.slice(0, MAX)}… (${s.length} bytes)` : s;
}

/** Extract a leak-free message from an Error or thrown value. */
function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1***")
    .replace(/(sk-[A-Za-z0-9]{10,})/g, "sk-***")
    .slice(0, 500);
}
