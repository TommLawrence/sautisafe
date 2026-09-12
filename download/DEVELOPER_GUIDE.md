# SautiSafe - Developer Guide

> Audience: the project owner and any engineer who picks up the codebase after
> the competition. This is the deep technical reference. For a shorter,
> judge-facing summary, see `SUBMISSION_FOR_JUDGES.md` in the same folder.

---

## 1. Overview

SautiSafe is a code-switched voice reporting assistant for industrial safety
incidents and near misses. A worker records a voice note that mixes English
with Luganda or Swahili; the app transcribes it, extracts a structured safety
report (location, equipment, hazard, people affected, immediate action,
injury status, severity, urgency tags), asks at most two focused follow-up
questions for missing high-priority fields, flags urgent risks for immediate
supervisor review, and produces an audited, exportable report. On top of the
reporting flow, SautiSafe runs a multi-model speech benchmark that compares
the real Intron/Sahara STT, OpenAI Whisper, and Google Gemini
(`gemini-3.8-flash`) on either standalone audio samples or on real incident
audio, computing WER, CER, and critical-term recall.

There are two deployment targets in this repository:

- **Live test instance** (this Next.js app, running in the Z cloud): Next.js
  16 + Prisma 6 on SQLite + `z-ai-web-dev-sdk` for the LLM and the
  transparent product-mode ASR fallback. All API routes live under
  `src/app/api/*`. Audio is persisted to `db/uploads/` on local disk so the
  per-report benchmark can re-transcribe it. This is what the judges interact
  with.
- **Production backend** (the `convex/` folder, ready to deploy on
  Vercel + Convex): a 1:1 mirror of the live instance's schema and route
  semantics, written as Convex tables, mutations, queries, and actions.
  Audio is stored in Convex file storage. The owner flips the frontend over
  to Convex hooks when they are ready; nothing in the live app needs to be
  re-implemented. See `convex/MIGRATION.md`.

**Stack summary:**

| Layer | Live test instance | Production (Convex) |
|---|---|---|
| Frontend | Next.js 16 (App Router) + React + TanStack Query + Zustand + shadcn/ui + Tailwind 4 | Same Next.js frontend; swap `fetch("/api/*")` for `useQuery` / `useMutation` / `useAction` |
| Backend | Next.js Route Handlers (`src/app/api/*`) | Convex mutations / queries / actions (`convex/*.ts`) |
| Database | Prisma 6 on SQLite (`db/custom.db`) | Convex tables (`convex/schema.ts`) |
| LLM | `z-ai-web-dev-sdk` chat completions (`src/lib/zai.ts`) | OpenAI-compatible `LLM_API_BASE` + `LLM_API_KEY` (`convex/actions/extract.ts`) |
| Primary STT | Real Intron/Sahara (`src/lib/intron.ts`) | Real Intron/Sahara (`convex/actions/transcribe.ts`) |
| Fallback STT | z-ai ASR proxy (product mode only) | n/a - production runs the real providers |
| Audio storage | Local disk (`db/uploads/`) | Convex file storage (`convex/audio.ts`) |
| PWA | `public/manifest.webmanifest` + `public/sw.js` + IndexedDB drafts (`src/lib/drafts-store.ts`) | Same PWA shell; the frontend is unchanged |

Secrets (API keys for Intron, OpenAI, Gemini, the LLM) live in **server-side
environment variables only**. They are read at call time in server modules
(`src/lib/intron.ts`, `src/lib/providers.ts`, `src/lib/zai.ts`) and Convex
actions, never in browser-bundled code. The `/api/status` route exposes only
boolean `configured` flags and the public Intron base URL, never a key.

### 1.1 Glossary (abbreviations)

| Abbreviation | Meaning |
|---|---|
| **ASR** | Automatic Speech Recognition - converting spoken audio into text (speech-to-text). |
| **STT** | Speech-To-Text - same as ASR. |
| **TTS** | Text-To-Speech - converting text into spoken audio (the reverse of ASR). |
| **LLM** | Large Language Model - the model that extracts structured safety fields from a transcript. |
| **WER** | Word Error Rate - the fraction of words a transcription got wrong vs a reference (0 = perfect, 1 = all wrong). |
| **CER** | Character Error Rate - like WER but at the character level; useful for code-switched text where "words" are ambiguous. |
| **Critical-term recall** | The fraction of safety-critical words (pressure, valve, reactor, HCl, electrocution, etc.) that survive in a transcription. |
| **PWA** | Progressive Web App - an installable, offline-capable web app (manifest + service worker). |
| **API** | Application Programming Interface - how the frontend talks to the backend over HTTP. |
| **MIME** | The type label of a file (e.g. `audio/wav`); used to validate uploaded audio. |
| **HMAC** | Hash-based Message Authentication Code - how the (removed) session cookie was signed. |
| **OTP** | One-Time Password - the single-use login code (the login gate was stripped for the demo). |
| **IndexedDB** | A browser database; used to queue offline report drafts (with their audio Blob) until reconnect. |
| **PCM** | Pulse-Code Modulation - the raw digital-audio format; streaming STT sends base64 PCM16 chunks. |
| **dB / latency** | Latency is measured in milliseconds (ms) around each provider call for fair benchmarking. |
| **Sahara** | The competition's required speech model; SautiSafe calls it via the Intron Voice API. |
| **Code-switching** | Mixing languages mid-sentence (e.g. English + Luganda); Intron ships dedicated bilingual models for this. |

---

## 2. Architecture

