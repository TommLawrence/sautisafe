import { NextResponse } from "next/server";
import { chatJson } from "@/lib/zai";
import { applyInjuryNegation, detectUrgentTags, URGENCY_VOCABULARY } from "@/lib/safety";
import type { ExtractedFields, InjuryStatus, Severity } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are SautiSafe, a safety-incident field extraction assistant used in African industrial workplaces (factories, construction, warehouses, transport, mining, utilities).

The worker's transcript may be code-switched: it mixes English with Luganda, Swahili, or another local language. Technical terms (pressure, valve, reactor, hydraulic, isolator, emergency stop) usually stay in English. Preserve those technical terms EXACTLY as spoken - do not "correct" or translate them.

Your job: extract a structured safety report from the transcript. You are a documentation and routing aid only.

SAFEGUARDS (non-negotiable):
- NEVER declare equipment "safe" or "all clear". You may only record that an action was taken.
- NEVER diagnose a technical fault or recommend a repair.
- NEVER replace or trigger an emergency procedure.
- If a field genuinely cannot be inferred from the transcript, leave it null and add the field name to missingFields.
- Ask at MOST 2 focused follow-up questions, only for missing high-priority fields.
- Respect negation: "no one was injured", "no fire", "nobody hurt", "no injuries reported" must NOT add the corresponding urgentTag. Only flag a tag when the hazard is actually present or occurred. EXAMPLE: in "There was a chemical spill but no one was injured", add "chemical" but NOT "injury".
- occurredAt: only set it when a specific date or day is mentioned. If only a time of day is mentioned (e.g. "around 9am") with no date, leave occurredAt null - never fabricate a date.
- urgentTags must be drawn ONLY from this vocabulary: ${Object.keys(URGENCY_VOCABULARY).join(", ")}.

Return STRICT JSON only (no prose, no code fences) with exactly these keys:
{
  "location": string | null,
  "equipment": string | null,
  "hazard": string | null,
  "peopleAffected": string | null,
  "immediateAction": string | null,
  "injuryStatus": "none" | "minor" | "serious" | "unknown" | null,
  "severity": "low" | "medium" | "high" | "critical" | null,
  "occurredAt": string | null,  // ISO 8601 if a time is mentioned, else null
  "detectedLanguage": string | null,  // e.g. "eng+lug", "swa+eng", "eng"
  "urgentTags": string[],  // only from the allowed vocabulary
  "missingFields": string[],  // field names that need follow-up
  "followUpQuestions": { "field": string, "question": string }[]
}

Severity guidance: "critical" = active danger to life/limb or uncontrolled release; "high" = serious near-miss or injury; "medium" = controlled but notable; "low" = minor housekeeping. If unsure, use "medium" rather than guessing "low".`;

/** POST /api/extract
 *  Body: { transcript: string }
 *  Returns ExtractedFields. Mirrors convex/actions/extract.ts → extractSafetyFields. */
export async function POST(req: Request) {
  try {
    const { transcript } = (await req.json()) as { transcript?: string };
    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
    }
    let parsed: Partial<ExtractedFields>;
    try {
      parsed = await chatJson<Partial<ExtractedFields>>({
        system: SYSTEM_PROMPT,
        user: `Extract the structured safety report from this transcript:\n\n"""${transcript}"""`,
      });
    } catch (e) {
      console.error("[/api/extract] LLM/JSON error", e);
      return NextResponse.json(
        { error: "Could not extract structured fields", detail: safeErr(e) },
        { status: 502 },
      );
    }

    // Conservative additive backstop: union the LLM's tags with a keyword scan.
    // The scan only ever CATCHES urgency the LLM missed - it never removes a
    // flag (a false alarm is safer than a missed urgent risk for a safety tool).
    // Negation handling (e.g. "no one was injured") is the LLM's responsibility,
    // enforced by the prompt's explicit example.
    const scanned = detectUrgentTags(transcript);
    const urgentTags = applyInjuryNegation(
      Array.from(new Set([...(parsed.urgentTags ?? []), ...scanned])),
      transcript,
    );

    const result: ExtractedFields = {
      location: parsed.location ?? null,
      equipment: parsed.equipment ?? null,
      hazard: parsed.hazard ?? null,
      peopleAffected: parsed.peopleAffected ?? null,
      immediateAction: parsed.immediateAction ?? null,
      injuryStatus: (parsed.injuryStatus as InjuryStatus | null) ?? null,
      severity: (parsed.severity as Severity | null) ?? null,
      occurredAt: parsed.occurredAt ?? null,
      detectedLanguage: parsed.detectedLanguage ?? null,
      urgentTags,
      missingFields: parsed.missingFields ?? [],
      followUpQuestions: (parsed.followUpQuestions ?? []).slice(0, 2),
    };

    return NextResponse.json(result);
  } catch (e) {
    console.error("[/api/extract] error", e);
    return NextResponse.json(
      { error: "Extraction failed", detail: safeErr(e) },
      { status: 500 },
    );
  }
}

function safeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "unknown error";
}
