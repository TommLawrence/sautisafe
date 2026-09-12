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

---
Task ID: R1
Agent: general-purpose (Intron API spec extraction)
Task: Extract the complete Intron Voice / Sahara API spec from the uploaded HTML docs.

Work Log:
- Read /home/z/my-project/worklog.md to understand the SautiSafe project (code-switched voice reporting assistant for industrial safety; live Next.js app + Convex mirror already built; Sahara lane = the Intron Voice API).
- Listed /home/z/my-project/upload/ — 13 HTML pages (Mintlify server-rendered React) + SautiSafe.pdf + a page.tsx/layout.tsx/globals.css (irrelevant).
- Confirmed the docs are NOT escaped JSON — they are plain HTML with text inside <span> elements; the "children:" extraction hint in the task brief doesn't apply here. Used Python (re + html.unescape) to strip tags and extract <pre> blocks for curl examples and JSON samples.
- Extracted every intron API URL via `rg -o 'https://[a-z0-9.-]*intron[a-z0-9./_-]*'` and `rg -oi 'wss?://[a-z0-9.-]*intron[a-z0-9./_-]*'`. Confirmed base URLs:
  - REST: https://infer.voice.intron.io
  - WebSocket: wss://infer.voice.intron.io
  Endpoints found: /file/v1/upload, /file/v1/upload/sync, /file/v1/status/{file_id}, /stt/v1/stream, /tts/v1/enqueue, /tts/v1/status/{text_id}, /tts/v1/generate, /tts/v1/stream. Plus developer console at https://voice.intron.io/v2/developers.