```
+-----------------------------+
|  Browser (PWA shell)        |
|  - Report / Reports /       |
|    Benchmark / About tabs   |
|  - MediaRecorder + WAV      |
|    encode (src/lib/         |
|    audio-utils.ts)          |
|  - IndexedDB draft queue    |
|    (src/lib/drafts-store.ts)|
|  - Service worker           |
|    (public/sw.js)           |
+--------------+--------------+
               |
               | fetch /api/*
               v
+---------------------------------+
|  Next.js Route Handlers         |
|  (src/app/api/*)                |
|  - /api/transcribe              |
|  - /api/extract                 |
|  - /api/incidents (+ [id] +     |
|    [id]/benchmark)              |
|  - /api/benchmark               |
|  - /api/status                  |
+----+-----------+-----------+----+
     |           |           |
     v           v           v
+----+---+  +----+----+  +---+----+
| Intron |  |  z-ai   |  | Prisma |
| (Sahara|  |   SDK   |  | SQLite |
|  STT)  |  |  ASR +  |  | (db/)  |
|        |  |   LLM   |  |        |
+-------+  +---------+  +---+----+
                              |
                              v
                      +-------+-------+
                      | db/uploads/    |
                      | (persisted     |
                      |  audio blobs)  |
                      +----------------+
```

The `convex/` folder mirrors every box on the right-hand side as Convex
tables, mutations, queries, and actions. The frontend swap is mechanical:
each `fetch("/api/...")` becomes a `useQuery(api.x.y, args)` or
`useMutation(api.x.y, args)` / `useAction(api.actions.x.y, args)` hook.

The PWA layer adds:

- `public/manifest.webmanifest` - installable, standalone display, portrait
  orientation, theme/background colors, five icons (including maskable), and
  three app shortcuts (`?tab=report`, `?tab=reports`, `?tab=benchmark`).
- `public/sw.js` - network-first for navigations and `GET /api/*` reads,
  cache-first for hashed static assets, **never** intercepts `POST`/`PUT`/
  `PATCH /api/*` (so writes flow to the IndexedDB queue when offline).
- `src/lib/drafts-store.ts` - IndexedDB-backed queue of full report drafts
  (including the recorded audio `Blob`) that auto-retries on reconnect.
- `src/components/app-shell.tsx` - sticky header with desktop nav, a fixed
  bottom nav on small screens (with `env(safe-area-inset-bottom)` padding),
  and an offline/online chip plus an "Offline (N)" drafts badge.

---

## 3. Data Model

The Prisma schema (`prisma/schema.prisma`) is the source of truth. The Convex
schema (`convex/schema.ts`) mirrors it 1:1 with Convex validators. Six models:

### Worker
A person who reports or is involved in an incident. Names are intentionally
optional to support anonymous reporting.

| Field | Type | Purpose |
|---|---|---|
| `id` | String (cuid, PK) | Primary key |
| `identifier` | String? | Staff/employee code, optional |
| `displayName` | String? | Optional display name |
| `role` | String? | e.g. "Operator", "Supervisor", "Contractor" |
| `department` | String? | e.g. "Boiler House", "Logistics" |
| `createdAt` | DateTime | Creation timestamp |
| `incidents` | Incident[] | One-to-many relation |

### Incident
The heart of SautiSafe. Created from a voice report, enriched by the
extraction pipeline, clarified by follow-ups, and reviewed by a supervisor.

| Field | Type | Purpose |
|---|---|---|
| `id` | String (cuid, PK) | Primary key |
| `referenceNo` | String (unique) | Human-friendly, e.g. `SSA-2026-0001` |
| `workerId` | String? | FK to Worker (optional for anonymous reports) |
| `audioFileName` | String? | Original filename of the recording |
| `audioMimeType` | String? | MIME type of the recording |
| `audioSizeBytes` | Int? | Size of the original recording |
| `audioDurationSec` | Int? | Duration in seconds |
| `audioStoragePath` | String? | Server-side path/id of the persisted audio blob (for re-transcription / benchmark) |
| `rawTranscript` | String? | Primary/final transcript (the verified reference) |
| `location` | String? | Where it happened |
| `equipment` | String? | Equipment/asset involved |
| `hazard` | String? | What the hazard/incident was |
| `peopleAffected` | String? | Who was affected/at risk |
| `immediateAction` | String? | What was done immediately |
| `injuryStatus` | String? | `none` / `minor` / `serious` / `unknown` |
| `severity` | String? | `low` / `medium` / `high` / `critical` |
| `occurredAt` | DateTime? | When it happened (parsed from speech or set manually) |
| `status` | String (default `"draft"`) | `draft` / `extracted` / `review` / `submitted` / `escalated` / `resolved` |
| `isUrgent` | Boolean (default false) | True when any urgent tag is set |
| `urgencyTags` | String? | JSON array, e.g. `["fire","chemical"]` |
| `consentGiven` | Boolean (default false) | Worker consented to audio storage |
| `detectedLanguage` | String? | e.g. `eng+lug`, `swa+eng`, `eng` |
| `supervisorNotes` | String? | Reviewer notes |
| `reviewedBy` | String? | Reviewer identifier |
| `reviewedAt` | DateTime? | Review timestamp |
| `followUps` | FollowUp[] | One-to-many |
| `transcripts` | Transcript[] | One-to-many (primary + benchmark lanes) |
| `auditEvents` | AuditEvent[] | One-to-many |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

The `audioStoragePath` field was added in Task 29 so the per-report benchmark
can re-transcribe the original audio with all three providers. Reports
recorded before that field shipped cannot be benchmarked (the route returns a
clear 404 explaining this).

### FollowUp
A follow-up question the system asked to fill missing information, and the
worker's answer.

| Field | Type | Purpose |
|---|---|---|
| `id` | String (cuid, PK) | Primary key |
| `incidentId` | String | FK to Incident (cascade delete) |
| `field` | String? | Which structured field this addresses, e.g. `"location"` |
| `question` | String | The follow-up question text |
| `answer` | String? | The worker's answer |
| `askedAt` | DateTime | When the question was generated |
| `answeredAt` | DateTime? | When the worker answered |

