// Speech benchmark metrics - mirrors convex/lib/metrics.ts exactly.
// Pure functions, safe for client or server. Keep both copies in sync.

/** Industrial safety critical terms that MUST survive transcription. */
export const DEFAULT_CRITICAL_TERMS: string[] = [
  "pressure", "valve", "reactor", "relief", "burner", "boiler", "hydraulic",
  "isolator", "emergency", "stop", "chemical", "steam", "conveyor", "forklift",
  "scaffold", "electrical", "injury", "burn", "leak", "fume", "oxygen",
  "hydrogen", "nitrogen", "chlorine", "ammonia", "acid", "hcl", "gas", "fire",
  "smoke", "spill", "release", "explosion", "electrocution", "shock", "fall",
  "crush", "ppe", "harness", "helmet", "goggles", "ventilation", "exhaust",
  "generator", "transformer", "compressor", "pipeline", "tank", "drum",
  "valve", "gauge", "sensor", "alarm", "shutdown", "lockout", "tagout",
  "uncontrolled", "rupture", "overpressure", "overheat", "arc", "flash",
];

/** Normalize text for WER/CER comparison: lowercase, strip punctuation,
 *  collapse whitespace, keep code-switched tokens intact. */
export function normalizeText(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase();
  // Keep alphanumeric runs and spaces; treat other punctuation as separators.
  s = s.replace(/[^a-z0-9\s'’-]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function tokenize(input: string): string[] {
  return normalizeText(input).split(" ").filter(Boolean);
}

/** Classic Levenshtein distance on arrays. */
function levenshtein<T>(a: T[], b: T[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Word Error Rate: 0 (perfect) .. 1+ (substitutions+insertions+deletions / ref words). */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return levenshtein(ref, hyp) / ref.length;
}

/** Character Error Rate. */
export function charErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeText(reference).split("");
  const hyp = normalizeText(hypothesis).split("");
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return levenshtein(ref, hyp) / ref.length;
}

/** Fraction of critical terms (from the reference) that survive in the hypothesis. */
export function criticalTermRecall(
  reference: string,
  hypothesis: string,
  criticalTerms: string[] = DEFAULT_CRITICAL_TERMS,
): number {
  const refTokens = new Set(tokenize(reference));
  const hypTokens = new Set(tokenize(hypothesis));
  // Only count critical terms that actually appear in the reference.
  const relevant = criticalTerms.filter((t) => refTokens.has(t.toLowerCase()));
  if (relevant.length === 0) return 1; // nothing critical to recall
  const recalled = relevant.filter((t) => hypTokens.has(t.toLowerCase()));
  return recalled.length / relevant.length;
}

export interface Metrics {
  wer: number;
  cer: number;
  criticalTermRecall: number;
  wordCount: number;
  latencyMs: number | null;
}

export function computeAllMetrics(
  reference: string,
  hypothesis: string,
  opts: { criticalTerms?: string[]; latencyMs?: number | null } = {},
): Metrics {
  return {
    wer: wordErrorRate(reference, hypothesis),
    cer: charErrorRate(reference, hypothesis),
    criticalTermRecall: criticalTermRecall(reference, hypothesis, opts.criticalTerms),
    wordCount: tokenize(hypothesis).length,
    latencyMs: opts.latencyMs ?? null,
  };
}

export function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return `${(x * 100).toFixed(1)}%`;
}

export function ms(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return `${Math.round(x)}ms`;
}
