# SautiSafe - Submission for Judges

> A code-switched voice reporting assistant for industrial safety incidents
> and near misses, with a multi-model African-language speech benchmark.

---

## One-line pitch

**SautiSafe turns a verbal, code-switched safety report into a structured,
supervisor-reviewable record - and benchmarks the African-language speech
models that make it possible, honestly.**

### The problem

Industrial workers report hazards verbally. In East African factories,
construction sites, logistics hubs, mines, and transport fleets, the
languages workers actually speak are code-switched: English mixed with
Luganda, Swahili, or another local language, with technical terms
("pressure", "valve", "reactor") staying in English. Today's formal
reporting tools demand typed, English-only, narrative-free text fields that
workers find slow, intimidating, and culturally alien. The result:

- Real hazards go under-reported because the paperwork is too high a
  barrier.
- **Near misses** - the most valuable early signal in safety management -
  go almost completely undocumented because nobody fills a form for
  something that "almost happened".
- Supervisors receive reports hours late, in inconsistent formats, missing
  critical fields (where, what equipment, who was affected, what was done).
- Urgent language ("fire", "chemical spill", "electrocution", "arc flash")
  is buried in free text and not surfaced for immediate action.
- African-language speech-to-text is rarely benchmarked honestly: most
  tools either silently fall back to a global English model or report
  simulated numbers.

---

## What SautiSafe does

An agentic workflow that turns one voice note into a complete safety record:

1. **Record** - the worker opens the PWA on their phone, consents to audio
   storage, and records a 1-3 minute voice note in their natural
   code-switched language (e.g. Luganda-English, Swahili-English, or
   English). They can also upload an existing audio file.
2. **Transcribe** - the audio is sent to the real **Intron/Sahara STT**,
   which has dedicated bilingual ASR models for 12 African code-switched
   pairs (including `lg` Luganda-English and `sw` Swahili-English). The
   route tries the sync endpoint first; on a 503 (timeout) or 400 (audio
   too long) it falls back to async upload + status polling - no silent
   fallback to a different model.
3. **Extract** - the transcript is sent to an LLM with a strict
   safety-aware system prompt that pulls out structured fields: location,
   equipment, hazard, people affected, immediate action, injury status,
   severity, when it happened, detected language, and urgent tags drawn
   from a fixed vocabulary.
4. **Detect missing info** - the LLM lists the high-priority fields it
   could not infer and asks at most 2 focused follow-up questions.
5. **Focused follow-ups** - the worker answers the follow-ups (typed or
   added during review). The system only asks about what is actually
   missing.
6. **Flag urgent risks** - an additive urgency backstop unions any
   vocabulary keywords the LLM missed (a false alarm is safer than a missed
   urgent risk), and a high-precision injury-negation pass drops the
   `injury` tag only when the transcript clearly says nobody was hurt
   ("no one was injured", "nobody hurt").
7. **Supervisor review + export** - the report lands in the supervisor
   queue with an urgent banner, a reference number (`SSA-2026-0001`), the
   editable transcript, the structured fields, the follow-up Q&A, the
   provider transcripts, an append-only audit trail, a review form
   (escalate/resolve + notes), and a one-click Markdown export.

On top of the reporting flow, SautiSafe runs a **multi-model speech
benchmark** that compares Intron/Sahara, OpenAI Whisper, and Google Gemini
(`gemini-3.8-flash`) on either standalone audio samples or on real incident
audio, computing WER, CER, and critical-term recall.

---

## Why it fits the competition

- **Real-world impact.** Industrial safety is a domain where the
  documentation gap costs lives and money across factories, construction,
  logistics, mining, utilities, and transport. SautiSafe targets the exact
  bottleneck: the moment a worker decides whether to report.
- **Benchmark quality.** WER and CER are standard, but for safety the
  decisive metric is **critical-term recall** - the fraction of
  industrial-safety vocabulary (pressure, valve, reactor, HCl, burner,
  boiler, hydrogen, nitrogen, electrocution, forklift, scaffold, PPE, etc.)
  in the reference that also appears in the hypothesis. Missing "pressure"
  in a reactor report is far more dangerous than missing an article. This
  metric matters most for code-switched speech, where global English models
  tend to drop or mistranslate local terms.