### Transcript
One transcription of an incident's audio by a given provider. An incident
may have several (one per speech model) when benchmarking.

| Field | Type | Purpose |
|---|---|---|
| `id` | String (cuid, PK) | Primary key |
| `incidentId` | String | FK to Incident (cascade delete) |
| `provider` | String | `"sahara"` / `"whisper"` / `"gemini"` / `"zai-asr"` |
| `text` | String | The transcript text |
| `language` | String? | Language code |
| `durationMs` | Int? | Audio duration reported by the provider |
| `latencyMs` | Int? | Wall-clock latency of the provider call |
| `wordCount` | Int? | Word count of the transcript |
| `confidence` | Float? | Provider-reported confidence if available |
| `isPrimary` | Boolean (default false) | True for the transcript used as the reference |
| `createdAt` | DateTime | Creation timestamp |

The primary transcript is the one chosen by the report flow (Sahara when the
key is set, otherwise z-ai ASR). Whisper and Gemini transcripts are written by
the per-report benchmark route as non-primary rows.

### BenchmarkRun
A benchmark run compares multiple speech models on the same audio + reference
transcript, computing accuracy metrics.

| Field | Type | Purpose |
|---|---|---|
| `id` | String (cuid, PK) | Primary key |
| `referenceNo` | String | Human-friendly run id, e.g. `SSA-2026-0001` |
| `scenario` | String? | Human label, e.g. "Heavy code-switch, noisy background" |
| `audioFileName` | String? | Audio file used |
| `referenceTranscript` | String | The verified reference transcript |
| `resultsJson` | String | JSON array of per-lane results (provider, text, WER, CER, recall, latency, etc.) |
| `aggregateMetrics` | String? | JSON: `avgWer`, `avgCer`, `avgCriticalTermRecall`, `avgLatencyMs` |
| `createdAt` | DateTime | Creation timestamp |

Convex has no native JSON column type, so `resultsJson` and
`aggregateMetrics` are stored as stringified JSON.

### AuditEvent
Append-only audit trail for every meaningful action on an incident.

| Field | Type | Purpose |
|---|---|---|
| `id` | String (cuid, PK) | Primary key |
| `incidentId` | String | FK to Incident (cascade delete) |
| `action` | String | e.g. `recorded`, `transcribed`, `extracted`, `escalated`, `reviewed`, `transcript_verified`, `benchmarked` |
| `actor` | String? | Who performed the action |
| `detail` | String? | Free-text detail (provider, latency, language, etc.) |
| `createdAt` | DateTime | Creation timestamp |

---

## 4. Request Handling and Data Flows

Every route below has a Convex mirror. The mapping table in
`convex/MIGRATION.md` (section 2) is the authoritative cross-reference.

### POST `/api/transcribe` - mirrors `actions/transcribe.transcribeWithProvider`

- **Inputs:** `multipart/form-data` with `audio` (File), optional `mimeType`,
  optional `language` (defaults to `"lg"` for Luganda-English).
- **Validation:** rejects empty audio (400), oversize audio (413, 25 MB cap),
  unsupported MIME type (415, allow-list in `src/lib/audio-utils.ts`).
- **Side effects:** persists the audio bytes to `db/uploads/<uuid>.<ext>` via
  `src/lib/audio-storage.ts` and returns the storage id as `audioRef`.
- **Provider selection:**
  1. If `INTRON_API_KEY` is set (`isIntronConfigured()`), call the real
     Intron/Sahara sync STT endpoint. On 503 (sync timeout) it polls the
     async status endpoint for the returned `file_id`; on 400 (audio too
     long for sync) it re-uploads via the async endpoint and polls. The
     `via` field reports `"sync"` / `"async-poll"` / `"sync-503-then-poll"`.
  2. On Intron failure or missing key, **in product mode** it transparently
     falls back to the z-ai ASR proxy (`src/lib/zai.ts`) and tags the
     response `provider: "zai-asr"`, `via: "no-intron-key"` or
     `"fallback-after-intron-error"` so the supervisor knows the Sahara lane
     did not run. (Benchmark mode never falls back - see section 7.)
- **Output:** `{ text, latencyMs, durationSec?, provider, via, language,
  audioRef, wordCount }`.
- **Audit:** none directly (the audit events are written by
  `/api/incidents` POST when the report is saved).

### POST `/api/extract` - mirrors `actions/extract.extractSafetyFields`

- **Inputs:** JSON `{ transcript: string }`.
- **What it does:** runs the LLM (`chatJson` from `src/lib/zai.ts`) with a
  safety-aware system prompt that:
  - never declares equipment "safe" or "all clear",
  - never diagnoses a technical fault or recommends a repair,
  - never replaces or triggers an emergency procedure,
  - leaves unknown fields null and lists them in `missingFields`,
  - asks at most 2 focused follow-up questions,
  - respects negation ("no one was injured" must NOT add the `injury` tag),
  - only sets `occurredAt` when a specific date or day is mentioned,
  - draws `urgentTags` only from the fixed vocabulary in
    `src/lib/safety.ts`.
- **Backstops (applied after the LLM returns):**
  - **Additive urgency scan:** `detectUrgentTags(transcript)` unions any
    vocabulary keywords the LLM missed into the tag set. It is purely
    additive - it never removes a flag (a false alarm is safer than a missed
    urgent risk for a safety tool).
  - **High-precision injury-negation:** `applyInjuryNegation` drops the
    `injury` tag only when the transcript clearly states nobody was hurt
    ("no one was injured", "nobody hurt", "no injuries", etc.). The negation
    pass only touches the `injury` tag, never other tags.
