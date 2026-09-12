# SautiSafe — Convex Migration Guide

This document explains how the **`convex/`** folder in this repo maps to the
live Next.js testing instance (built on Prisma + SQLite + `z-ai-web-dev-sdk`)
and how the owner will eventually deploy it as the production backend on
**Vercel + Convex** without re-implementing anything that already exists.

> **Status:** The Next.js app in this repository is the **testing instance**
> built for evaluation in the Z cloud. The `convex/` folder is the
> **production-ready backend** the owner will deploy to Convex later. The two
> are intentionally a 1:1 mirror: every Prisma model has a Convex table, and
> every `/api/*` route in the live app has a Convex function. Once the owner
> is ready, they flip the frontend over to Convex and delete the Prisma layer.

---

## 1. Schema mapping (Prisma → Convex)

Convex has no `@default(now())`, `@updatedAt`, `@unique`, or relation decorators.
Those concerns are handled in application code (mutations set
`createdAt`/`updatedAt`, `referenceNo` is enforced via a `byReferenceNo` index
and a uniqueness check inside `createIncident`, relations are stored as
`v.id("tableName")` foreign keys and joined in queries).

| Prisma model    | Convex table       | Notes                                                                                                                              |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Worker`        | `workers`          | All fields optional except `createdAt`.                                                                                            |
| `Incident`      | `incidents`        | `workerId` is `v.id("workers")`. Indexes: `byReferenceNo`, `byWorker`, `byStatus`, `byIsUrgent`.                                   |
| `FollowUp`      | `followUps`        | `incidentId` is `v.id("incidents")`. Cascade delete is manual (see `deleteIncident`). Index: `byIncident`.                         |
| `Transcript`    | `transcripts`      | `confidence` is `v.float64()`. Index: `byIncident`.                                                                               |
| `BenchmarkRun`  | `benchmarkRuns`    | `resultsJson` and `aggregateMetrics` are stored as JSON strings (Convex has no native JSON column type).                          |
| `AuditEvent`    | `auditEvents`      | Append-only. Index: `byIncident`.                                                                                                  |

### Per-field type mapping

| Prisma type                | Convex validator          |
| -------------------------- | ------------------------- |
| `String`                   | `v.string()`              |
| `String?`                  | `v.optional(v.string())`  |
| `Int` / `Int?`             | `v.int64()` / `v.optional(v.int64())` |
| `Float` / `Float?`         | `v.float64()` / `v.optional(v.float64())` |
| `Boolean` / `Boolean?`     | `v.boolean()` / `v.optional(v.boolean())` |
| `DateTime` / `DateTime?`   | `v.number()` (unix ms) / `v.optional(v.number())` |
| `@id @default(cuid())`     | implicit `_id: Id<"...">` |
| `@default(now())`          | set in mutation via `Date.now()` |
| `@updatedAt`               | bumped in mutation via `Date.now()` |
| `@unique`                  | enforced by app code + a `byReferenceNo` index lookup |
| `@relation(...)` FK        | `v.id("tableName")` (referenced table name) |
| `onDelete: Cascade`        | manual cascade in `deleteIncident` mutation |
| JSON stored as `String`    | `v.string()` (stringified JSON) |

---

## 2. API route mapping (Next.js → Convex)

Every `/api/*` route in the live Next.js app has a Convex function with the
same semantics. The frontend swap is a 1:1 call-shape change.

| Live Next.js route                              | Convex function (file#export)                                  |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `POST /api/audio/upload-url`                    | `audio.generateUploadUrl` (mutation)                          |
| `POST /api/audio`                               | `audio.saveAudio` (mutation)                                  |
| `GET  /api/audio/:storageId`                    | `audio.getAudioMeta` (query)                                   |
| `GET  /api/audio/:storageId/download-url`       | `audio.getAudioUrl` (mutation — returns a time-limited URL)    |
| `GET  /api/incidents/reference/next`            | `incidents.nextReferenceNo` (query)                           |
| `POST /api/incidents`                           | `incidents.createIncident` (mutation)                         |
| `GET  /api/incidents`                           | `incidents.listIncidents` (query)                             |
| `GET  /api/incidents/:id`                       | `incidents.getIncident` (query)                               |
| `GET  /api/incidents/:id/detail`                | `incidents.getIncidentDetail` (query)                          |
| `PATCH /api/incidents/:id`                      | `incidents.updateIncident` (mutation)                         |
| `POST /api/incidents/:id/review`                | `incidents.reviewIncident` (mutation)                          |
| `DELETE /api/incidents/:id`                     | `incidents.deleteIncident` (mutation, cascades)                |
| `GET  /api/incidents/:id/followups`             | `followUps.listForIncident` (query)                           |
| `POST /api/incidents/:id/followups`             | `followUps.createFollowUp` (mutation)                          |
| `POST /api/followups/:id/answer`                | `followUps.answerFollowUp` (mutation)                         |
| `POST /api/incidents/:id/transcripts`           | `transcripts.addTranscript` (mutation)                        |
| `GET  /api/incidents/:id/transcripts`           | `transcripts.listForIncident` (query)                          |
| `POST /api/transcribe/:provider`                | `actions/transcribe.transcribeWithProvider` (action)          |
| `POST /api/benchmark/run`                      | `actions/transcribe.runBenchmark` (action)                   |
| `GET  /api/benchmark`                          | `benchmark.listBenchmarkRuns` (query)                         |
| `GET  /api/benchmark/:id`                      | `benchmark.getBenchmarkRun` (query)                           |
| `POST /api/benchmark`                          | `benchmark.saveBenchmarkRun` (mutation)                        |
| `POST /api/extract`                            | `actions/extract.extractSafetyFields` (action)                |

---

## 3. Required environment variables

Set these in the Convex dashboard (Production deployment) and in the Vercel
project (for the Next.js frontend). The owner should set them on the Convex
side via `npx convex env add NAME value` or the dashboard UI; the frontend
only needs `NEXT_PUBLIC_CONVEX_URL`.

| Variable                     | Where                       | Purpose                                                                    |
| ---------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `SAHARA_TRANSCRIPTION_URL`  | Convex                      | Sahara ASR endpoint URL.                                                   |
| `SAHARA_API_KEY`            | Convex                      | Sahara bearer token.                                                       |
| `OPENAI_API_KEY`            | Convex                      | OpenAI Whisper provider.                                                   |
| `OPENAI_WHISPER_MODEL`      | Convex (optional)           | Whisper model name (default: `whisper-1`).                                 |
| `GEMINI_API_KEY`            | Convex                      | Google Gemini provider.                                                    |
| `GEMINI_MODEL`              | Convex (optional)           | Gemini model (default: `gemini-2.0-flash`).                                |
| `LLM_API_BASE`              | Convex                      | Base URL of an OpenAI-compatible chat-completions endpoint.                |
| `LLM_API_KEY`               | Convex                      | API key for the LLM endpoint.                                              |
| `LLM_MODEL`                 | Convex (optional)           | Model name (default: `gpt-4o-mini`).                                        |
| `NEXT_PUBLIC_CONVEX_URL`    | Vercel + `.env.local`      | Convex deployment URL the frontend connects to.                            |
| `VITE_CONVEX_URL`           | Vercel (optional, alt)     | Same value, used if the frontend is ever migrated to Vite.                 |

### Critical safeguard — no silent fallback

The transcription provider actions are written so that a **missing env var
throws a clear error** (`"Sahara transcription provider not configured: set
SAHARA_TRANSCRIPTION_URL and SAHARA_API_KEY"`) rather than silently falling
back to another model. This is a competition requirement:

> Benchmark mode that never silently falls back between models.

Same inside `runBenchmark`: per-provider failures are recorded with their
real error message in the results array; the run never silently substitutes
a different provider.

---

## 4. Deployment steps

> **Do NOT run `npx convex dev` or `npx convex deploy` from this Z cloud
> sandbox.** The owner will run these commands on their own machine when
> they are ready to cut over from the live Next.js testing instance to the
> Convex production backend. This folder is checked in for them to deploy.

1. **Install Convex** in the project (one-time, by the owner, locally):

   ```bash
   npm install convex
   ```

2. **Log in & create the deployment**:

   ```bash
   npx convex dev
   ```

   This will:
   - authenticate against Convex,
   - create a project if none exists,
   - generate the `_generated/api.*` and `_generated/server.*` files that
     the imports in this folder reference,
   - push `convex/schema.ts` and create the six tables.

3. **Set environment variables** on the Convex side:

   ```bash
   npx convex env add SAHARA_TRANSCRIPTION_URL https://...
   npx convex env add SAHARA_API_KEY          sk-...
   npx convex env add OPENAI_API_KEY          sk-...
   npx convex env add GEMINI_API_KEY          AIza...
   npx convex env add LLM_API_BASE            https://api.openai.com/v1
   npx convex env add LLM_API_KEY             sk-...
   # optional:
   npx convex env add GEMINI_MODEL            gemini-2.0-flash
   npx convex env add LLM_MODEL               gpt-4o-mini
   npx convex env add OPENAI_WHISPER_MODEL    whisper-1
   ```

4. **Connect Vercel** — set `NEXT_PUBLIC_CONVEX_URL` in the Vercel project
   environment variables (Production + Preview). The Convex dashboard has a
   "Vercel integration" button that automates this if you prefer.

5. **Swap the frontend** from the live Prisma+SQLite calls to Convex hooks.
   The owner's frontend refactor is a mechanical 1:1 swap: each
   `fetch("/api/...")` call becomes a `useQuery(api.x.y, args)` or
   `useMutation(api.x.y, args)` / `useAction(api.actions.x.y, args)` hook
   using the matching function from the table in §2.

6. **Backfill data** (optional) — if there are real incident records in the
   SQLite testing instance that should be preserved, export them as JSON and
   write a one-shot import script that calls the Convex mutations.

---

## 5. Required safeguards (competition checklist)

The Convex backend enforces (or surfaces) every safeguard the live Next.js
app relies on. The owner's frontend must continue to enforce the
client-side checks; the backend never trusts the client alone for safety.

| #  | Safeguard                                       | Where it lives (Convex)                                                              | Where it lives (live Next.js)                |
| -- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1  | Consent checkbox before audio is stored         | `incidents.createIncident` throws if `consentGiven === false`.                       | Consent checkbox in the recorder UI          |
| 2  | Emergency-procedures-first warning             | Frontend shows a banner before letting the worker record; backend records "recorded" audit event with the consent context. | Banner component on the recorder screen     |
| 3  | Max recording duration (e.g. 60 s)             | Frontend enforced; backend enforces a 25 MB blob ceiling via `audio.saveAudio`.      | Recorder timer + auto-stop                  |
| 4  | 25 MB audio upload limit                        | `audio.saveAudio` throws if `sizeBytes > 25 * 1024 * 1024`.                          | Pre-upload size check                        |
| 5  | MIME validation (webm/wav/mp3/ogg/mp4 only)     | `audio.saveAudio` rejects anything outside the allow-list.                            | `<input accept="audio/*">` + check          |
| 6  | No silent fallback in benchmark                | `actions/transcribe.ts` throws `"provider not configured"` on missing env vars; `runBenchmark` records per-provider errors honestly without retrying on a different model. | same                                         |
| 7  | Human transcript confirmation                  | The `rawTranscript` is only set when a transcript row is marked `isPrimary` (in `transcripts.addTranscript`); the supervisor must confirm before the report is submitted. The benchmark `referenceTranscript` is human-supplied. | UI button "Confirm transcript"               |
| 8  | No auto "equipment safe" declaration           | The extraction system prompt explicitly forbids declaring equipment safe; the `severity` field cannot be `"low"` without transcript evidence. The supervisor's `reviewIncident` is the only path that flips status to `resolved`. | UI warning + system prompt                   |
| 9  | Audio retention policy                          | `deleteIncident` does NOT delete the audio blob (it may be referenced by benchmark runs or other incidents). The owner should run a separate retention sweep. | same                                         |
| 10 | Audit trail for every meaningful action        | `auditEvents` table is append-only; mutations `createIncident`, `updateIncident`, `reviewIncident`, `deleteIncident`-pre, `followUps.createFollowUp`, `followUps.answerFollowUp`, `transcripts.addTranscript` all write audit events. | same                                         |

---

## 6. Files in this folder

```
convex/
├── README.md                 — one-paragraph overview
├── MIGRATION.md              — this document
├── schema.ts                 — six tables, indexes, validators
├── incidents.ts              — createIncident, updateIncident, reviewIncident,
│                                deleteIncident, listIncidents, getIncident,
│                                getIncidentDetail, nextReferenceNo
├── followUps.ts              — createFollowUp, answerFollowUp, listForIncident
├── transcripts.ts            — addTranscript, listForIncident
├── benchmark.ts              — saveBenchmarkRun, listBenchmarkRuns, getBenchmarkRun
├── audio.ts                  — generateUploadUrl, saveAudio, getAudioMeta, getAudioUrl
├── lib/
│   └── metrics.ts            — normalizeText, wordErrorRate, charErrorRate,
│                                criticalTermRecall, computeAllMetrics,
│                                DEFAULT_CRITICAL_TERMS
└── actions/
    ├── transcribe.ts         — transcribeWithProvider (sahara/whisper/gemini),
    │                           runBenchmark (sequential, no silent fallback)
    └── extract.ts            — extractSafetyFields (LLM extraction + safeguards)
```

The `_generated/` directory is created automatically by `npx convex dev` —
it contains the typed API surface (`api`, `internal`, `query`, `mutation`,
`action`, `Id`, `Doc` types). Do NOT check those files in; they are
regenerated on every `convex dev` run.