- **Product quality.** SautiSafe is genuinely agentic: it does not just
  transcribe - it extracts structured fields, decides what is missing, asks
  targeted follow-ups, flags urgency, and routes the result to a human
  reviewer with a full audit trail. The supervisor stays in the loop on
  every decision.
- **Technical execution.** Strict validation (25 MB / 3-min caps, MIME
  allow-list, mandatory consent), the "no silent fallback" rule in
  benchmark mode, latency measured around the actual HTTP call for fair
  cross-provider comparison, and a human transcript-confirmation step
  before any report becomes a benchmark reference.
- **Ethics + inclusion.** Verbal-first reporting meets workers where they
  are. Code-switched Luganda/Swahili + English is a first-class input, not
  an edge case. Anonymous reporting is supported. Consent is mandatory.
  The About tab declares the providers and datasets in use. A
  non-retaliation posture is baked into the design.

---

## Value proposition

- Turns verbal, code-switched reports into clean structured safety records
  - no typing, no English-only forms, no narrative essays.
- Catches near misses that currently go undocumented because the barrier to
  reporting is too high.
- Flags urgent language ("fire", "chemical", "electrocution", "arc flash")
  for immediate supervisor review with an additive, conservative scanner
  that never silently drops a flag.
- Benchmarks African-language STT honestly: real Intron/Sahara sync +
  async-poll STT, real OpenAI Whisper, real Gemini, real errors surfaced
  when keys are missing or geo-blocked.
- Closes the loop: supervisor review, editable transcript, audit trail,
  one-click export.

---

## How it works (brief)

1. **Record** in the PWA (MediaRecorder + client-side 16 kHz WAV encode).
2. **Transcribe** via the real Intron/Sahara sync STT endpoint; on 503/400
   the route polls the async status endpoint. Product mode falls back to
   z-ai ASR transparently (and tags the response so the supervisor knows
   the Sahara lane did not run).
3. **Extract** structured fields with a safety-aware LLM prompt; an
   additive keyword backstop and a high-precision injury-negation pass
   refine the urgent tags.
4. **Ask** at most 2 focused follow-up questions for missing high-priority
   fields.
5. **Save** the incident, primary transcript, follow-ups, and audit trail
   via `POST /api/incidents`. If the submit fails, the full report (audio
   Blob included) is queued in IndexedDB and auto-retried on reconnect.
6. **Review** in the supervisor queue: edit the transcript into a verified
   reference, escalate or resolve, export to Markdown, and (optionally)
   run the multi-model benchmark on the report's own audio.

**The three providers:**

- **Intron/Sahara** - the organisers' real African-language STT. Sync upload
  with 503/400 -> async poll fallback. `lg`/`sw`/`en` codes; dedicated
  bilingual ASR models for 12 code-switched pairs. `use_disable_llm_corrections=TRUE`
  so code-switched technical terms survive verbatim (SautiSafe runs its own
  extraction).
- **OpenAI Whisper** (`whisper-1`) - real `verbose_json` transcription via
  `https://api.openai.com/v1/audio/transcriptions`. Whisper supports fewer
  African languages than Intron, so the language code is passed through and
  any rejection is surfaced safely.
- **Google Gemini** (`gemini-3.8-flash`) - real `generateContent` call with
  inline_data base64 audio, temperature 0, and a "transcribe verbatim,
  preserving code-switched technical terms" instruction.

**The safeguards:**

- Consent gate before recording (mandatory; backend rejects without it).
- Emergency-procedures-first warning ("this app does not replace them").
- Additive urgency scanner (never drops a flag) + high-precision
  injury-negation (only drops `injury` when "no one was injured" is clear).
- "Never declare equipment safe" rule in the LLM prompt; only a supervisor
  can move a report to `resolved`.
- Human transcript confirmation (the supervisor can edit the transcript into
  a verified reference before benchmarking).
- 25 MB / 3-minute recording cap + MIME allow-list, enforced client- and
  server-side.