- **Output:** the `ExtractedFields` shape: `location`, `equipment`,
  `hazard`, `peopleAffected`, `immediateAction`, `injuryStatus`, `severity`,
  `occurredAt`, `detectedLanguage`, `urgentTags`, `missingFields`,
  `followUpQuestions` (capped at 2).

### GET `/api/incidents` - mirrors `incidents.listIncidents`

- **Query params:** `status`, `urgent=true`, `q` (free text search across
  `referenceNo`, `location`, `equipment`, `hazard`, `rawTranscript`).
- **Output:** `{ incidents: Incident[] }` (most recent first, capped at 200,
  with the `worker` relation included). The list endpoint does not include
  follow-ups, transcripts, or audit events - those are fetched by the detail
  route.

### POST `/api/incidents` - mirrors `incidents.createIncident`

- **Inputs:** JSON body with the finalised report: `audioFileName`,
  `audioMimeType`, `audioSizeBytes`, `audioDurationSec`, `audioStoragePath`
  (the `audioRef` from `/api/transcribe`), `transcript`,
  `transcriptLatencyMs`, `transcriptProvider`, `language`, `fields`
  (the structured safety fields), `followUps` (with answers), `urgentTags`,
  `consentGiven`, `detectedLanguage`.
- **Validation:** rejects if `consentGiven` is false (consent is mandatory
  before audio is stored). Requires either a transcript or a hazard
  description.
- **Side effects (one transaction-equivalent sequence):**
  1. Re-runs the additive urgency scan + injury-negation on the transcript
     so the saved tags are the union of the LLM's tags, the keyword scan,
     and the negation pass.
  2. Generates the next `referenceNo` (`SSA-YYYY-NNNN`, year + zero-padded
     count).
  3. Creates the `Incident` row with `status: "review"` (awaits supervisor).
  4. Writes the primary `Transcript` row (`provider` reflects what actually
     ran: `sahara` or `zai-asr`).
  5. Writes the `FollowUp` rows (with `askedAt` and `answeredAt`).
  6. Writes the audit trail: `recorded` (Voice report submitted),
     `transcribed` (provider + latency + language), `extracted` (urgent tag
     count), and `escalated` (the tag list) when the report is urgent.
- **Output:** `{ id, referenceNo }`.

### GET `/api/incidents/[id]` - mirrors `incidents.getIncidentDetail`

- **Output:** the full incident with `worker`, `followUps` (oldest first),
  `transcripts` (oldest first), and `auditEvents` (oldest first). The review
  drawer uses this to render the supervisor view.

### PATCH `/api/incidents/[id]` - mirrors `incidents.updateIncident` + `reviewIncident`

- **Inputs:** JSON `{ supervisorNotes?, reviewedBy?, status?,
  reviewedAt?, rawTranscript? }`.
- **What it does:** patches only the supplied fields, bumps `updatedAt`, and
  writes an audit event. The action label depends on what changed:
  - `transcript_verified` when `rawTranscript` changed (the supervisor
    corrected the transcript into a verified reference for benchmarking).
  - `escalated` when `status` is set to `"escalated"`.
  - `resolved` when `status` is set to `"resolved"`.
  - `reviewed` otherwise.
- **Output:** `{ id, status }`.

### POST `/api/incidents/[id]/benchmark` - mirrors `actions/transcribe.runBenchmark` (per-incident variant)

- **What it does:**
  1. Loads the incident. Returns 404 if there is no `audioStoragePath`
     (older reports recorded before audio persistence shipped cannot be
     benchmarked).
  2. Returns 400 if there is no `rawTranscript` to use as the reference
     (the supervisor should verify/correct the transcript first).
  3. Loads the persisted audio bytes via `loadAudio()` (with a
     path-traversal guard).
  4. Maps the incident's `detectedLanguage` back to an Intron code via
     `languageForBenchmark()` (e.g. `eng+lug` -> `lg`, `swa+eng` -> `sw`).
  5. Calls the shared `runBenchmarkLanes()` in `src/lib/benchmark-runner.ts`
     which runs all three real providers (Sahara/Intron, Whisper/OpenAI,
     Gemini/`gemini-3.8-flash`) with **no silent fallback**: missing key ->
     honest "not configured" lane; call error -> real error lane.
  6. Deletes any prior non-primary `whisper`/`gemini` transcripts on the
     incident (so re-running does not pile up duplicates) and writes fresh
     `Transcript` rows for each successful lane (Sahara keeps its primary).
  7. Creates a `BenchmarkRun` row with the lane results and aggregate
     metrics.
  8. Writes an audit event `benchmarked` ("<n> lanes - run <ref>").
- **Output:** `{ runId, referenceNo, results, aggregateMetrics, language }`.

### GET `/api/benchmark` - mirrors `benchmark.listBenchmarkRuns`

- **Output:** `{ runs: BenchmarkRun[] }` (most recent first, capped at 50).
  Each run includes the parsed `results` and `aggregateMetrics`.

### POST `/api/benchmark` - mirrors `actions/transcribe.runBenchmark` (standalone variant)

- **Inputs:** `multipart/form-data` with `audio` (optional - if absent, all
  three lanes report "No audio provided for the <X> lane"), `referenceTranscript`
  (required), optional `scenario` (s1-s4 map to language-aware labels),
  optional `language` (defaults to the scenario language or `lg`).
- **Validation:** reference transcript required (the metrics need a ground
  truth); 25 MB cap; MIME allow-list.
- **What it does:** delegates to the same shared `runBenchmarkLanes()` as
  the per-report route, saves the `BenchmarkRun` row, returns the lane
  results + aggregate.
- **Output:** `{ runId, referenceNo, results, aggregateMetrics }`.

