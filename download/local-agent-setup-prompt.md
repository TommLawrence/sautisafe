# Prompt for a local agent: set up SautiSafe on Vercel + Convex

Copy-paste this into your local AI coding agent (Cursor, Claude Code, Cline, etc.) in the project root after cloning from https://github.com/TommLawrence/sautisafe.

---

## The prompt

I have a SautiSafe project (Next.js 16 + Prisma/SQLite + z-ai-web-dev-sdk) currently running in a Zcloud workspace. The Zcloud publish step is broken, so I'm migrating the backend to Convex and deploying the frontend to Vercel. The `convex/` folder already contains the production Convex backend (schema, mutations, actions) mirroring the live Next.js API routes 1:1. Do NOT rewrite the frontend components - only swap the data layer from Prisma/Next-API-routes to Convex.

Here is the exact migration plan. Execute it step by step, stopping to confirm before any destructive change:

### Step 1 - Install Convex + wire the provider
1. `npm install convex`
2. Create a `src/lib/convex.ts` file that exports a Convex React client using `NEXT_PUBLIC_CONVEX_URL` (the public env var). Wrap the app in `<ConvexProvider>` in `src/app/layout.tsx`.
3. Add `"deploy": "convex deploy --cmd 'npm run build'"` to package.json scripts.

### Step 2 - Swap the data layer (frontend)
The frontend currently calls these Next.js API routes. Replace each with the equivalent Convex mutation/query/action from the `convex/` folder:

- `POST /api/transcribe` -> `useAction(api.actions.transcribe.transcribeWithProvider, { provider: "sahara", language, audioStorageId })` - BUT audio must first be uploaded via `generateUploadUrl` + `saveAudio` mutations from `convex/audio.ts`, then the storageId passed to the action.
- `POST /api/extract` -> `useAction(api.actions.extract.extractSafetyFields, { transcript })`
- `GET /api/incidents` -> `useQuery(api.incidents.listIncidents, { status?, urgent?, q? })`
- `POST /api/incidents` -> `useMutation(api.incidents.createIncident, { ... })`
- `GET /api/incidents/[id]` -> `useQuery(api.incidents.getIncidentDetail, { id })`
- `PATCH /api/incidents/[id]` -> `useMutation(api.incidents.updateIncident, { id, ... })`
- `POST /api/incidents/[id]/benchmark` -> a new Convex action `api.actions.transcribe.runBenchmark` (already in convex/actions/transcribe.ts) that takes `{ audioStorageId, referenceTranscript, providers, language }`
- `GET /api/benchmark` -> `useQuery(api.benchmark.listBenchmarkRuns)`
- `POST /api/benchmark` -> `useAction(api.actions.transcribe.runBenchmark, { ... })` + `useMutation(api.benchmark.saveBenchmarkRun, { ... })`
- `GET /api/status` -> a new Convex query `api.status.get` that returns the provider configured booleans (do NOT leak keys)

Keep the same UI components, same toast notifications, same loading states. Only the fetch calls change to Convex hooks.

### Step 3 - Remove the Next.js API routes
After the swap, delete `src/app/api/` entirely (the Convex actions replace them). Keep `src/lib/intron.ts`, `src/lib/providers.ts`, `src/lib/metrics.ts`, `src/lib/safety.ts`, `src/lib/audio-utils.ts`, `src/lib/store.ts`, `src/lib/drafts-store.ts` - these are shared pure logic, still used by the frontend.

### Step 4 - Prisma removal
The Prisma schema (`prisma/schema.prisma`) is no longer needed at runtime - Convex owns the DB now. Keep the file for reference but remove `@prisma/client` from dependencies + delete `src/lib/db.ts`. The offline draft queue (`src/lib/drafts-store.ts`) stays - it uses IndexedDB, not Prisma.

### Step 5 - Environment variables
- On Convex (via `npx convex env set` or the dashboard): `INTRON_API_KEY`, `INTRON_BASE_URL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`. NEVER put these in Vercel.
- On Vercel: `NEXT_PUBLIC_CONVEX_URL` (the public Convex deployment URL) + `CONVEX_DEPLOY_KEY` (for the Vercel build to deploy Convex functions).

### Step 6 - Deploy
1. `npx convex dev` (creates the Convex project + pushes the schema/functions)
2. Set the 5 provider env vars on Convex
3. Push to GitHub -> Vercel auto-deploys
4. Set `NEXT_PUBLIC_CONVEX_URL` + `CONVEX_DEPLOY_KEY` on Vercel
5. Redeploy on Vercel so the build picks up the env vars

### Constraints
- Do NOT rewrite any UI component, style, or layout.
- Do NOT change the PWA (manifest, service worker, IndexedDB drafts) - it's frontend-only and stays.
- Do NOT put provider API keys in Vercel or in any committed file.
- Keep the `convex/` folder's existing functions as-is - they're already written and correct.
- If a swap is ambiguous, stop and ask before guessing.

### Files to read first
- `convex/MIGRATION.md` (the full live-route -> Convex-function mapping)
- `convex/schema.ts`, `convex/incidents.ts`, `convex/audio.ts`, `convex/actions/transcribe.ts`, `convex/actions/extract.ts`
- `src/components/tabs/report-tab.tsx`, `src/components/tabs/reports-tab.tsx`, `src/components/tabs/benchmark-tab.tsx` (where the fetch calls live)
- `.env.example` (the env var reference)

Begin with Step 1. Show me the blast radius before each step.
