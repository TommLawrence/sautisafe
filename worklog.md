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