### GET `/api/status` - open (no Convex mirror; a tiny config-read query)

- **Output:** `{ intron: { configured, baseUrl }, whisper: { configured },
  gemini: { configured, model }, zaiAsr: { available: true }, pwa: true,
  offlineDrafts: true }`. The About tab renders these as provider pills
  (emerald when configured, amber when not). Never leaks a key.

---

## 5. The Report Flow (end to end)

1. **Consent gate** - the Report tab renders an emergency-procedures-first
   warning ("If anyone is in immediate danger, follow your site's emergency
   procedures first - this app does not replace them.") and a consent
   checkbox. Recording is disabled until consent is given.
2. **Record or upload** - `src/components/audio-recorder.tsx` uses
   `MediaRecorder` with a live level meter, a 3-minute cap, and client-side
   16 kHz WAV encoding (`src/lib/audio-utils.ts`). Drag-and-drop file upload
   is also supported.
3. **Client WAV encode** - the recorder encodes the captured PCM into a WAV
   `Blob` before upload so the server receives a stable, provider-agnostic
   format.
4. **`POST /api/transcribe`** - the WAV blob is sent as `multipart/form-data`
   with the chosen speaking language (`lg`/`sw`/`en`). The server persists
   the audio to `db/uploads/` (returning `audioRef`), runs the real
   Intron/Sahara STT (sync -> 503/400 -> async poll), and returns the
   transcript + latency + provider + `audioRef`. On Intron failure or a
   missing key it transparently falls back to z-ai ASR in product mode.
5. **`POST /api/extract`** - the transcript is sent to the LLM with the
   safety-aware system prompt. The route applies the additive urgency
   backstop and the high-precision injury-negation pass, then returns the
   structured fields + urgent tags + at most 2 follow-up questions.
6. **Focused follow-ups** - the Report tab renders the follow-up questions.
   The worker types answers (or the supervisor adds them during review).
7. **`POST /api/incidents`** - the finalised report (transcript + fields +
   follow-ups + urgent tags + `audioRef` + consent flag) is POSTed. The
   server creates the `Incident`, the primary `Transcript`, the `FollowUp`
   rows, and the audit trail (`recorded` -> `transcribed` -> `extracted`
   -> `escalated` if urgent).
8. **Supervisor review** - the Reports tab lists incidents (with search,
   status, and urgency filters). A Sheet drawer shows the transcript
   (editable via `PATCH /api/incidents/[id]` with `rawTranscript`), the
   structured report, the follow-up Q&A, the provider transcripts, the
   audit trail, the supervisor review form (decision + notes), and the
   export-to-Markdown button. The reviewer can also trigger a per-report
   benchmark (see section 6).
9. **Offline draft path** - if the `POST /api/incidents` call fails (offline,
   network error, 5xx), `report-tab.tsx`'s `onError` saves the complete
   draft - including the recorded audio `Blob` and the `audioRef` - to
   IndexedDB via `src/lib/drafts-store.ts`, shows a "Saved offline" toast,
   and switches to the Reports tab. The app-shell retries queued drafts on
   the `online` event and once on mount (recovery after refresh/closure).
   The "Offline (N)" badge in the header opens a Sheet with per-draft
   Retry/Discard and a "Retry all" button.

---

## 6. The Benchmark Flow (two modes)

Both modes use the shared `runBenchmarkLanes()` in
`src/lib/benchmark-runner.ts`, so they behave identically.

### Mode A: standalone benchmark (Benchmark tab)

1. The judge/owner drops an audio file (or selects one of the four sample
   scenarios: s1 reactor relief valve in Luganda, s2 chemical spill in
   English, s3 forklift near-miss in Swahili+English, s4 arc flash in
   technical English).
2. The judge pastes a verified reference transcript (or loads the sample's
   `referenceText`).
3. The judge picks the speaking language (defaults to the scenario language).
4. `POST /api/benchmark` runs all three real provider lanes against the
   audio, computes WER/CER/critical-term-recall per lane and aggregate
   averages, saves a `BenchmarkRun`, and renders a results table + bar chart
   + transcript lanes + history list.

### Mode B: per-report benchmark (review drawer)

1. The supervisor opens an incident's review drawer and (optionally) edits
   the transcript into a verified reference via `PATCH /api/incidents/[id]`
   with `rawTranscript` (audited as `transcript_verified`).
2. The supervisor clicks "Benchmark this report".
3. `POST /api/incidents/[id]/benchmark` loads the persisted audio
   (`audioStoragePath`), maps the incident's `detectedLanguage` to an Intron
   code, runs the same `runBenchmarkLanes()` against the report's
   transcript as the reference, saves Whisper+Gemini as non-primary
   `Transcript` rows on the incident (Sahara keeps its primary), creates a
   `BenchmarkRun`, audits `benchmarked`, and returns the lane results +
   aggregate + language. A compact results table renders in the drawer.

### Metrics

- **WER (Word Error Rate)** - classic Levenshtein DP over word sequences,
  Unicode-aware normalization that preserves code-switched tokens.
- **CER (Character Error Rate)** - same DP over characters.
- **Critical-term recall** - the fraction of `DEFAULT_CRITICAL_TERMS`
  (industrial safety vocabulary: pressure, valve, reactor, HCl, burner,
  boiler, hydrogen, nitrogen, electrocution, forklift, scaffold, PPE, etc.)
  present in the reference that also appear in the hypothesis. This is the
  metric that matters most for safety: missing "pressure" or "valve" in a
  reactor report is far more dangerous than a missing article.
- **Latency** - `Date.now()` around the actual HTTP call (excluding upstream
  storage fetch) for fair cross-provider comparison.

### The "no silent fallback" rule

In benchmark mode, if a provider key is missing the lane reports an honest
"not configured" error (`success: false`). If the call errors, the lane
records the real error message. **The run never substitutes a different
provider for a failed lane.** This is a hard competition requirement: a
benchmark that silently swapped models would lie about model quality. In
product mode (the Report tab), a transparent fallback to z-ai ASR is allowed
and clearly tagged in the response so the supervisor knows the Sahara lane
did not run.

---

## 7. Providers

### Intron / Sahara (real, primary STT) - `src/lib/intron.ts`

- `isIntronConfigured()` - true when `INTRON_API_KEY` is set and at least 9
  chars.
- `transcribeWithIntron({ audioBlob, fileName, language })` - POSTs to
  `{INTRON_BASE_URL}/file/v1/upload/sync` with `Authorization: Bearer
  <key>`, multipart fields `audio_file_name`, `audio_file_blob`,
  `use_language_asr_input` (the chosen code, e.g. `lg`/`sw`/`en`),
  `use_category=file_category_general` (Intron's default is telehealth,
  wrong for industrial safety), and `use_disable_llm_corrections=TRUE` so
  code-switched technical terms (pressure, valve, reactor) survive
  verbatim (SautiSafe runs its own LLM extraction).
- **Sync -> 503/400 -> async poll:** on HTTP 503 (sync timeout) it extracts
  the returned `file_id` and polls `GET /file/v1/status/{file_id}` with a
  gentle backoff (1.5s -> 5s, capped at ~100s). On HTTP 400 (audio too long
  for sync) it re-uploads via the async endpoint and polls. Terminal
  statuses: `FILE_TRANSCRIBED` (success) or `FILE_PROCESSING_FAILED`
  (thrown as an error).
- Language codes: Luganda-English = `lg`, Swahili-English = `sw`, English =
  `en`. Intron has dedicated bilingual ASR models for 12 code-switched
  pairs. There is no auto language detection; SautiSafe must pick the model
  upfront via the speaking-language picker on the Report tab and the
  Sahara-language picker on the Benchmark tab.
- Safe, secret-stripped errors: `safeText()` slices response bodies to 300
  chars so a key echoed by an upstream proxy can never leak.

### Whisper (OpenAI) - `src/lib/providers.ts`

- `isWhisperConfigured()` - true when `OPENAI_API_KEY` is set and at least 9
  chars.
- `transcribeWithWhisper({ audioBlob, fileName, language })` - POSTs to
  `https://api.openai.com/v1/audio/transcriptions` with `Authorization:
  Bearer <key>`, multipart `file` + `model=whisper-1` +
  `response_format=verbose_json` + optional `language`. Tolerates a
  `text/plain` fallback. Returns `{ text, latencyMs, language, wordCount }`.
- Errors carry HTTP status + first 300 chars of body, with Bearer tokens,
  `api_key=` values, `sk-` prefixes, and Gemini `AIza...` prefixes
  regex-stripped.

### Gemini (`gemini-3.8-flash`) - `src/lib/providers.ts`

- `isGeminiConfigured()` - true when `GEMINI_API_KEY` is set and at least 9
  chars.
- `transcribeWithGemini({ audioBlob, fileName, language })` - POSTs to
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=<key>`
  with body `{ contents: [{ parts: [{ text: "Transcribe this audio
  verbatim, preserving any code-switched English/technical terms exactly as
  spoken." }, { inline_data: { mime_type, data: <base64> } }] }],
  generationConfig: { temperature: 0 } }`. The audio is base64-encoded via
  `Buffer.from(await audioBlob.arrayBuffer()).toString("base64")`. Returns
  `{ text, latencyMs }`. Throws a safe error if the model returns no
  transcript (surfaces `finishReason` when Gemini safety-blocks the
  content).
- Model default: `process.env.GEMINI_MODEL || "gemini-3.8-flash"` (the
  owner's required model). The same default is used in
  `convex/actions/transcribe.ts`.

### z-ai ASR (fallback, product mode only) - `src/lib/zai.ts`

- Singleton wrapper around `z-ai-web-dev-sdk`. `transcribeAudio(base64)`
  calls `zai.audio.asr.create({ file_base64 })`. Used as the transparent
  fallback in `/api/transcribe` when Intron is not configured or errors, and
  in the original benchmark before the real Whisper/Gemini lanes shipped.
  The response always tells the client which provider ran.

### `/api/status` booleans

`isIntronConfigured()`, `isWhisperConfigured()`, `isGeminiConfigured()` are
exposed via `/api/status` as boolean `configured` flags (plus the public
Intron base URL and the Gemini model name). The About tab renders these as
provider pills. No key material is ever exposed.

---

## 8. Safety and Ethics

- **Urgency vocabulary** - `src/lib/safety.ts` defines a fixed
  `URGENCY_VOCABULARY` (fire, chemical, electrocution,
  uncontrolled-pressure, injury, gas-leak, explosion, collapse,
  entanglement). Tags are drawn only from this list, both by the LLM
  (prompt-enforced) and by the keyword backstop.
- **Additive urgency backstop** - `detectUrgentTags()` unions any vocabulary
  keywords the LLM missed. It is purely additive; it never removes a flag.
  For a safety tool, a false alarm is far safer than a missed urgent risk.
- **High-precision injury-negation** - `applyInjuryNegation()` drops the
  `injury` tag only when the transcript clearly states nobody was hurt
  (regex patterns like `no one ... injured`, `nobody ... hurt`,
  `without ... injured`, `wasn't ... injured`). The negation pass only
  touches the `injury` tag; other tags (fire, chemical, etc.) are never
  suppressed by negation heuristics.
- **"Never declare equipment safe"** - the extraction system prompt forbids
  declaring equipment safe, diagnosing faults, recommending repairs, or
  triggering emergency procedures. Severity cannot be `low` without
  transcript evidence. Only the supervisor's `PATCH /api/incidents/[id]`
  moving `status` to `resolved` can close an incident.
- **Consent gate** - recording is disabled until the worker consents. The
  `POST /api/incidents` route rejects any submission without `consentGiven:
  true`.
- **Emergency-procedures-first warning** - the Report tab and the app-shell
  footer show a banner telling the worker to follow the site's emergency
  procedures first if anyone is in immediate danger; this app does not
  replace them.
- **25 MB / 3-minute limits** - enforced client-side (recorder cap + size
  check) and server-side (413 on oversize, 415 on unsupported MIME). Convex
  mirrors this in `audio.saveAudio`.
- **MIME validation** - allow-list in `src/lib/audio-utils.ts`
  (webm/wav/mp3/ogg/mp4/m4a/flac). The server re-checks the declared MIME
  and the file's actual type.
- **Append-only audit trail** - every meaningful action writes an
  `AuditEvent`. The trail is rendered in the review drawer so the
  supervisor can see the full life of a report (recorded -> transcribed ->
  extracted -> escalated -> transcript_verified -> reviewed/resolved ->
  benchmarked).
- **Non-retaliation** - anonymous reporting is supported (the `Worker`
  relation is optional; `displayName` is optional). The consent gate
  explains what is being stored.
- **Dataset declaration** - the About tab declares the providers and
  datasets in use (Intron/Sahara as primary STT with `lg`/`sw` code-switched
  models, z-ai ASR as the transparent product-mode fallback, the small
  consented original benchmark sample - not the organisers' dataset, and no
  external datasets bundled) per the organisers' WhatsApp guidance that
  different datasets/providers are allowed if declared.

---

## 9. PWA

- **Manifest** (`public/manifest.webmanifest`) - name/short_name, `start_url
  "/"`, `scope "/"`, `display: standalone`, `orientation: portrait`,
  `background_color: #0b3b38`, `theme_color: #0f7a73`, five icons (SVG +
  192/512 PNG + maskable 192/512), three app shortcuts
  (`?tab=report|reports|benchmark`).
- **Service worker** (`public/sw.js`):
  - Navigations: network-first, falls back to the cached app shell offline.
  - Static hashed assets (`/_next/static/`, icons, manifest, CSS/JS):
    cache-first.
  - `GET /api/*` reads: network-first with a short offline cache so the last
    reports list is readable offline.
  - `POST`/`PUT`/`PATCH /api/*`: **never intercepted**. If offline, the app
    saves the report to the IndexedDB draft queue and retries on
    connectivity - the SW must not swallow writes.
  - Precaches the shell on install, cleans old caches on activate, and
    honors a `SKIP_WAITING` message for fast updates.
- **Service worker registration** (`src/components/service-worker-register.tsx`)
  - prod-only registration + a "SautiSafe updated - reload" toast on
    `controllerchange`.
- **Install prompt** (`src/components/install-prompt.tsx`) - captures
  `beforeinstallprompt` and shows an "Install" header button; iOS Safari
  gets a manual "Add to Home Screen" sheet; hides when installed.
- **Offline draft queue** (`src/lib/drafts-store.ts`) - IndexedDB (not
  localStorage, because audio Blobs exceed the 5 MB quota). Stores the full
  report draft including the recorded audio `Blob`. Provides `putDraft`,
  `getAllDrafts`, `deleteDraft`, `updateDraftStatus`, `retryDraft` (POSTs
  JSON to `/api/incidents` and deletes on success), `retryAllDrafts`, a
  `useDraftCount` hook, and a `BroadcastChannel` for cross-tab sync. The
  app-shell auto-retries queued drafts on the `online` event and once on
  mount.
- **Bottom nav + safe-area insets** (`src/components/app-shell.tsx`) -
  sticky header with brand + desktop nav (hidden `< sm`) + Install/Offline/
  ModeToggle + online/offline chip; a fixed bottom nav for `< sm`
  (`grid-cols-4`, `h-16`, `pb-[env(safe-area-inset-bottom)]`, active tab in
  primary color); main has `pb-24` on mobile to clear the bottom nav; the
  footer emergency-notice is hidden `< sm` (the bottom nav is the mobile
  footer). Honors `?tab=` for PWA shortcuts. The viewport export sets
  `viewportFit: "cover"` and `maximumScale: 5` so safe-area insets work and
  zoom is not blocked.

---

## 10. Environment Variables

Set these in `.env` for the live test instance. `.env` is gitignored; never
commit real secrets. `.env.example` is the template.

### Live test instance (this Next.js app)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | SQLite path, e.g. `file:/home/z/my-project/db/custom.db` |
| `INTRON_API_KEY` | no (real STT) | Bearer token for `https://infer.voice.intron.io`. Leave empty to fall back to z-ai ASR (test env only). |
| `INTRON_BASE_URL` | no | Defaults to `https://infer.voice.intron.io`. Override only for a proxy. |
| `OPENAI_API_KEY` | no (Whisper lane) | Bearer token for `https://api.openai.com/v1/audio/transcriptions`. Leave empty to show the honest "not configured" lane. |
| `GEMINI_API_KEY` | no (Gemini lane) | API key for `https://generativelanguage.googleapis.com`. Leave empty to show the honest "not configured" lane. |
| `GEMINI_MODEL` | no | Defaults to `gemini-3.8-flash`. Override for another model id. |

Where to set them: write them into `/home/z/my-project/.env` (gitignored).
The dev server reads them on start. `/api/status` reflects the booleans.

### Production (Vercel + Convex)

Set these on the Convex deployment (not in the browser bundle) via
`npx convex env set NAME value` or the Convex dashboard. The frontend only
needs `NEXT_PUBLIC_CONVEX_URL` in Vercel.

| Variable | Where | Purpose |
|---|---|---|
| `INTRON_API_KEY` | Convex | Sahara STT bearer token. |
| `INTRON_BASE_URL` | Convex (optional) | Defaults to `https://infer.voice.intron.io`. |
| `OPENAI_API_KEY` | Convex | Whisper lane. |
| `GEMINI_API_KEY` | Convex | Gemini lane. |
| `GEMINI_MODEL` | Convex (optional) | Defaults to `gemini-3.8-flash`. |
| `LLM_API_BASE` | Convex | OpenAI-compatible chat-completions base URL for extraction. |
| `LLM_API_KEY` | Convex | API key for the LLM endpoint. |
| `LLM_MODEL` | Convex (optional) | Defaults to `gpt-4o-mini`. |
| `NEXT_PUBLIC_CONVEX_URL` | Vercel + `.env.local` | Convex deployment URL the frontend connects to. |
| `VITE_CONVEX_URL` | Vercel (optional) | Same value, used if the frontend is ever migrated to Vite. |

---

## 11. How to Run Locally

```bash
# 1. Install dependencies (Bun is the default runtime)
bun install

# 2. Copy the env template and fill in the keys you have
cp .env.example .env
# edit .env: set DATABASE_URL, INTRON_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, GEMINI_MODEL

# 3. Push the Prisma schema to SQLite (creates the tables)
bun run db:push
bun run db:generate

# 4. Start the dev server on port 3000
bun run dev
# open http://localhost:3000
```

The dev server pipes through `tee dev.log`. The Prisma client is generated
into `node_modules/.prisma/client`. Audio uploads land in
`db/uploads/` (gitignored).

The Z cloud preview panel renders the app inside the workspace; on a desktop
browser, narrow the window to `< 640px` to see the mobile bottom nav and
safe-area behavior. To test the offline draft queue, throttle the network to
offline in DevTools while a report is being submitted - the draft is saved
to IndexedDB and the "Offline (N)" badge appears.

---

## 12. Production Migration

The `convex/` folder is the production-ready backend. The owner deploys it
to Vercel + Convex when ready. The full step-by-step is in
`convex/MIGRATION.md`; the short version:

1. `npm install convex` (one-time, by the owner, locally).
2. `npx convex dev` - authenticates, creates the project, generates the
   `_generated/api.*` and `_generated/server.*` files, and pushes
   `convex/schema.ts` (creates the six tables).
3. Set the Convex env vars via `npx convex env set NAME value`
   (`INTRON_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `LLM_API_BASE`,
   `LLM_API_KEY`, etc.). See section 10 above.
4. Set `NEXT_PUBLIC_CONVEX_URL` in the Vercel project (Production + Preview).
   The Convex dashboard has a "Vercel integration" button that automates
   this.
5. Swap the frontend from `fetch("/api/*")` to Convex hooks. The swap is a
   mechanical 1:1 change: each `fetch("/api/...")` becomes a
   `useQuery(api.x.y, args)` or `useMutation(api.x.y, args)` /
   `useAction(api.actions.x.y, args)` hook using the matching function from
   the mapping table in `convex/MIGRATION.md` (section 2).
6. (Optional) backfill data - export any real incident records from SQLite
   as JSON and write a one-shot import script that calls the Convex
   mutations.

**Do NOT run `npx convex dev` or `npx convex deploy` from this Z cloud
sandbox.** The owner runs these on their own machine when they are ready to
cut over. The `convex/` folder is checked in for them to deploy.

---

## 13. Known Limitations

- **Whisper + Gemini geo-restrict this sandbox region.** The keys are valid
  (auth accepted) but the OpenAI API returns HTTP 403
  `unsupported_country_region_territory` and the Gemini API returns HTTP
  400 `User location is not supported for the API use`. In this Z cloud
  sandbox only the Intron/Sahara API actually completes a transcription.
  Whisper + Gemini will work on a Vercel deployment in a supported
  (US/global) region. The benchmark lanes surface these errors honestly
  (no silent fallback).
- **Audio persisted to local disk in the test env.** `src/lib/audio-storage.ts`
  writes blobs to `db/uploads/` so the per-report benchmark can re-transcribe
  them. Production uses Convex file storage (`convex/audio.ts`). This is
  noted in the About tab.
- **No auth gate.** An in-Zcloud OTP login gate was built and then stripped
  (the user wanted it gone; there is no email gateway in the z-ai SDK). The
  app opens straight to the Report tab. For the Vercel deployment, Clerk is
  the clean choice (orthogonal to the stripped OTP infrastructure).
- **Simulated lanes removed.** All three benchmark lanes are real now
  (Sahara, Whisper, Gemini). The old `corruptTranscript` simulated
  degradation lanes were removed. Missing keys produce honest "not
  configured" lanes; call errors produce real error lanes.
- **Benchmark reference is the supervisor-verified transcript.** The
  per-report benchmark uses the incident's `rawTranscript` as the ground
  truth. The supervisor should correct it first (the route returns 400 if
  there is no transcript). This makes the metrics human-dependent in
  accuracy.
- **No streaming live captions.** The Intron WebSocket STT spec
  (`wss://infer.voice.intron.io/stt/v1/stream`, base64 PCM16-LE chunks) is
  documented in `docs/intron-api-spec.md` but not yet implemented. The
  current recorder encodes WAV; a streaming path would need a PCM16-LE
  encoder. This is on the roadmap.
- **Small consented-original benchmark sample.** The four sample scenarios
  in `src/lib/safety.ts` (s1-s4) are consented original recordings, not the
  organisers' dataset. This is declared in the About tab and in
  `SUBMISSION_FOR_JUDGES.md`.