- Append-only audit trail for every meaningful action.
- Anonymous reporting supported; no real names in benchmark material.

---

## The benchmark

**What it measures:**

- **WER (Word Error Rate)** - classic Levenshtein DP over word sequences,
  Unicode-aware normalization that preserves code-switched tokens.
- **CER (Character Error Rate)** - same DP over characters.
- **Critical-term recall** - the fraction of industrial-safety vocabulary
  in the reference that also appears in the hypothesis. This is the metric
  that matters most for safety: missing "pressure" or "valve" in a reactor
  report is far more dangerous than missing an article.
- **Latency** - wall-clock ms around the actual HTTP call (excluding
  upstream storage fetch) for fair cross-provider comparison.

**The honest "no silent fallback" rule:**

In benchmark mode, if a provider key is missing the lane reports an honest
"not configured" error. If the call errors, the lane records the real error
message. **The run never substitutes a different provider for a failed lane.**
A benchmark that silently swapped models would lie about model quality. In
product mode (the Report tab), a transparent fallback to z-ai ASR is allowed
and clearly tagged in the response.

**Per-report benchmark on real field audio:**

The supervisor can click "Benchmark this report" in the review drawer. The
route loads the report's persisted audio (`audioStoragePath`), maps the
report's detected language back to an Intron code, runs all three real
providers against the report's transcript as the reference, saves Whisper
and Gemini as non-primary transcript rows on the incident (Sahara keeps its
primary), creates a `BenchmarkRun`, and renders a compact results table in
the drawer. This means every real field report can become a benchmark case -
no separate test harness needed.

---

## Safeguards and ethics

- **Consent.** Recording is disabled until the worker consents. The backend
  rejects any submission without `consentGiven: true`.
- **Emergency-procedures-first.** A banner tells the worker to follow the
  site's emergency procedures first if anyone is in immediate danger; this
  app does not replace them.
- **Never declares equipment safe.** The extraction prompt forbids it. Only
  a supervisor's `PATCH` moving `status` to `resolved` can close an
  incident.
- **Human transcript confirmation.** The supervisor can edit the transcript
  into a verified reference before it becomes a benchmark ground truth. The
  benchmark route refuses to run if there is no transcript.
- **No real names in benchmark material.** The four sample scenarios are
  consented original recordings; no worker names are stored in benchmark
  runs.
- **Audio retention note.** In the test env, audio is persisted to local
  disk so the per-report benchmark can re-transcribe it. Production uses
  Convex file storage. The retention policy is documented in
  `convex/MIGRATION.md`; the test env does not auto-delete.
- **Non-retaliation.** Anonymous reporting is supported (the `Worker`
  relation is optional). The consent gate explains what is being stored.
- **No silent fallback in benchmark mode.** Hard competition requirement.

---

## Weaknesses and risks (honest)

a. **Whisper + Gemini geo-restrict the test region.** The keys are valid
   (auth accepted) but OpenAI returns HTTP 403
   `unsupported_country_region_territory` and Gemini returns HTTP 400
   `User location is not supported for the API use`. In this Z cloud
   sandbox only the Intron/Sahara API actually completes a transcription.
   Both will work on a Vercel deployment in a supported (US/global) region.
   The benchmark lanes surface these errors honestly (no silent fallback).

b. **The benchmark reference is the supervisor-verified transcript.** The
   per-report benchmark uses the incident's `rawTranscript` as the ground
   truth. The supervisor should correct it first (the route returns 400 if
   there is no transcript). This makes the metrics human-dependent in
   accuracy.

c. **Urgency detection is keyword + LLM based.** The additive scanner is
   conservative (it never drops a flag, which can over-flag), and a
   high-precision negation pass handles "no one was injured" / "no
   injuries" / "nobody hurt". It may still over-flag negated injury in
   edge cases; the supervisor confirms every urgent report before action.

d. **No real auth gate in the prototype.** An in-Zcloud OTP login gate was
   built and then stripped at the owner's request (no email gateway in the
   z-ai SDK; the gate's cookie did not survive the preview/Caddy redirect).
   The app opens straight to the Report tab. For the Vercel deployment,
   Clerk is the clean choice. This is intentional for demo openness.

