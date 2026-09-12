// SautiSafe safety constants: urgency vocabulary, severities, sample scenarios.
// Mirrors the guarded vocabulary used in convex/actions/extract.ts.

/** Urgent-risk keywords. If any appear in the transcript, the report is
 *  flagged urgent and surfaced for immediate supervisor review. */
export const URGENCY_VOCABULARY: Record<string, string[]> = {
  fire: ["fire", "burning", "burns", "flames", "on fire", "ignited", "combustion"],
  chemical: ["chemical", "spill", "fumes", "vapour", "vapor", "toxic", "hcl", "chlorine", "ammonia", "acid", "caustic", "exposure"],
  electrocution: ["electrocution", "electric shock", "shocked", "live wire", "high voltage", "arc flash", "electrical"],
  "uncontrolled-pressure": ["uncontrolled pressure", "overpressure", "relief valve", "burst", "rupture", "pressure release", "blowout"],
  injury: ["injury", "injured", "bleeding", "wound", "fracture", "broken bone", "concussion", "crush", "amputat"],
  "gas-leak": ["gas leak", "leaking gas", "gas escape", "methane", "propane leak", "lp gas"],
  explosion: ["explosion", "exploded", "blast"],
  collapse: ["collapse", "caved in", "structural failure", "scaffold collapsed"],
  entanglement: ["caught in", "entangled", "dragged", "machine caught", "clothing caught"],
};

/** Flatten the urgency vocabulary into a keyword list for quick scanning.
 *  Conservative & purely ADDITIVE: if a keyword appears, the tag is flagged.
 *  This backstop only ever CATCHES urgency the LLM might miss - it never
 *  removes a flag. The single, high-precision exception is the `injury` tag,
 *  which `applyInjuryNegation` can drop when the transcript clearly states
 *  nobody was hurt (e.g. "no one was injured"). For a safety tool, a false
 *  alarm is far safer than a missed urgent risk, so other tags are never
 *  suppressed by negation heuristics. */
export function detectUrgentTags(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tags: string[] = [];
  for (const [tag, words] of Object.entries(URGENCY_VOCABULARY)) {
    if (words.some((w) => lower.includes(w))) tags.push(tag);
  }
  return tags;
}

// High-precision injury-negation patterns. Only matched against the `injury`
// tag, and only when the negator is close to the injury word.
const INJURY_NEGATION = [
  /\bno one\b[^.]{0,20}\binjur/i,
  /\bnobody\b[^.]{0,20}\binjur/i,
  /\bno\b\s+injur/i,
  /\bno\b\s+(injur|hurt|casualt)/i,
  /\bwithout\b[^.]{0,20}\binjur/i,
  /\bnot\b[^.]{0,15}\binjur/i,
  /\bwasn'?t\b[^.]{0,20}\binjur/i,
  /\bweren'?t\b[^.]{0,20}\binjur/i,
  /\bno one\b[^.]{0,20}\bhurt/i,
  /\bnobody\b[^.]{0,20}\bhurt/i,
];

/** Returns true if the transcript clearly states nobody was injured.
 *  Used only to drop a false-positive `injury` urgent tag. */
export function isInjuryNegated(text: string): boolean {
  if (!text) return false;
  return INJURY_NEGATION.some((re) => re.test(text));
}

/** Drop the `injury` tag when the transcript clearly negates injury. */
export function applyInjuryNegation(tags: string[], transcript: string): string[] {
  if (!tags.includes("injury")) return tags;
  if (isInjuryNegated(transcript)) {
    return tags.filter((t) => t !== "injury");
  }
  return tags;
}

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INJURY_STATUSES = ["none", "minor", "serious", "unknown"] as const;
export const INCIDENT_STATUSES = [
  "draft", "extracted", "review", "submitted", "escalated", "resolved",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  extracted: "Extracted",
  review: "Awaiting review",
  submitted: "Submitted",
  escalated: "Escalated",
  resolved: "Resolved",
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const INJURY_LABELS: Record<string, string> = {
  none: "No injury",
  minor: "Minor",
  serious: "Serious",
  unknown: "Unknown",
};

/** Color tokens (tailwind classes) for badges per status/severity. */
export const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  extracted: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  review: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  submitted: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-800",
  escalated: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
  resolved: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
};

export const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200",
  high: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200",
  critical: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200",
};

/** Sample code-switched scenarios to seed the benchmark and demo. */
export interface SampleScenario {
  id: string;
  label: string;
  transcript: string;
  difficulty: "clean" | "noisy" | "accent" | "rapid" | "heavy-code-switch";
  referenceText: string;
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: "s1",
    label: "Reactor relief valve (code-switch, Luganda)",
    transcript:
      "Pressure ya reactor ebadde egenda waggulu, then relief valve n’etandika okukuba sound, naye twasobodde okugikendeeza.",
    difficulty: "heavy-code-switch",
    referenceText:
      "Pressure ya reactor ebadde egenda waggulu then relief valve n’etandika okukuba sound naye twasobodde okugikendeeza",
  },
  {
    id: "s2",
    label: "Chemical spill, warehouse (English)",
    transcript:
      "There was a chemical spill near the drum storage. Fumes were coming out. We isolated the area and called the safety officer.",
    difficulty: "clean",
    referenceText:
      "There was a chemical spill near the drum storage fumes were coming out we isolated the area and called the safety officer",
  },
  {
    id: "s3",
    label: "Forklift near-miss (Swahili + English)",
    transcript:
      "Forklift ilikuwa inasonga haraka, then operator hakuona mtu akitembea. Tuliambia a-stop immediately. Hakuna majeraha.",
    difficulty: "heavy-code-switch",
    referenceText:
      "Forklift ilikuwa inasonga haraka then operator hakuona mtu akitembea tuliambia a-stop immediately hakuna majeraha",
  },
  {
    id: "s4",
    label: "Electrical arc flash (English, technical)",
    transcript:
      "Arc flash on the isolator while maintenance was working. One worker got a minor burn on the hand. We shut down and locked out the panel.",
    difficulty: "accent",
    referenceText:
      "Arc flash on the isolator while maintenance was working one worker got a minor burn on the hand we shut down and locked out the panel",
  },
];

/** Human-friendly reference-number generator: SSA-YYYY-NNNN */
export function makeReferenceNo(count: number): string {
  const year = new Date().getFullYear();
  return `SSA-${year}-${String(count + 1).padStart(4, "0")}`;
}
