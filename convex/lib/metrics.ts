// SautiSafe — speech-to-text benchmark metrics (pure functions).
//
// This module is server-only. It is consumed by the `runBenchmark` action in
// convex/actions/transcribe.ts to compute per-provider accuracy metrics
// against a human-confirmed reference transcript.
//
// All functions are pure (no Convex imports) so they are easy to test
// independently of the Convex runtime.
//
// Mirrors the live Next.js metrics logic that powers the benchmark UI.

/**
 * Default critical-terms list used when callers do not pass one explicitly.
 * These are high-stakes industrial-safety tokens that MUST be transcribed
 * correctly: a missed "boiler" or "hydrogen" can be the difference between
 * a deployable report and a fatal misclassification.
 *
 * Mixed-language terms are kept lowercase; code-switched tokens (English /
 * Luganda / Swahili) are preserved verbatim because normalizeText keeps
 * alphanumerics intact.
 */
export const DEFAULT_CRITICAL_TERMS: string[] = [
  // Pressure / flow / process
  "pressure",
  "valve",
  "reactor",
  "hcl",
  "burner",
  "boiler",
  "steam",
  "hydraulic",
  "pneumatic",
  "isolator",
  "compressor",
  "condenser",
  "pump",
  "gauge",
  "manifold",
  // Energy / electrical
  "electrocution",
  "electrical",
  "voltage",
  "transformer",
  "switchgear",
  "circuit",
  // Hazards
  "fire",
  "gas",
  "leak",
  "fume",
  "chemical",
  "spill",
  "explosion",
  "explosive",
  "toxic",
  "oxygen",
  "hydrogen",
  "nitrogen",
  "ammonia",
  "chlorine",
  "methane",
  // Mechanical
  "conveyor",
  "forklift",
  "scaffold",
  "crane",
  "hoist",
  "guard",
  // Response
  "emergency",
  "stop",
  "shutdown",
  "evacuate",
  "injury",
  "burn",
  "fall",
  "crush",
  "ppe",
];

/**
 * Normalize free-form transcript text for fair comparison.
 *  - lowercase
 *  - strip punctuation
 *  - collapse whitespace to single spaces
 *  - keep code-switched alphanumerics intact (so "HCl" -> "hcl", "spectrum-7"
 *    -> "spectrum 7", "n.go" stays "n go")
 *
 * This is intentionally permissive about Unicode letters so Luganda and
 * Swahili word characters survive normalization.
 */