e. **Audio persisted to local disk in the test env.** `src/lib/audio-storage.ts`
   writes blobs to `db/uploads/` so the per-report benchmark can
   re-transcribe them. Production uses Convex file storage. Noted in the
   About tab.

f. **The evaluation sample is small and consented-original, not the
   organisers' dataset.** The four sample scenarios in `src/lib/safety.ts`
   (s1-s4) cover Luganda-English, English, Swahili-English, and technical
   English. This is declared per the organisers' guidance that different
   datasets/providers are allowed if declared.

g. **TTS test samples are clean speech (no real accent/noise).** The four
   sample scenarios are typed-text-style reference transcripts; they
   exercise the pipeline end to end but are functional testing only, not a
   noisy real-world accent evaluation.

---

## Answers to likely judge questions

**Q: Which speech models did you benchmark?**
Three real providers: Intron/Sahara (the organisers' African-language STT,
sync upload with 503/400 -> async poll fallback), OpenAI Whisper
(`whisper-1`, verbose_json), and Google Gemini (`gemini-3.8-flash`,
generateContent with inline_data base64 audio). All three are wired into
both the standalone benchmark route (`/api/benchmark`) and the per-report
benchmark route (`/api/incidents/[id]/benchmark`) via the shared
`runBenchmarkLanes()` helper.

**Q: How do you handle code-switching?**
Intron/Sahara has dedicated bilingual ASR models for 12 code-switched pairs
(including `lg` Luganda-English and `sw` Swahili-English). We pass the
language code upfront (Intron has no auto-detection). We send
`use_disable_llm_corrections=TRUE` so code-switched technical terms survive
verbatim (we run our own LLM extraction with a prompt that tells it to
preserve technical terms exactly as spoken). The metrics engine uses
Unicode-aware normalization that keeps code-switched tokens intact.

**Q: How accurate is the urgency detection?**
It is keyword + LLM based, with two refinements: an additive backstop that
unions any vocabulary keywords the LLM missed (it never drops a flag - a
false alarm is safer than a missed urgent risk for a safety tool), and a
high-precision injury-negation pass that drops the `injury` tag only when
the transcript clearly states nobody was hurt ("no one was injured",
"nobody hurt", "no injuries"). It may over-flag negated injury in edge
cases; the supervisor confirms every urgent report.

**Q: What if a provider fails mid-benchmark?**
The lane records the real error message and `success: false`. The run never
substitutes a different provider. This is a hard competition requirement.
In product mode (the Report tab), a transparent fallback to z-ai ASR is
allowed and is clearly tagged in the response (`via: "no-intron-key"` or
`"fallback-after-intron-error"`) so the supervisor knows the Sahara lane did
not run.

**Q: How do you protect worker privacy?**
Consent is mandatory. Anonymous reporting is supported (the `Worker`
relation is optional; `displayName` is optional). No real names are stored
in benchmark runs. API keys live in server-side env vars only; `/api/status`
exposes only boolean `configured` flags. Safe-error helpers strip Bearer
tokens, `sk-` prefixes, and Gemini `AIza...` prefixes from any error
message that might be echoed back.

**Q: Does it work offline?**
Yes. It is an installable PWA. The service worker caches the app shell and
the last reports list for offline reads. If a report submit fails (offline,
network error, 5xx), the full report (including the recorded audio Blob) is
queued in IndexedDB and auto-retried on reconnect or app reopen. The SW
never intercepts `POST`/`PUT`/`PATCH /api/*` so writes flow to the queue.

**Q: Is the audio retained?**
In the test env, audio is persisted to local disk (`db/uploads/`) so the
per-report benchmark can re-transcribe it. Production uses Convex file
storage. The retention policy is documented; the test env does not
auto-delete. The supervisor can delete reports, which cascades to the
transcripts/follow-ups/audit events but leaves the audio blob (it may be
referenced by benchmark runs).

