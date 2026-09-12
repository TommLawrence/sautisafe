---
Task ID: 2
Agent: full-stack-developer (convex migration)
Task: Build convex/ migration folder (schema + actions/queries mirroring the live Next.js backend)

Work Log:
- Read /home/z/my-project/worklog.md (did not exist; created with this section as the first entry).
- Read /home/z/my-project/prisma/schema.prisma to understand the live data model 1:1 (Worker, Incident, FollowUp, Transcript, BenchmarkRun, AuditEvent). Confirmed it matches the model spec exactly.
- Confirmed the live Next.js app at /home/z/my-project/src/app is in placeholder state (page.tsx + a stub /api/route.ts); the Prisma schema is the source of truth for the mirror.
- Created /home/z/my-project/convex/ with subfolders convex/lib/ and convex/actions/.
- Wrote convex/schema.ts: six tables (workers, incidents, followUps, transcripts, benchmarkRuns, auditEvents) mirroring the Prisma model. Used v.id("tableName") for FKs, v.float64() for confidence, v.int64() for byte/duration/latency/word counts, v.number() for unix-ms timestamps. Added indexes: byReferenceNo/byWorker/byStatus/byIsUrgent on incidents, byIncident on followUps/transcripts/auditEvents. Cascades are manual (handled in deleteIncident). Did NOT rely on DB defaults — createdAt/updatedAt are set in mutations.
- Wrote convex/lib/metrics.ts (pure, no Convex imports): normalizeText (Unicode-aware, keeps code-switched tokens), wordErrorRate & charErrorRate via classic Levenshtein DP, criticalTermRecall, computeAllMetrics, and a DEFAULT_CRITICAL_TERMS list tuned for industrial safety (pressure, valve, reactor, HCl, burner, boiler, hydrogen, nitrogen, electrocution, forklift, scaffold, PPE, etc.).
- Wrote convex/incidents.ts: queries listIncidents (filters by status/isUrgent/workerId using index-accelerated withIndex + secondary filter), getIncident, getIncidentDetail (incident + followUps + transcripts + auditEvents in parallel), nextReferenceNo (SSA-YYYY-NNNN). Mutations createIncident (enforces consentGiven + referenceNo uniqueness + writes "recorded" audit event), updateIncident (partial patch by supplied fields only + bumps updatedAt + audit event), reviewIncident (sets supervisor fields + "reviewed" audit), deleteIncident (manual cascade over followUps/transcripts/auditEvents then the incident).
- Wrote convex/followUps.ts: listForIncident query; createFollowUp mutation (validates parent incident, sets askedAt=now, audit "followup_asked"); answerFollowUp mutation (sets answer + answeredAt, audit "followup_answered").
- Wrote convex/transcripts.ts: listForIncident query; addTranscript mutation (stores provider output + metrics; when isPrimary, propagates text to incident.rawTranscript and writes "transcribed" audit).
- Wrote convex/benchmark.ts: listBenchmarkRuns (desc), getBenchmarkRun, saveBenchmarkRun (stores resultsJson + aggregateMetrics as JSON strings per Convex's lack of native JSON column).
- Wrote convex/audio.ts: generateUploadUrl (ctx.storage.generateUploadUrl), saveAudio (validates MIME allow-list {webm,wav,mp3,ogg,mp4,m4a,...} and 25 MB ceiling + verifies the storage blob exists), getAudioMeta query, getAudioUrl mutation (time-limited download URL for the supervisor playback screen).
- Wrote convex/actions/transcribe.ts: transcribeWithProvider action (sahara via SAHARA_TRANSCRIPTION_URL/SAHARA_API_KEY, whisper via OPENAI_API_KEY + OpenAI /v1/audio/transcriptions with verbose_json, gemini via GEMINI_API_KEY + generative generateContent with inline_data base64). Each provider: explicit env-var-missing throw (NO silent fallback), Date.now() latency measurement around the HTTP call, try/catch wrapping with safe (secret-stripped) error messages, robust field-name tolerance via pickString/pickOptionalNumber. runBenchmark action runs each provider sequentially via ctx.runAction, computes metrics with computeAllMetrics from lib/metrics.ts, records per-provider errors honestly in the results array (never retries on a different model).
- Wrote convex/actions/extract.ts: extractSafetyFields action calls an OpenAI-compatible chat-completions endpoint configured by LLM_API_BASE + LLM_API_KEY (model from LLM_MODEL, default gpt-4o-mini). Strong system prompt tuned for industrial safety + code-switched English/Luganda/Swahili with explicit safeguards: never declare equipment "safe", severity cannot be "low" without evidence, max 2 follow-up questions, urgentTags drawn from a fixed vocabulary, output JSON only. Robust parsing: stripCodeFences + JSON.parse with a clear error if parse fails; coerceExtractedFields normalizes the result into the strict ExtractedFields shape.
- Wrote convex/MIGRATION.md: full Prisma→Convex table mapping, per-field type mapping table, complete live-route → Convex-function mapping table, env var table (SAHARA_*, OPENAI_*, GEMINI_*, LLM_*, NEXT_PUBLIC_CONVEX_URL, VITE_CONVEX_URL), deployment steps (npm install convex, npx convex dev, npx convex env add ...), Vercel connection, frontend swap note, and a 10-row safeguard checklist (consent gate, emergency-procedures-first warning, max recording duration, 25 MB limit, MIME validation, no silent fallback, human transcript confirmation, no auto "equipment safe", audio-retention policy, append-only audit trail).
- Wrote convex/README.md: one-paragraph overview + pointer to MIGRATION.md, with a "do not run npx convex dev from this sandbox" note.

Stage Summary:
- Artifacts produced (all under /home/z/my-project/convex/):
  - schema.ts
  - lib/metrics.ts
  - incidents.ts
  - followUps.ts
  - transcripts.ts
  - benchmark.ts
  - audio.ts
  - actions/transcribe.ts
  - actions/extract.ts
  - MIGRATION.md
  - README.md
- Key decisions:
  - Stored JSON-shaped fields (urgencyTags, resultsJson, aggregateMetrics) as v.string() per Convex's lack of a native JSON column type.
  - Manual cascade in deleteIncident because Convex has no DB-level onDelete: Cascade.
  - referenceNo uniqueness enforced at the application layer (index lookup + throw) because Convex has no DB-level @unique constraint.
  - Provider latency measured with Date.now() around the actual HTTP call (excluding storage fetch) for fair cross-provider comparison.
  - "No silent fallback" competition requirement enforced at two layers: (1) each provider throws a clear "provider not configured" error on missing env vars; (2) runBenchmark records per-provider failures with the real error message and degenerate metrics — never retries on a different model.
  - System prompt for extraction includes the explicit safeguard "Never declare equipment safe" so the LLM cannot auto-resolve incidents; only reviewIncident (supervisor action) can move status to "resolved".
  - btoa + chunked String.fromCharCode for base64 encoding inside the Gemini provider to avoid call-stack limits on large audio blobs.
- Did NOT run npx convex dev / deploy, did NOT install convex, did NOT modify the live Next.js app or Prisma schema, did NOT create tests, did NOT set up any cron job, did NOT create any route under src/app.

---
Task ID: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
Agent: Z.ai Code (main orchestrator — live Next.js app)
Task: Build the SautiSafe live test instance in the Z cloud (Next.js 16 + Prisma + z-ai-web-dev-sdk), wire all four tabs and the full backend, and verify end-to-end.

Work Log:
- Read SautiSafe.pdf brief: a code-switched voice reporting assistant for industrial safety incidents (record → transcribe → extract structured fields → ask follow-ups → flag urgent risks → supervisor review → multi-model benchmark). Chose an industrial-safety teal/amber/red theme (no indigo/blue) and a sticky footer.
- Defined the data model in prisma/schema.prisma (Worker, Incident, FollowUp, Transcript, BenchmarkRun, AuditEvent) and pushed it to SQLite (bun run db:push + db:generate). This schema is mirrored 1:1 in convex/schema.ts by the Task 2 subagent.
- Delegated the convex/ migration folder (Task 2) to a full-stack-developer subagent in parallel: schema.ts, incidents.ts, followUps.ts, transcripts.ts, benchmark.ts, audio.ts, actions/transcribe.ts, actions/extract.ts, lib/metrics.ts, MIGRATION.md, README.md. Fixed one invalid TS return annotation (`Promise<v.id("incidents")>` → inferred) so lint passes.
- Built the shared lib: src/lib/types.ts (shared TS types), src/lib/metrics.ts (WER/CER/critical-term-recall, mirrors convex/lib/metrics.ts), src/lib/safety.ts (urgency vocabulary, severity/status constants, sample scenarios, reference-no generator, conservative additive urgent-tag scanner + high-precision injury-negation), src/lib/audio-utils.ts (MediaRecorder helpers + client-side 16kHz WAV encoding + size/time limits), src/lib/zai.ts (z-ai-web-dev-sdk singleton, transcribeAudio, chat/chatJson with code-fence stripping), src/lib/incidents-server.ts (reference-no + audit helpers + incident serialiser), src/lib/store.ts (Zustand store for active tab + report draft).
- Themed globals.css with a SautiSafe safety palette (teal primary, amber accent, red destructive, warm off-white/dark slate backgrounds), custom utilities (.bg-safety-grid, .bg-hivis-stripes, .animate-rec-pulse, .scroll-thin). Added app/icon.svg favicon and full metadata/viewport.
- Built the app shell: src/components/app-shell.tsx (sticky header with brand mark + nav tabs + mode toggle, main, sticky footer with the "emergency procedures come first" safeguard), src/components/theme-provider.tsx + query-provider.tsx + mode-toggle.tsx, src/components/brand-mark.tsx (inline SVG shield + soundwave), and wired them in layout.tsx/page.tsx.
- Built the Report tab (src/components/tabs/report-tab.tsx): 3-step flow — consent gate with emergency warning, AudioRecorder (src/components/audio-recorder.tsx: MediaRecorder + live level meter + 3-min cap + WAV encoding + file upload + drag-drop + playback), then transcribe → extract → editable structured report + UrgentBanner + follow-up Q&A → submit. Uses TanStack Query mutations calling /api/transcribe then /api/extract then /api/incidents.
- Built the Reports tab (src/components/tabs/reports-tab.tsx): supervisor queue with search/status/urgency filters, list with reference/urgent-chip/hazard/location/severity/status/time, a Sheet review drawer showing transcript + structured report + follow-ups + provider transcripts + append-only audit trail + supervisor review form (decision select + notes) + export-to-Markdown.
- Built the Benchmark tab (src/components/tabs/benchmark-tab.tsx): runner (audio dropzone + reference transcript + sample-scenario loader), results table (WER/CER/critical-term recall/latency/words), recharts bar chart, transcript lanes, and a history list with aggregate avg WER. Real z-ai ASR lane + two clearly-labelled simulated degradation lanes (honest: production uses real Whisper/Gemini via convex/actions/transcribe.ts).
- Built the About tab (src/components/tabs/about-tab.tsx): brand hero, 8 required safeguards, "what SautiSafe will never do", ethics & inclusion, architecture/data-ownership note pointing to convex/MIGRATION.md.
- Built the backend API routes: /api/transcribe (POST FormData → z-ai ASR, size+MIME validation, safe errors), /api/extract (POST transcript → LLM with a strong safety-aware system prompt, additive urgent backstop + injury-negation, JSON-safe parsing), /api/incidents (GET list with filters + POST create that writes the incident + primary Transcript + FollowUps + audit trail recorded/transcribed/extracted/escalated), /api/incidents/[id] (GET with relations + PATCH supervisor review), /api/benchmark (GET history + POST run: real ASR lane + 2 simulated lanes with computed metrics + aggregate + saved BenchmarkRun).
- Refined urgency handling: the keyword backstop is purely ADDITIVE (never removes a flag — a false alarm is safer than a missed urgent risk for a safety tool). Added a high-precision injury-negation pass (`applyInjuryNegation`) that drops the `injury` tag only when the transcript clearly states nobody was hurt ("no one was injured" / "no injuries" / "nobody hurt"). Tightened the extract prompt with an explicit negation example and a "never fabricate occurredAt dates" rule.
- Verified end-to-end with agent-browser + curl:
  * / 200, Report tab renders consent gate + recorder + footer.
  * Reports tab lists SSA-2026-0001 (Urgent · arc flash · Panel room B · High · Awaiting review); review drawer shows urgent banner, transcript, structured report, follow-ups, provider transcripts, audit trail (recorded→transcribed→extracted→escalated), supervisor review form, export.
  * Benchmark tab ran a no-audio run: real lane correctly skipped ("No audio provided for the real ASR lane"), 2 simulated lanes produced computed WER/CER/recall, run saved + chart + history rendered.
  * /api/extract verified with 3 code-switched transcripts: detected eng+lug correctly, extracted location/equipment/hazard/action, generated follow-up questions for missing fields, dropped `injury` for "no one was injured" while keeping it for a real arc-flash injury.
  * /api/incidents POST created SSA-2026-0001 with 1 followUp, 1 primary transcript (zai-asr), 4 audit events.
  * About tab renders safeguards, never-do list, ethics, architecture note.
- `bun run lint` passes clean (0 errors, 0 warnings) after fixing the lucide `MessageSquareQuestion`→`MessageSquareQuote` rename and removing two unused eslint-disable directives.

Stage Summary:
- The SautiSafe live test instance is fully functional in the Z cloud: a worker can consent, record/upload code-switched audio, get a transcript + structured safety report + focused follow-ups + urgent-risk flag, and submit for supervisor review; supervisors can filter, review, escalate/resolve, and export; the benchmark runner computes WER/CER/critical-term-recall across lanes and keeps a history.
- The production Convex backend is ready in /convex (schema + mutations/queries/actions mirroring every live route, MIGRATION.md with the full mapping + safeguards checklist).
- Honoured the explicit instruction NOT to set up any cron job.
- Audio file persistence (storing the raw audio blob) is handled by Convex file storage in production (convex/audio.ts); in this test instance the transcript + metadata + audit trail are stored and the audio bytes are processed transiently (noted in the About tab).
- No real Whisper/Gemini keys are present in this test env, so the benchmark's other two lanes are clearly-labelled simulations; swapping in real providers is a one-line change in convex/actions/transcribe.ts.