export function normalizeText(s: string): string {
  if (s == null) return "";
  return s
    .toLowerCase()
    // Replace any run of non-letter/non-digit characters with a single space.
    // \p{L} and \p{N} cover Unicode letters/numbers (Luganda, Swahili, etc.).
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Levenshtein edit distance between two arrays of tokens (or characters).
 * Classic dynamic-programming implementation, O(n*m) time and O(min(n,m))
 * space (rolling two-row optimisation).
 */
function levenshtein<T>(a: T[], b: T[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  // Previous row (initialized to edit distance from empty prefix of `a`).
  let prev = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1, // deletion
        cur[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = cur;
  }
  return prev[m];
}

/**
 * Word Error Rate between `reference` and `hypothesis`.
 * Computed as Levenshtein distance on word arrays divided by reference word
 * count. Returns a number in [0, 1+]; values above 1 mean the hypothesis is
 * longer than (and very different from) the reference.
 *
 * Lower is better. 0 == perfect.
 */
export function wordErrorRate(
  reference: string,
  hypothesis: string,
  normalised = true,
): number {
  const refTokens = (normalised ? normalizeText(reference) : reference).split(" ").filter(Boolean);
  const hypTokens = (normalised ? normalizeText(hypothesis) : hypothesis).split(" ").filter(Boolean);
  if (refTokens.length === 0) {
    // Nothing to compare against; convention: 0 if hypothesis also empty.
    return hypTokens.length === 0 ? 0 : 1;
  }
  const dist = levenshtein(refTokens, hypTokens);
  return dist / refTokens.length;
}

/**
 * Character Error Rate between `reference` and `hypothesis`.
 * Same idea as WER but on the character stream after normalization — a more
 * fine-grained measure that catches single-letter slips ("HCl" vs "HC1").
 *
 * Lower is better. 0 == perfect.
 */
export function charErrorRate(
  reference: string,
  hypothesis: string,
  normalised = true,
): number {
  const ref = normalised ? normalizeText(reference) : reference;
  const hyp = normalised ? normalizeText(hypothesis) : hypothesis;
  if (ref.length === 0) {
    return hyp.length === 0 ? 0 : 1;
  }
  const dist = levenshtein(ref.split(""), hyp.split(""));
  return dist / ref.length;
}

/**
 * Fraction of `criticalTerms` that appear as whole-word tokens in the
 * hypothesis transcript after normalization.
 *
 * Returns 1 when every critical term is present (1 == perfect recall),
 * 0 when none is present. Critical because missing safety terms (e.g.
 * "boiler", "hydrogen") is far more dangerous than generic word slips.
 *
 * @param criticalTerms  list of terms to look for (already or about to be
 *                       normalized internally; case-insensitive).
 */
export function criticalTermRecall(
  reference: string,
  hypothesis: string,
  criticalTerms: string[],
): number {
  if (criticalTerms.length === 0) return 0;
  const hypTokens = new Set(normalizeText(hypothesis).split(" ").filter(Boolean));
  let hits = 0;
  for (const term of criticalTerms) {
    const t = normalizeText(term);
    if (t && hypTokens.has(t)) hits++;
  }
  return hits / criticalTerms.length;
  // Note: `reference` is accepted for API symmetry and may be used by callers
  // to filter critical terms to those that actually appear in the reference.
  // We keep the signature stable across all metric helpers.
  void reference;
}

/**
 * The full metrics payload stored alongside each provider's transcript in a
 * benchmark run. Matches the shape consumed by the live Next.js benchmark UI.
 */
export interface ProviderMetrics {
  /** Normalised Word Error Rate, 0..1+. Lower is better. */
  wer: number;
  /** Raw / unnormalised WER (per AfriHealth). */
  werUnnorm: number;
  /** Normalised Character Error Rate, 0..1+. Lower is better. */
  cer: number;
  /** Raw / unnormalised CER. */
  cerUnnorm: number;
  /** Fraction of critical terms recalled, 0..1. Higher is better. */
  criticalTermRecall: number;
  /** Word count of the hypothesis (post-normalization). */
  wordCount: number;
  /** Provider latency in milliseconds. */
  latencyMs: number;
}

/**
 * Compute the full metrics bundle for one (reference, hypothesis) pair.
 *
 * @param reference     Human-confirmed reference transcript.
 * @param hypothesis    Provider output to evaluate.
 * @param opts          { criticalTerms?, latencyMs? } — defaults are applied
 *                      if either is omitted.
 */
export function computeAllMetrics(
  reference: string,
  hypothesis: string,
  opts: { criticalTerms?: string[]; latencyMs?: number } = {},
): ProviderMetrics {
  const criticalTerms = opts.criticalTerms ?? DEFAULT_CRITICAL_TERMS;
  const latencyMs = Math.max(0, Math.round(opts.latencyMs ?? 0));
  const wordCount = normalizeText(hypothesis).split(" ").filter(Boolean).length;
  return {
    wer: round4(wordErrorRate(reference, hypothesis, true)),
    werUnnorm: round4(wordErrorRate(reference, hypothesis, false)),
    cer: round4(charErrorRate(reference, hypothesis, true)),
    cerUnnorm: round4(charErrorRate(reference, hypothesis, false)),
    criticalTermRecall: round4(criticalTermRecall(reference, hypothesis, criticalTerms)),
    wordCount,
    latencyMs,
  };
}

/** Round to 4 decimal places to keep the stored JSON tidy. */
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