**Q: How is this different from a generic voice-to-text app?**
A generic STT app transcribes. SautiSafe is agentic: it transcribes, extracts
structured safety fields, decides what is missing, asks at most 2 targeted
follow-ups, flags urgency with a fixed vocabulary + additive backstop +
injury-negation, routes the result to a human reviewer with an append-only
audit trail, and lets the reviewer edit the transcript into a verified
reference and re-run all three speech models on the same audio as a
benchmark. The benchmark and the report share the same audio - real field
data becomes a benchmark case.

**Q: What's the deployment plan?**
The `convex/` folder is the production-ready backend, a 1:1 mirror of every
Prisma model and every `/api/*` route. The owner runs `npm install convex`
+ `npx convex dev` locally, sets the env vars via `npx convex env set`,
connects Vercel via the Convex integration (sets `NEXT_PUBLIC_CONVEX_URL`),
and swaps the frontend from `fetch("/api/*")` to Convex hooks. The full
step-by-step is in `convex/MIGRATION.md`. In a supported Vercel region,
Whisper and Gemini will also work (they geo-block the sandbox).

**Q: What dataset did you use, and is it declared?**
A small consented-original sample of four code-switched scenarios (s1
reactor relief valve in Luganda, s2 chemical spill in English, s3 forklift
near-miss in Swahili+English, s4 arc flash in technical English) plus any
real incident audio recorded through the app. This is **not** the
organisers' dataset. It is declared in the About tab and here, per the
organisers' WhatsApp guidance that different datasets/providers are allowed
if declared. No external datasets are bundled.

---

## What's next (roadmap)

- **Real Whisper + Gemini on Vercel.** Both providers authenticate fine;
  they just geo-block the Z cloud sandbox region. A Vercel deployment in a
  supported region flips all three lanes to fully functional.
- **Streaming live captions.** The Intron WebSocket STT spec
  (`wss://infer.voice.intron.io/stt/v1/stream`, base64 PCM16-LE chunks)
  is documented in `docs/intron-api-spec.md`. The current recorder encodes
  WAV; a streaming path needs a PCM16-LE encoder.
- **Convex production deploy.** The `convex/` folder is ready; the owner
  cuts over when they are ready.
- **Audio retention controls.** Configurable retention sweeps, per-incident
  delete-audio controls, and a supervisor-facing retention policy.
- **Role-based access.** Operator vs. supervisor vs. admin roles, with
  Clerk auth on the Vercel deployment.
- **Multilingual voice responses.** Intron's TTS endpoints
  (`/tts/v1/generate`, `/tts/v1/stream`, with `lg` Luganda and `sw`
  Swahili accents) can power spoken follow-up prompts for low-literacy
  workers.

---

## Try it

The app has four tabs:

1. **Report** - consent -> record or upload a code-switched voice note ->
   see the transcript (with provider badge + latency) -> see the extracted
   structured fields + urgent banner + follow-up questions -> submit.
2. **Reports** - the supervisor queue with search/status/urgency filters,
   an urgent-chip list, and a review drawer showing the transcript (editable
   into a verified reference), structured report, follow-up Q&A, provider
   transcripts, audit trail, supervisor review form, export-to-Markdown,
   and "Benchmark this report" (loads the persisted audio and runs all
   three real providers against the report's transcript).
3. **Benchmark** - the standalone benchmark runner. Drop an audio file (or
   load one of the four sample scenarios), paste or load the reference
   transcript, pick the speaking language, and run all three lanes. See
   the WER/CER/critical-term-recall/latency table, the bar chart, the
   transcript lanes, and the history list with aggregate averages.
4. **About** - the brand hero, the 8 required safeguards, the "what
   SautiSafe will never do" list, the ethics + inclusion section, the live
   provider-status pills (Intron/Whisper/Gemini/z-ai/PWA/Offline), the
   architecture + data-ownership note, and the dataset + provider
   declaration.

**Test samples.** The Benchmark tab ships four code-switched sample
scenarios (s1-s4) covering Luganda-English, English, Swahili-English, and
technical English. Any additional audio samples the owner drops into the
`/download/` folder alongside this document can be uploaded into the
Benchmark tab's dropzone. The per-report benchmark on the Reports tab uses
real field audio captured through the app.