- Discovered that 5 of the 13 uploaded HTML pages were 404 stubs (upload-file.html, upload-file-sync.html, upload-text.html, get-text-status.html, widget-integration.html) — the Mintlify nav sidebar was rendered but the page body was a "Page Not Found" placeholder. Fetched the missing pages from the live docs site (https://docs.voice.intron.io/docs/...) via curl with -A 'Mozilla/5.0' to fill the gaps. All four fetched successfully (HTTP 200, ~250KB–1.9MB each).
- Extracted and read the full body text + all <pre> blocks for: index (intro), file-status (status poll), streaming (STT WS), question-answering (Q&A), supported-languages (STT langs + code-switched column), supported-languages-and-accents (TTS langs/accents), tts-generate (sync TTS), tts-streaming (TTS WS), and the four online-fetched pages (upload-file, upload-file-sync, upload-text=tts-queue, get-text-status=tts-status).
- Reconstructed curl examples and JSON request/response bodies from the <pre> blocks (verbatim) and parameter tables (verbatim). Where Mintlify lazy-loaded a JSON sample client-side (file-status response, async upload response, QA "no question" / 503 variants), marked as "reconstructed" or "not documented" rather than guessing.
- Wrote /home/z/my-project/docs/intron-api-spec.md (1302 lines, 53KB) with all 10 required sections: Overview & Auth, Async STT + polling, Sync STT, Streaming STT, Supported STT languages, Question Answering, TTS generate + streaming + supported langs/accents, Widget integration, Errors, Mapping to SautiSafe. Every endpoint has method, path, headers, form/JSON body params (with types, required, options, defaults), verbatim curl examples, and verbatim JSON responses where rendered. Marked reconstructed vs verbatim throughout.

Stage Summary:
- Base URL & auth: REST = https://infer.voice.intron.io; WS = wss://infer.voice.intron.io. Auth = `Authorization: Bearer YOUR_API_KEY` on every request. STT endpoints need `Content-Type: multipart/form-data`; TTS endpoints need `Content-Type: application/json`. Support: voice@intron.io. API keys issued at https://voice.intron.io/v2/developers.
- STT async flow (upload → poll → result):
  1. POST https://infer.voice.intron.io/file/v1/upload (multipart/form-data: audio_file_name, audio_file_blob=@file, use_language_asr_input=<lang code>, plus optional use_category/use_template_id/use_diarization/use_disable_llm_corrections and per-category get_* flags). Returns file_id with status FILE_QUEUED (JSON sample not rendered in static HTML — reconstructed).
  2. Poll GET https://infer.voice.intron.io/file/v1/status/{file_id} (optional ?get_structured_post_processing=t). Status enum: FILE_QUEUED, FILE_PENDING, FILE_PROCESSING, FILE_TRANSCRIBED, FILE_PROCESSING_FAILED.
  3. On FILE_TRANSCRIBED, data.audio_transcript + data.processed_audio_duration_in_seconds are available.
  Rate limits: 60/min upload, 100/min poll. Sync variant (POST /file/v1/upload/sync) hard-caps audio at 120 s and processing at 120 s (HTTP 503 on timeout → poll with returned file_id). 30/min sync rate limit.
- Luganda & Swahili: BOTH SUPPORTED. Luganda = code "lg" (labelled "Luganda-English", code-switched ✓). Swahili = code "sw" (labelled "Swahili-English", code-switched ✓). Code-switching is EXPLICITLY supported via dedicated bilingual ASR models (12 code-switched pairs total: af, ak, am, ha, ig, lg, pcm, rw, sw, wo, yo, zu). IMPORTANT: codes are ISO 639-1-style (lg, sw), NOT ISO 639-3 (lug, swa) — SautiSafe must use `lg` and `sw`. Auto language detection is NOT documented — SautiSafe must pick the model upfront via use_language_asr_input.
- Streaming protocol: WebSocket (not HTTP chunked, not SSE). STT = wss://infer.voice.intron.io/stt/v1/stream; TTS = wss://infer.voice.intron.io/tts/v1/stream. Auth via Authorization header on the WS upgrade. STT audio frames are JSON messages with message_type=INPUT_AUDIO_CHUNK + audio_base_64 (base64-encoded PCM16 little-endian) + optional ack_id. Partial transcripts arrive as PARTIAL_TRANSCRIPT; final as COMMITTED_TRANSCRIPT after the client sends COMMIT. Runtime limits: 300 s session, 60 s idle, 1–32 KB chunks (STT), 10–100 chars per text chunk (TTS).
- QA: NOT a separate endpoint — it's a post-processing mode of POST /file/v1/upload/sync, triggered by form field get_answer=TRUE. The transcript (audio_transcript) is returned in the question's language; the answer (transcript_answer) is returned in use_language_data_extraction_output (defaults to question language). 503 timeout also returns a file_id for polling.
- TTS: Async (POST /tts/v1/enqueue → GET /tts/v1/status/{text_id}) returns an audio_path URL; Sync (POST /tts/v1/generate) returns the same shape inline. Both accept text, voice_language, voice_accent, voice_gender (all required), output_audio_format (optional, default wav, options wav/opus). 12 TTS languages including lg (luganda accent) and sw (swahili accent), each male/female. English has 10 African accents. Character-limit docs are inconsistent (prose says 4096, error example says 1200/100) — use the smaller number defensively.
- Widget: npm package @intron_health/intron_transcriber_streaming; UMD bundle path/to/intron_transcriber_widget.umd.js (real CDN not documented); loadIntronTranscribeWidget(parent, apiKey, options) with options writeStreamOnlyInSpecifiedTextbox + showPostProcessingCategory. Requires API key in client code — incompatible with SautiSafe's server-held-key posture; SautiSafe should NOT use the widget in production.
- Errors: REST envelope {data:{}, message:"<human-readable>", status:"Error"}. No machine-readable error code field — must substring-match message. HTTP codes documented: 200, 400 (bad request), 503 (sync timeout, carries file_id/text_id). 429 implied for rate limit but not explicitly documented. WS error taxonomy: AUTHENTICATION_ERROR, RESOURCE_EXHAUSTED (CAPACITY_NOT_AVAILABLE), QUOTA_EXCEEDED, INPUT_ERROR, ERROR, CHUNK_SIZE_TOO_SMALL/LARGE, INSUFFICIENT_AUDIO_ACTIVITY/TEXT_ACTIVITY, SESSION_TIME_LIMIT_EXCEEDED, CHUNK_ID_MISMATCH_WITH_TOTAL.
- Gotchas affecting SautiSafe wiring:
  1. Sync STT hard-caps at 120 s audio + 120 s processing — SautiSafe's 3-min MediaRecorder limit must be reduced or routed through async upload.
  2. 503 returns file_id for follow-up polling — that's the ONLY allowed recovery path (no silent fallback to another provider, per SautiSafe rule).
  3. No auto language detection — SautiSafe Report tab needs a language picker (lg/sw/en).
  4. Intron's post-processing categories (telehealth, call_center, legal, meeting_notes, procedure, general) don't include industrial safety — SautiSafe must keep its own src/lib/safety.ts urgent-keyword scan + /api/extract LLM extraction as the canonical safety-analysis path; Intron is only the ASR lane.
  5. Streaming STT needs raw PCM16 little-endian base64 chunks (not WebM/Opus) — SautiSafe's audio-utils would need a PCM16-LE encoder path if live captions are added later.
  6. Widget needs API key in browser — incompatible with SautiSafe security posture; keep server-side /api/transcribe.
  7. Tight sync rate limits (30/min sync STT) — for a multi-worker pilot, prefer async upload + jittered status poller.
  8. Doc inconsistencies on TTS character limits — verify on first integration.
- Confirmed: wrote /home/z/my-project/docs/intron-api-spec.md (53KB, 1302 lines, all 10 required sections, verbatim vs reconstructed labelled throughout) and appended this entry to /home/z/my-project/worklog.md. Did NOT modify any SautiSafe source files (src/, convex/, prisma/), did NOT run the dev server / lint / build, did NOT install packages, did NOT set up any cron job.

---
Task ID: 13 (Intron/Sahara integration)
Agent: Z.ai Code (main orchestrator)
Task: Wire up the REAL Intron Voice (Sahara) speech API from the organisers' docs, replacing the z-ai ASR proxy for the primary transcription + benchmark lane.

Work Log:
- Launched a research subagent (Task R1) that extracted a complete, implementation-ready spec from the 13 uploaded HTML docs (+ live docs site for 5 stub pages) into /docs/intron-api-spec.md. Key findings: base https://infer.voice.intron.io, Bearer auth, async STT (POST /file/v1/upload → poll GET /file/v1/status/{file_id}), sync STT (POST /file/v1/upload/sync, ≤120s, 503→poll), WS streaming (wss://.../stt/v1/stream, base64 PCM16-LE), Luganda=lg & Swahili=sw BOTH support code-switching, NO auto language detection, QA + TTS endpoints.
- Wrote src/lib/intron.ts (server): transcribeWithIntron() tries sync STT first; on 503 extracts file_id and polls the async status endpoint; on 400 (audio too long) re-uploads async and polls. Poll uses gentle backoff (1.5s→5s) bounded at 100s. Sends multipart fields audio_file_name, audio_file_blob, use_language_asr_input, use_category=file_category_general, use_disable_llm_corrections=TRUE (so code-switched technical terms survive verbatim — we run our own LLM extraction). isIntronConfigured() guards the key.
- Created src/lib/languages.ts (client-safe) with the focused SUPPORTED_LANGUAGES list (lg/sw/en/yo/ha/ig/am/rw/af/ak, code-switched flagged) — canonical source imported by both the server module and the UI.
- Updated /api/transcribe: now calls real Intron when INTRON_API_KEY is set (returns provider "sahara" + via "sync"|"async-poll"|"sync-503-then-poll"); transparently falls back to z-ai ASR when no key (provider "zai-asr", via "no-intron-key"|"fallback-after-intron-error"). Accepts a `language` form field (default "lg"). maxDuration raised to 120s to allow async polling.
- Updated /api/benchmark: the Sahara lane now calls the REAL Intron API. In benchmark mode there is NO silent fallback — if the key is missing the lane reports "INTRON_API_KEY not set — add it to .env to run the real Sahara lane" (success=false), and if it errors the real error is shown. Whisper/Gemini remain clearly-labelled simulated lanes. Added a `language` field (scenario-aware: s1→lg, s2→en, s3→sw, s4→en).
- Added a Speaking-language picker to the Report tab (default Luganda–English) and a Sahara-language picker to the Benchmark tab. The transcript badge now shows which provider actually ran (Sahara/Intron teal badge vs z-ai fallback amber badge) + the language + latency.
- Threaded the real provider through the save flow: /api/incidents POST now stores the actual provider on the Transcript record (sahara | zai-asr) and the audit detail reads e.g. "sahara (Intron) · 1450ms · lg".
- Updated the Convex migration (convex/actions/transcribe.ts) to match the real Intron API exactly: transcribeWithProvider + runBenchmark now accept a `language` arg; transcribeSahara() uses /file/v1/upload/sync with the 503/400→/file/v1/status/{file_id} poll fallback and INTRON_API_KEY/INTRON_BASE_URL env vars (SAHARA_* aliases kept). Added IntronStatusData type + pollIntronStatus() helper.
- Added INTRON_API_KEY + INTRON_BASE_URL to .env (empty key, set by the owner) and committed .env.example with all provider var names + deployment notes.

Stage Summary:
- The real Intron/Sahara STT is wired into both the live test instance (/api/transcribe + /api/benchmark) and the production Convex migration (convex/actions/transcribe.ts). The owner only needs to paste the organisers' API key into .env as INTRON_API_KEY=... and the Sahara lane goes live — no code changes.
- Verified: /api/transcribe with a silent WAV returns {provider:"zai-asr", via:"no-intron-key"} (fallback works); /api/benchmark no-audio run shows the Sahara lane as success=false with "No audio provided for the Sahara lane"; the Report + Benchmark language pickers render; lint clean; dev server running.
- Still NOT done (waiting on the user): real Whisper + Gemini API keys for those benchmark lanes (currently simulated, labelled); the 3 remaining docs the user will share; review/merge of the user's prior code files; streaming live-captions (WS) and the Intron QA endpoint are spec'd but not yet implemented (roadmap).

---
Task ID: R2
Agent: general-purpose (user codebase review)
Task: Review the user's prior SautiSafe codebase (complete_codebase.txt) and recommend what to merge.

Work Log:
- Read /home/z/my-project/worklog.md to understand the current SautiSafe architecture (Next.js 16 + Prisma + z-ai-web-dev-sdk test instance; full Report/Reports/Benchmark/About tabs; real Intron/Sahara STT wired in Task 13; Convex migration folder complete in /convex).
- Confirmed the current /home/z/my-project/src/ layout via LS (82 source files across lib/components/components/ui/components/tabs/app/app/api/hooks). Confirmed via Grep that src/ contains NO manifest, NO serviceWorker, NO beforeinstallprompt, NO indexedDB, NO navigator.onLine references — i.e. the current app has zero PWA surface and must build it from scratch.
- Confirmed /home/z/my-project/public/ contains only logo.svg + robots.txt (no manifest, no sw.js, no PWA icons).
- Confirmed /home/z/my-project/package.json has NO next-pwa / serwist / @ducanh2912 / workbox PWA dependency.
- Read /home/z/my-project/upload/complete_codebase.txt (19,752 lines, 99 files concatenated with `===== ~/sautisafe-main/<path> =====` separators). Listed all 99 file headers via grep.
- Identified the overall stack: the user's codebase is NOT a React+Vite+Convex PWA as the brief assumed — it is a Codex "site-creator-vinext-starter" template (Next.js 16.3.4 + Vite 8 via vinext 1.0.0-beta.5 + Cloudflare Workers via @cloudflare/vite-plugin 1.37 + wrangler 4.92 + Drizzle ORM 0.45 on D1 + convex 1.45 declared but unwired on the frontend + a 61-component shadcn/ui kit on the newer radix-ui umbrella/@base-ui/react/@shadcn/react registry layer + ChatGPT auth scaffolding + 8 vendored build scripts) with a single static SautiSafe demo page (app/page.tsx, 78 lines) bolted on top.
- Aggressively grepped the bundle for the categories the task brief called out:
  * PWA (manifest|serviceWorker|workbox|pwa|beforeinstallprompt|webmanifest): ZERO source matches — every "pwa"/"manifest" hit is inside pnpm-lock.yaml integrity hashes. app/layout.tsx exports only `metadata` (no `viewport`, no `themeColor`, no `manifest` link).
  * Offline (IndexedDB|localStorage|sessionStorage|draft|queue|offline|navigator.onLine|syncManager): ZERO source matches — the only "draft" hit is convex/reports.ts using "draft" as a status enum literal; no client-side persistence of any kind.
  * Audio capture (MediaRecorder|getUserMedia|AudioContext|encodeWav|pcm): ZERO source matches — the recorder on app/page.tsx (lines 161–171) is a setInterval timer; no real audio capture, no upload, no MIME selection.
  * Convex frontend (useConvex|ConvexProvider|ConvexReactClient): ZERO matches — the `convex` 1.45 dep is in package.json but no frontend provider wires it.
  * Mobile-first (bottomNav|h-14|safe-area|env(safe|viewport-fit|theme-color): only shadcn dropdown `inset` boolean props and radix Viewport components; NO bottom nav, NO safe-area insets, NO theme-color.
  * Safety domain (Sahara|Intron|whisper|gemini|transcrib|urgent|severity|hazard|extract|incident|follow-up|consent|retention|ethics): hits concentrated in convex/schema.ts (table shapes), convex/transcription.ts (the 3-provider transcribe action — thinner than the current convex, no Intron sync→503→poll path), and the hardcoded demo reports array in app/page.tsx. No safety.ts-equivalent, no urgent-keyword scan, no LLM extraction prompt, no follow-up mutation.
- Read in full: app/page.tsx (139–220), app/layout.tsx (110–136), app/globals.css (102–108), app/chatgpt-auth.ts (9–100), convex/reports.ts (8006–8047), convex/schema.ts (8050–8180), convex/transcription.ts (8183–8255), convex/transcriptionData.ts (8258–8265), db/index.ts (8268–8281), db/schema.ts (8284–8288), drizzle.config.ts (8299–8306), eslint.config.mjs (8309–8339), hooks/use-mobile.ts (8413–8432), lib/utils.ts (8435–8441), next.config.ts (8454–8461), package.json (8464–8534), vite.config.ts (19684–19713), components.json (7982–8003), cloudflare-env.d.ts (456–462), components/ui/attachment.tsx (816–845), components/ui/bubble.tsx (1298–1425), components/ui/empty.tsx (3931–4037).
- Compared the current src/app/layout.tsx (already has `export const viewport: Viewport = { themeColor, width: "device-width", initialScale: 1 }` at lines 49–56) and src/components/app-shell.tsx (sticky header with icon-only-on-mobile tabs, max-w-5xl center column, sticky footer with emergency-procedures safeguard) against the user's app/layout.tsx (no viewport export) and app/page.tsx (desktop sidebar that hides on mobile with no replacement nav).
- Wrote /home/z/my-project/docs/codebase-merge-review.md (the full findings doc, 6 sections + appendix: stack summary table, PWA-implementation analysis with verbatim grep results, mobile-first patterns analysis, prioritized merge table with 18 candidate features each scored yes/maybe/skip with file:line refs and rationale, explicit SKIP list, and a 16-step concrete merge plan ordered by priority with the PWA shell + offline draft queue + mobile bottom-nav as the top items).

Stage Summary:
- Stack finding: the user's codebase is a Codex site-creator-vinext-starter template (Next.js 16 + Vite/vinext + Cloudflare Workers + Drizzle D1 + Convex-declared-but-unwired + shadcn/ui on the newer radix-ui umbrella + ChatGPT auth + 8 build scripts) with a single static SautiSafe demo page (app/page.tsx, 78 lines, fake recorder) on top. It is NOT the React+Vite+Convex PWA the brief described.
- PWA finding: NONE. Zero manifest, zero service worker, zero install prompt, zero IndexedDB/localStorage draft queue, zero navigator.onLine usage, zero themeColor, zero viewport export, zero safe-area insets. The user's codebase contributes NOTHING to the PWA gap that the brief identifies as the highest priority. The current Next.js app must build its PWA from scratch.
- Merge recommendations (priority order):
  1. DO (current app, not from user codebase): add /public/manifest.webmanifest + /public/sw.js (network-first for nav, cache-first for /_next/static) + register-sw.ts with update-available toast + install-prompt.tsx with beforeinstallprompt handling. ~2–3h.
  2. DO (current app): add src/lib/drafts-store.ts using IndexedDB (not localStorage — audio Blobs exceed the 5MB quota) for offline draft queue; wire into report-tab.tsx so a failed /api/incidents POST writes a draft and an `online` event listener retries; add a "Offline drafts (N)" badge + Sheet in the Reports tab. ~2h. This is the single most defensible mobile-first feature for the demo.
  3. DO (current app): add a bottom navigation bar to src/components/app-shell.tsx for < sm (move the existing tab buttons into the sticky footer for mobile, grid-cols-4, min-h-[56px], pb-[env(safe-area-inset-bottom)]); add viewport-fit=cover to the existing viewport export. ~1h. Biggest mobile-first visual win.
  4. MAYBE (from user codebase, §4 #9): port components/ui/native-select.tsx:5616–5680 (pure CSS, ~65 lines, no radix-ui umbrella rewrite needed) to src/components/ui/native-select.tsx and swap the language Select on mobile to use the native OS picker sheet. ~30min. Genuine mobile UX improvement.
  5. MAYBE (from user codebase, §4 #7): port components/ui/empty.tsx:3931–4037 (pure CSS, ~100 lines) to src/components/ui/empty.tsx for nicer empty states in the Reports and Benchmark tabs. ~30min. Polish only.
  6. SKIP: app/page.tsx (static mock), app/chatgpt-auth.ts (needs upstream proxy), the entire vinext+Cloudflare+Drizzle platform layer (vite.config.ts, build/sites-vite-plugin.ts, db/*, drizzle/*, scripts/*, cloudflare-env.d.ts), the user's convex/ folder (current convex is a strict superset with real Intron sync→503→poll wiring the user's lacks), the vendored vendor/shadcn-tailwind-4.13.0.css, the 9,525-line pnpm-lock.yaml, and ~20 of the 24 extra shadcn/ui components (either redundant with what the current app already has, or non-portable without rewriting radix-ui umbrella imports).
  7. POST-DEADLINE (design patterns from user codebase, §4 #1+#2): for the production Convex migration, consider adopting the user's `benchmarkCases` table (convex/schema.ts:8136–8147) to replace the current hardcoded SAMPLE_SCENARIOS array in src/lib/safety.ts, and the `transcriptionRuns` table (convex/schema.ts:8090–8107) for cleaner multi-provider benchmarking decoupled from incidents. Document as a follow-up in convex/MIGRATION.md; do not implement now.
- Confirmed: wrote /home/z/my-project/docs/codebase-merge-review.md (full findings doc, 6 sections + appendix, prioritized 18-row merge table, 16-step concrete plan) and appended this entry to /home/z/my-project/worklog.md. Did NOT modify any SautiSafe source files (src/, convex/, prisma/), did NOT run the dev server / lint / build, did NOT install packages, did NOT set up any cron job.

---
Task ID: 15-21 (PWA + mobile-first + offline drafts + dataset declaration)
Agent: Z.ai Code (main orchestrator)
Task: Make SautiSafe a mobile-first installable PWA with an offline draft queue, review/merge the user's prior codebase, and add the dataset/provider declaration the organisers require.

Work Log:
- Reviewed the 3 remaining docs (tts-streaming, upload-text, index) via targeted grep — confirmed the STT spec in docs/intron-api-spec.md is complete (TTS WS + text QA + intro already covered); nothing STT-critical missed.
- Launched a research subagent (Task R2) to review the user's complete_codebase.txt (19,752 lines). Finding: it is NOT a real SautiSafe — it's a Codex "site-creator-vinext-starter" Cloudflare-Workers/Drizzle template with a single static mock app/page.tsx (fake setInterval recorder, hardcoded table, NO MediaRecorder/getUserMedia, NO manifest/service-worker/IndexedDB/offline, NO Convex wiring). Recommendation: build the PWA from scratch; port only 2 optional pure-CSS shadcn components (native-select, empty) as polish. Skipped the entire vinext/Cloudflare/Drizzle platform layer + the user's convex folder (current is a strict superset with real Intron sync→poll). Wrote docs/codebase-merge-review.md.
- Built the PWA from scratch:
  * /public/manifest.webmanifest (name/short_name/start_url/scope/display:standalone/orientation:portrait/theme_color:#0f7a73/background:#0b3b38 + 5 icons incl. maskable + 3 app shortcuts ?tab=report|reports|benchmark).
  * Generated icon PNGs (192/512/maskable-192/maskable-512/apple-touch-180) from a new maskable SVG via sharp.
  * /public/sw.js: network-first for navigations + GET /api/* reads (offline-readable last reports), cache-first for /_next/static + static assets, NEVER intercepts POST/PUT/PATCH /api/* (so the offline draft queue handles writes). precache shell, activate cleans old caches, message SKIP_WAITING for fast updates.
  * src/components/service-worker-register.tsx: prod-only registration + "SautiSafe updated — reload" toast on controllerchange.
  * src/components/install-prompt.tsx: beforeinstallprompt → header "Install" button; iOS Safari → manual "Add to Home Screen" sheet; hides when installed.
- Built the offline draft queue: src/lib/drafts-store.ts (IndexedDB; stores the audio Blob + full report; putDraft/getAllDrafts/deleteDraft/updateDraftStatus; retryDraft POSTs JSON to /api/incidents on success deletes; retryAllDrafts; useDraftCount hook + BroadcastChannel sync). Wired into report-tab saveMut.onError: ANY submit failure (offline/network/5xx) saves the complete report incl. audio Blob → toast "Saved offline" → switches to Reports tab. The app-shell auto-retries queued drafts on the `online` event + once on mount (recovery after refresh/closure).
- Built src/components/offline-drafts-button.tsx: header "Offline (N)" badge → Sheet listing drafts with per-draft Retry/Discard + "Retry all". Refreshes via the useDraftCount hook + notifyDraftsChanged.
- Mobile-first app-shell: rewrote src/components/app-shell.tsx — sticky header (brand + desktop nav hidden<sm + Install/Offline/ModeToggle + online/offline chip), a FIXED bottom nav for <sm (grid-cols-4, h-16, pb env(safe-area-inset-bottom), active=primary), main has pb-24 on mobile to clear the bottom nav, footer emergency-notice is hidden<sm (bottom nav is the mobile footer). Honours ?tab= for PWA shortcuts.
- viewport export: added viewportFit:"cover" + maximumScale:5; metadata.manifest + appleWebApp + icons[].
- Added /api/status (returns intron.configured + baseUrl + zaiAsr + pwa + offlineDrafts — never leaks the key) and a live ProviderStatus pill row in the About tab (Intron/z-ai/PWA/Offline-drafts, emerald when on / amber when not).
- Added a "Dataset & provider declaration" card to the About tab per the organisers' WhatsApp guidance (different datasets/providers allowed if declared): declares Intron (Sahara) as primary STT with lg/sw code-switched models, z-ai ASR as the transparent product-mode fallback, the small consented original benchmark sample (not the organisers' dataset), and that no external datasets are bundled.

Stage Summary:
- SautiSafe is now an installable, mobile-first PWA that works offline: workers can record a report, and if the submit fails or the device is offline the complete report (incl. audio) is queued in IndexedDB and auto-submits when connectivity returns. Bottom nav + safe-area insets give a proper mobile-first primary focus; the SW caches the shell + last reads offline and never swallows writes.
- Verified with agent-browser: page 200, SW registered (navigator.serviceWorker truthy), manifest/sw.js/icons all 200, /api/status returns intron.configured=false (waiting on the user's key), responsive classes confirmed (bottom nav display:none on desktop via sm:hidden, will show <640px), About tab renders the provider pills + dataset declaration.
- The user's codebase contributed nothing mergeable for the PWA (it had none); the current Next.js app remains the real implementation. Two optional pure-CSS component ports (native-select, empty) noted in docs/codebase-merge-review.md as polish, not yet done.
- Honoured: no cron job; mobile-first is now the primary focus; only mergeable items from the codebase review were considered.

---
Task ID: B
Agent: full-stack-developer (Whisper + Gemini providers)
Task: Wire real Whisper (OpenAI) + Gemini (gemini-3.8-flash) STT provider lanes.

Work Log:
- Read /home/z/my-project/worklog.md for full context (prior tasks: 2, 15-21, plus R2 research subagent).
- Read src/lib/intron.ts (the pattern to mirror: `isIntronConfigured()` guard, `transcribeWithIntron({audioBlob, fileName, language})` async fn, safe secret-stripped Errors via `safeText`, `Date.now()` latency, server-only by convention since only imported by route handlers).
- Read src/app/api/benchmark/route.ts (the orchestrator-owned file — DO NOT MODIFY; it currently uses `corruptTranscript` for whisper/gemini lanes, and the orchestrator will wire providers.ts in themselves to avoid conflicts).
- Read convex/actions/transcribe.ts (the convex mirror; it already calls real OpenAI + Gemini but defaults the Gemini model to "gemini-2.0-flash" — needs to become "gemini-3.8-flash").
- Read src/lib/types.ts to confirm `SpeechProvider` already includes "whisper" | "gemini" and `BenchmarkResult.latencyMs` is `number | null` so a real ProviderResult with `latencyMs: number` fits cleanly.
- Read .env.example (already documents the convex env vars in comments but no live OPENAI_API_KEY / GEMINI_API_KEY / GEMINI_MODEL entries at the top level).
- Created /home/z/my-project/src/lib/providers.ts (NEW, server-only by convention — process.env usage, no client import):
  * `ProviderResult` interface: `{ text: string; latencyMs: number; language?: string | null; wordCount?: number | null }`.
  * `ProviderTranscribeInput` interface: `{ audioBlob: Blob | Buffer; fileName: string; language?: string }`.
  * `isWhisperConfigured()` → `!!OPENAI_API_KEY && OPENAI_API_KEY.length > 8`.
  * `transcribeWithWhisper({audioBlob, fileName, language})`:
    - POST https://api.openai.com/v1/audio/transcriptions, `Authorization: Bearer OPENAI_API_KEY`, multipart `file` (the Blob, with fileName), `model="whisper-1"`, `response_format="verbose_json"`, optional `language` (ISO short code passed through — Whisper supports fewer African langs; we surface the OpenAI error safely if rejected).
    - Tolerates text/plain fallback (OpenAI has been known to ignore response_format). On JSON: pulls `text`/`transcript`, `language`/`lang`, and word count from the `words` array if present else from `text.trim().split(/\s+/)`.
    - Returns `{ text, latencyMs, language, wordCount }`. latencyMs via `Date.now()` around the actual HTTP call.
    - Throws safe, secret-stripped Errors: network errors wrapped, HTTP errors carry status + first 300 chars of body, `safeErr()` strips Bearer tokens, `api_key=` values, `sk-...` and `AIza...` Gemini key prefixes.
  * `isGeminiConfigured()` → `!!GEMINI_API_KEY && GEMINI_API_KEY.length > 8`.
  * `transcribeWithGemini({audioBlob, fileName, language})`:
    - Model: `process.env.GEMINI_MODEL || "gemini-3.8-flash"` (the owner's required exact model).
    - POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=GEMINI_API_KEY with body `{ contents: [{ parts: [{ text: "Transcribe this audio verbatim, preserving any code-switched English/technical terms exactly as spoken." }, { inline_data: { mime_type: <audio mime>, data: <base64> } }] }], generationConfig: { temperature: 0 } }`.
    - Audio base64-encoded exactly as specified: `Buffer.from(await audioBlob.arrayBuffer()).toString("base64")`. mime_type from `audioBlob.type` or default `audio/wav`.
    - Parses `candidates[0].content.parts[].text` joined (filtered for empty parts, joined with `\n`, trimmed).
    - Returns `{ text, latencyMs }`. Throws safe error if the model returns no transcript (surfaces `finishReason` when Gemini safety-blocked).
  * Helpers: `pickString`/`pickOptionalString`, `safeText` (300-char body slice), `safeErr` (regex-strips Bearer/api_key=/sk-/AIza prefixes, slices to 500 chars), minimal `GeminiResponse` type.
- Updated convex/actions/transcribe.ts — three edits, NO change to the Sahara/Intron branch:
  1. JSDoc on `transcribeWithProvider` (line ~66): "Model is GEMINI_MODEL or 'gemini-2.0-flash'" → "'gemini-3.8-flash'".
  2. JSDoc on `transcribeGemini` (line ~411): "Uses the gemini-2.0-flash model by default" → "Uses the gemini-3.8-flash model by default".
  3. The actual default (line ~426): `process.env.GEMINI_MODEL ?? "gemini-2.0-flash"` → `process.env.GEMINI_MODEL ?? "gemini-3.8-flash"`.
  The Whisper implementation in convex/actions/transcribe.ts already calls the real OpenAI API — left untouched. Sahara branch left untouched.
- Updated .env.example — added a new top-level block above the convex comment block:
    OPENAI_API_KEY=
    GEMINI_API_KEY=
    GEMINI_MODEL=gemini-3.8-flash
  Plus an added convex-env comment line `npx convex env set GEMINI_MODEL ... (default gemini-3.8-flash)` so the production deployment also documents the new default. All existing entries preserved.
- Ran `bun run lint` once at the end (exit code 0, no errors/warnings for the new file). Did not fix any unrelated pre-existing issues (there were none reported).

Stage Summary:
- Artifacts:
  * NEW: /home/z/my-project/src/lib/providers.ts — real Whisper + Gemini STT lanes mirroring src/lib/intron.ts; exports ProviderResult, ProviderTranscribeInput, isWhisperConfigured, transcribeWithWhisper, isGeminiConfigured, transcribeWithGemini, GEMINI_MODEL constant. Server-only by convention (process.env usage; only imported by route handlers).
  * UPDATED: /home/z/my-project/convex/actions/transcribe.ts — Gemini default model bumped from gemini-2.0-flash to gemini-3.8-flash (3 sites: 2 JSDoc + 1 code); Whisper + Sahara branches unchanged.
  * UPDATED: /home/z/my-project/.env.example — added OPENAI_API_KEY=, GEMINI_API_KEY=, GEMINI_MODEL=gemini-3.8-flash entries + a corresponding convex env comment line.
- Key decisions:
  * Gemini model default is "gemini-3.8-flash" everywhere (src/lib/providers.ts GEMINI_MODEL const, convex transcribeGemini default, .env.example GEMINI_MODEL value).
  * Whisper model is hardcoded "whisper-1" (per the spec — OpenAI's only generally-available Whisper model id).
  * ProviderResult is a small shared interface `{ text, latencyMs, language?, wordCount? }` so the orchestrator can wire it into /api/benchmark/route.ts without reshaping. Gemini returns just `{ text, latencyMs }` (language/wordCount are optional).
  * Safe error handling mirrors intron.ts: `safeText` (300-char body slice) for HTTP errors; `safeErr` regex-strips Bearer tokens, api_key= values, sk-... prefixes, AND Gemini's AIza... key prefix (extra caution since the Gemini key is in the URL query and could theoretically be echoed by an upstream proxy).
  * No `server-only` package import (not in package.json); matched intron.ts convention (process.env usage + comment + only imported by route handlers).
  * Did NOT touch /api/benchmark/route.ts (orchestrator will wire providers.ts in themselves to avoid conflicts), .env (gitignored), src/lib/intron.ts, the report/benchmark tab components, the auth files, or prisma/. Did NOT run dev/build/db:push. Did NOT set up any cron job. Did NOT write tests.
- Verified: `bun run lint` passes (exit 0) for the new src/lib/providers.ts file.

---
Task ID: 23-26 (real Whisper/Gemini lanes + native select + in-Zcloud auth gate)
Agent: Z.ai Code (main orchestrator)
Task: Wire real Whisper (OpenAI) + Gemini (gemini-3.8-flash) benchmark lanes, swap language pickers to a native OS <select>, and gate the platform behind an in-Zcloud email+OTP login (no external auth provider).

Work Log:
- Delegated Task B (provider functions) to a full-stack subagent: it created src/lib/providers.ts (isWhisperConfigured/transcribeWithWhisper → OpenAI /v1/audio/transcriptions verbose_json; isGeminiConfigured/transcribeWithGemini → generativelanguage generateContent with inline_data base64 audio, model GEMINI_MODEL||"gemini-3.8-flash", temperature 0; safe secret-stripped errors), updated convex/actions/transcribe.ts (Gemini default model → gemini-3.8-flash at 3 sites), and added OPENAI_API_KEY/GEMINI_API_KEY/GEMINI_MODEL to .env.example. Lint clean.
- Wired providers into /api/benchmark/route.ts: replaced the simulated corruptTranscript lanes with REAL Whisper + Gemini calls (when their keys are set; else honest "not configured" emptyLane — no silent fallback in benchmark mode). Removed the now-unused corruptTranscript helper. Updated the Benchmark tab description to list all three real lanes + their env vars.
- Updated .env (gitignored) with all key slots: INTRON_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY=, GEMINI_MODEL=gemini-3.8-flash, + a generated AUTH_SECRET + DEMO_OTP_VISIBLE=true.
- Built the native OS <select>: src/components/ui/native-select.tsx (a styled native <select> that opens the OS picker sheet on mobile; appearance-none with a chevron). Swapped the Report-tab "Speaking language" and Benchmark-tab "Sahara language" pickers to it (Radix Select kept for the desktop-only scenario/decision selects).
- Built the in-Zcloud auth gate (no external provider — everything stays in the Z cloud):
  * prisma/schema.prisma: added User {id,email(unique),phone?,name?,role,createdAt,lastLoginAt} + OtpCode {id,identifier,codeHash,expiresAt,consumedAt?,attempts} (index on identifier,createdAt). db:push'd + generated.
  * src/lib/auth.ts: stateless signed session cookie (HMAC-SHA256 with AUTH_SECRET, base64url payload.mac, 7-day maxAge, httpOnly+sameSite-lax+secure-in-prod); requestOtp (6-digit, sha256-hashed at rest, 5-min expiry, invalidates prior codes); verifyOtp (single-use, ≤5 attempts, upserts User, sets cookie); getSession (verifies cookie); clearSessionCookie; requireSession+UnauthorizedError; isDemoOtpVisible.
  * API routes: /api/auth/request-otp (returns the code in demo mode since no email gateway exists in the z-ai SDK), /api/auth/verify-otp (verifies + sets cookie), /api/auth/logout (clears cookie), /api/auth/me.
  * src/components/login-gate.tsx (client): mobile-first 2-step flow — email/phone → "Send code" → demo-OTP banner (amber, with the code) → 6-digit input → "Sign in" → reload to the app.
  * src/app/page.tsx → server component: getSession() → renders <LoginGate/> if no session else <AppShell/>.
  * Gated every data route behind requireSession (incidents GET+POST, incidents/[id] GET+PATCH, transcribe POST, extract POST, benchmark GET+POST) → 401 UnauthorizedError; left /api/status + /api/auth/* open.
  * src/components/user-menu.tsx: header dropdown showing the signed-in email + role + "Sign out" (POST /api/auth/logout → reload). Added to the app-shell header.

Stage Summary:
- Verified end-to-end with curl + agent-browser: page renders the LoginGate when unauthenticated; /api/incidents returns 401 without a cookie; request-otp returns {ok, deliveredBy:"screen (demo)", demoOtp}; verify-otp sets the cookie + returns the user; /api/incidents returns 200 with the cookie; wrong code → 400 "Wrong code." (so the UI shows the message). In the browser: entered email → demo OTP shown (e.g. 537237) → entered it → signed in → app rendered with the Report tab + UserMenu.
- All three benchmark lanes are now real (Sahara/Intron, Whisper/OpenAI, Gemini/gemini-3.8-flash) when their keys are set; missing keys show honest "not configured". Language pickers open the native OS sheet on mobile.
- Everything — auth, STT, extraction, PWA, offline drafts — stays in the Z cloud; no external auth provider, no email gateway dependency.
- Honoured: no cron job; mobile-first primary focus; only mergeable items from the codebase review were considered (the user's prior codebase had nothing PWA to merge).
- Open: the owner pastes INTRON_API_KEY + GEMINI_API_KEY (+ optional OPENAI_API_KEY) into .env; with those set, the About-tab provider pills flip to emerald and every transcription + benchmark lane hits the real APIs.

---
Task ID: 27 (strip auth gate + load live keys)
Agent: Z.ai Code (main orchestrator)
Task: The login gate redirected back to the login page after sign-in (cookie not surviving the preview/Caddy redirect), and the user wants the auth feature stripped (no email gateway in the z-ai SDK). Strip the gate, write the live Intron + Gemini keys to .env, and answer the gating/Clerk/published-link questions.

Work Log:
- Wrote the user's INTRON_API_KEY + GEMINI_API_KEY to .env (gitignored; never committed) via sed. OPENAI_API_KEY left empty (not provided).
- Stripped the in-Zcloud OTP auth gate entirely:
  * src/app/page.tsx → server component that renders <AppShell/> directly (no getSession check).
  * Removed `await requireSession()` + the UnauthorizedError→401 catch + the auth import from all 6 data routes (incidents GET/POST, incidents/[id] GET/PATCH, transcribe POST, extract POST, benchmark GET/POST) — they're now open as before.
  * Removed the UserMenu from the app-shell header + its import.
  * Deleted src/components/login-gate.tsx, src/components/user-menu.tsx, src/lib/auth.ts, and the src/app/api/auth/* routes (request-otp/verify-otp/logout/me).
  * Removed the User + OtpCode models from prisma/schema.prisma + db:push (dropped the empty tables) + db:generate.
- Extended /api/status to report whisper.configured + gemini.configured + the gemini model, and updated the About-tab ProviderStatus pills to show all three real providers (Intron/Whisper/Gemini) + z-ai + PWA + offline.
- Removed the auth (AUTH_SECRET/DEMO_OTP_VISIBLE) section from .env.example (references removed code).
- Restarted the dev server to load the new .env keys + stripped code.

Stage Summary:
- The app now opens STRAIGHT to the Report tab — no login gate, no broken redirect. Verified with curl (page renders "Consent &/Speaking language") + agent-browser.
- Real API keys are LIVE: /api/status returns intron.configured=true, gemini.configured=true, whisper.configured=false. A real transcribe call (silent WAV) returned {provider:"sahara", via:"sync", latencyMs:10691, durationSec:1} — the real Intron sync endpoint ran end-to-end (~10.7s). The About-tab pills show Intron/Gemini green, Whisper amber.
- The auth gate is fully removed (code + schema + routes). If the owner later wants gating on the Vercel deployment, Clerk is the clean choice (orthogonal to the stripped OTP infra). No cron job configured.

---
Task ID: 28 (mobile UI polish — 4 screenshot fixes)
Agent: Z.ai Code (main orchestrator)
Task: Fix 4 mobile layout issues the owner reported via screenshots: (1) Discard button clipped on the audio player, (2) Reports queue rows don't look tappable / supervisor can't tell how to review, (3) Run-benchmark button sits beside the warning text instead of below it, (4) review drawer's Follow-up Q&A + Save-review are clipped and not scrollable.

Work Log:
- Used the VLM skill (z-ai vision CLI) to analyse all 4 mobile screenshots and confirm exactly what was broken: (1) Discard button clipped at the right edge of the captured-audio card (long filename pushes it off); (2) Reports queue rows didn't look tappable; (3) Run-benchmark button beside the warning text; (4) review drawer's Follow-up Q&A clipped at the bottom, ScrollArea not scrolling.
- Fix 1 (AudioRecorder captured card): made the filename `truncate` inside a `min-w-0 flex-1` wrapper, the Discard button `shrink-0`, and hid the "Discard" label on mobile (icon-only `<sm`, full "Discard" `sm:inline`) so the button always fits.
- Fix 2 (Reports queue rows): rewrote the list row as a clear tappable item — `flex items-center gap-3`, info `min-w-0 flex-1`, badges + a `ChevronRight` affordance on the right, and a `sm:hidden` "Tap to review →" hint in primary colour so mobile users know to tap. Added ChevronRight to the lucide imports.
- Fix 3 (Benchmark run row): changed the warning+button container from `flex items-center justify-between` to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`, and made the Run-benchmark button `w-full sm:w-auto shrink-0` so on mobile the warning text stacks ABOVE the button.
- Fix 4 (review drawer + offline-drafts sheet scroll): the root cause was a Radix `ScrollArea` with `flex-1` but no `min-h-0` — flex items default to `min-height:auto` so the ScrollArea grew to content height instead of scrolling. Added `min-h-0` to both ScrollAreas, and bounded the SheetContent height (`h-full ... sm:max-h-[90vh]`) so the flex-1 scroll area has a real bound to scroll within. Now the Follow-up Q&A, audit trail, supervisor-review form, and Save-review button are all reachable by scrolling on mobile.
- Verified: lint clean; dev server restarted; page loads to the Report tab; Reports rows render with the chevron + "Tap to review" hint (hint is sm:hidden so only on mobile); opening a report drawer shows ALL sections in the DOM (TRANSCRIPT → STRUCTURED REPORT → FOLLOW-UP Q&A → TRANSCRIPTS → AUDIT TRAIL → Supervisor review → Save review/Export) — the min-h-0 fix makes them scroll-reachable on phone-width viewports.

Stage Summary:
- All 4 mobile issues fixed with standard responsive patterns (truncate+shrink-0, chevron+hint affordance, flex-col→sm:flex-row stack, min-h-0 on flex-1 ScrollArea). The app stays mobile-first. No cron job.

---
Task ID: 29 (benchmark our own report + audio persistence)
Agent: Z.ai Code (main orchestrator)
Task: Allow running the multi-model benchmark on an actual incident report (real results), which required persisting the report's audio so all three providers can re-transcribe it.

Work Log:
- Added `audioStoragePath` to the Incident Prisma model + db:push. Created db/uploads/ (gitignored) for persisted audio (production uses Convex file storage).
- src/lib/audio-storage.ts (server): saveAudio(bytes, {mimeType,fileName}) → writes to db/uploads/<uuid>.<ext>, returns the storage id; loadAudio(path) → Buffer (with path-traversal guard); deleteAudio(path). 
- /api/transcribe: now persists the received audio via saveAudio + returns `audioRef` in the response (alongside the transcript). The report flow stores audioRef on the draft → sends it to /api/incidents, which stores it as audioStoragePath. Threaded audioStoragePath through the store, the report-tab save + onError offline-draft path, and the offline-draft retry body.
- src/lib/benchmark-runner.ts (server, shared): runBenchmarkLanes({audioBlob, fileName, language, referenceTranscript}) runs all three REAL providers (Sahara/Intron, Whisper/OpenAI, Gemini/gemini-3.8-flash) with NO silent fallback (missing key → honest "not configured" lane; call error → real error lane), computes WER/CER/critical-term-recall per lane + aggregate. languageForBenchmark() maps the incident's detectedLanguage back to an Intron code.
- Refactored /api/benchmark to use runBenchmarkLanes (removed ~60 lines of inline lane duplication; behaviour unchanged: file validation + scenario language mapping stay, the lane-running is delegated to the helper).
- NEW /api/incidents/[id]/benchmark POST: loads the incident's persisted audio + transcript (the reference), runs runBenchmarkLanes, saves Whisper+Gemini as non-primary Transcript rows on the incident (Sahara keeps its primary; prior benchmark transcripts for whisper/gemini are deleted so re-running doesn't duplicate), creates a BenchmarkRun, audits "benchmarked", returns the lane results + aggregate + language. Returns 404 if no audio is persisted (older reports recorded before this shipped) and 400 if there's no transcript to use as the reference.
- Extended PATCH /api/incidents/[id] to accept `rawTranscript` so the supervisor can correct the transcript into a verified reference (audited as "transcript_verified" when it changes).
- Review drawer: replaced the read-only transcript with an EditableTranscript component — an "Edit transcript" toggle (textarea + "Save as verified reference" → PATCH rawTranscript) and a "Benchmark this report" button that calls the new route + renders a compact BenchmarkResults table (provider/WER/CER/Recall/Latency + aggregate). Disabled with an explanation when no audio is persisted.

Stage Summary:
- Verified end-to-end with curl: transcribe returns audioRef (audio persisted to db/uploads/<uuid>.wav); creating an incident with audioStoragePath stores it; POST /api/incidents/[id]/benchmark loads the persisted audio + runs all 3 real providers → returns {runId, referenceNo, results, aggregateMetrics, language}. With the live Intron key the Sahara lane ran (WER computed vs the reference); Whisper showed the honest "OPENAI_API_KEY not set" lane; Gemini returned a REAL API error: "User location is not supported for the API use" (HTTP 400) — the Gemini key is VALID, the Gemini API geo-blocks this sandbox's region (it will work on Vercel in a supported region). No silent fallback — every lane surfaces its real result.
- agent-browser confirms the review drawer shows the "Edit transcript" + "Benchmark this report" controls + the verified-reference tip.
- lint clean; dev server restarted (new Prisma client). No cron job.
- Open: the Gemini lane geo-blocks the sandbox region (valid key, region not supported) — will resolve on a Vercel deployment in a supported region. Whisper lane stays "not configured" until an OPENAI_API_KEY is added.

---
Task ID: 30 (OpenAI key + benchmark history border fix)
Agent: Z.ai Code (main orchestrator)
Task: Add the owner's OpenAI key + fix the Benchmark history bottom border clipping the last history item.

Work Log:
- Wrote the owner's OPENAI_API_KEY to .env (gitignored). /api/status now reports whisper.configured=true; all three providers (Intron, Whisper, Gemini) show "configured" in the About-tab pills.
- Analysed the attached screenshot with the VLM skill (z-ai vision): the Benchmark history's last item was clipped at the bottom by the card border — the Radix ScrollArea with `max-h-72` was clipping content without scrolling (its Viewport renders at content height while the root caps height, so content is cut, not scrollable).
- Fix: replaced the Radix <ScrollArea> in BenchmarkHistory with a reliable plain <div className="scroll-thin max-h-80 overflow-y-auto pr-1"> + <ul className="space-y-2">. Native overflow-y-auto scrolls its own content correctly in a max-height container. Removed the now-unused ScrollArea import. Bumped the cap from max-h-72 to max-h-80 for a touch more room.
- Verified: lint clean; dev server restarted (new .env); /api/status → intron/whisper/gemini all configured; agent-browser confirms the Benchmark history now renders multiple runs (SSA-2026-0005, SSA-2026-0003) without the bottom clip.

Stage Summary:
- IMPORTANT FINDING: the OpenAI key is VALID (auth accepted) but the Whisper API geo-restricts this sandbox region — HTTP 403 "unsupported_country_region_territory". Gemini shows the same (HTTP 400 "User location is not supported for the API use"). So in THIS Zcloud sandbox only the Intron (Sahara) API actually completes a transcription; Whisper + Gemini authenticate but refuse to serve the region. On a Vercel deployment in a supported (US/global) region, all three should work. The benchmark lanes surface these errors honestly (no silent fallback). The benchmark-on-report + standalone benchmark flows both use the shared runner, so they behave identically.
- Benchmark history bottom-border clip is fixed.
- No cron job.
