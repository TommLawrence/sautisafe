# SautiSafe

Safer reporting, in the language workers actually speak.

Code-switched voice reporting assistant for industrial safety incidents and
near misses. Workers record voice (mixing English with Luganda, Swahili, or
another local language), the system transcribes it, extracts structured safety
fields, asks focused follow-ups, flags urgent risks, and produces a
supervisor-reviewable report. It also benchmarks speech models (Sahara/Intron,
Whisper, Gemini) on either standalone samples or real incident reports.

---

## For test users (technicians)

You do not need to install anything. You use the published link in your
browser.

### How to report an incident

1. Open the published link in your browser (Chrome or Safari on mobile works
   best).
2. Tap **Continue as Technician**.
3. Enter your name in **Your name** (so your supervisor knows who reported).
4. Tick the consent checkbox.
5. Pick your **speaking language** (Luganda-English, Swahili-English, or
   English).
6. Tap the microphone to **record**. Speak naturally - mix English with
   Luganda or Swahili. Max 3 minutes.
7. Tap **Transcribe and analyze**. Wait a few seconds.
8. Check the transcript and the structured fields. Correct anything if needed.
9. Answer any follow-up questions.
10. Tap **Submit for supervisor review**.

Your report goes straight to your supervisor. You do not need to walk back to
tell them.

### If you are offline

If you submit while offline, the report is saved on your phone. It will submit
automatically when you are back online. Do not close the tab before it
submits.

### Test paragraphs

See `download/test-user-paragraphs.md` for 10 sample paragraphs you can read
aloud. Mix in Luganda where it feels natural.

---

## For developers

### Stack

- **Framework:** Next.js 16 (App Router) + TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui (New York style)
- **Database:** Prisma ORM + SQLite (test instance in the Z cloud)
- **Speech:** Intron Voice (Sahara) STT + OpenAI Whisper + Google Gemini
- **LLM:** z-ai-web-dev-sdk (for structured field extraction)
- **State:** Zustand (client) + TanStack Query (server)
- **PWA:** manifest + service worker + IndexedDB offline draft queue

### Prerequisites

- Node.js 20+ or Bun
- An Intron Voice API key (get one at https://voice.intron.io/v2/developers)
- (Optional) OpenAI API key for the Whisper benchmark lane
- (Optional) Google Gemini API key for the Gemini benchmark lane

### How to run locally

1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in your keys:
   ```
   cp .env.example .env
   ```
3. Install dependencies:
   ```
   bun install
   ```
4. Push the database schema:
   ```
   bun run db:push
   ```
5. Start the dev server:
   ```
   bun run dev
   ```
6. Open http://localhost:3000 in your browser.

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (default: `file:./db/custom.db`) |
| `INTRON_API_KEY` | Yes | Intron Voice (Sahara) API key |
| `INTRON_BASE_URL` | No | Intron base URL (default: `https://infer.voice.intron.io`) |
| `OPENAI_API_KEY` | No | OpenAI Whisper benchmark lane |
| `GEMINI_API_KEY` | No | Google Gemini benchmark lane |
| `GEMINI_MODEL` | No | Gemini model (default: `gemini-3.8-flash`) |

Never commit `.env`. It is gitignored. The `.env.example` file is committed
as a reference.

### Lint

```
bun run lint
```

### Database

```
bun run db:push      # push schema to SQLite
bun run db:generate   # regenerate Prisma client
```

### Project structure

```
src/
  app/
    api/              # backend routes (transcribe, extract, incidents, benchmark)
    globals.css       # theme + palette
    layout.tsx        # root layout (providers, PWA manifest, SW register)
    page.tsx          # entry (landing role-picker or app shell)
  components/
    tabs/             # Report, Reports, Benchmark, About tabs
    audio-recorder.tsx
    app-shell.tsx     # header + nav + footer
    landing.tsx       # role picker
    ...
  lib/
    intron.ts         # Intron/Sahara STT client
    providers.ts      # Whisper + Gemini STT clients
    benchmark-runner.ts  # shared multi-lane benchmark runner
    safety.ts         # urgency vocabulary + sample scenarios
    metrics.ts        # WER/CER (normalised + unnormalised) + critical-term recall
    drafts-store.ts   # IndexedDB offline draft queue
    audio-storage.ts  # server-side audio persistence
    store.ts          # Zustand store (role, tab, report draft)
    ...
convex/               # production Convex backend (mirrors the Z-cloud backend 1:1)
  schema.ts
  incidents.ts
  actions/
    transcribe.ts
    extract.ts
  lib/
    metrics.ts
  MIGRATION.md
download/             # documentation + test materials
  DEVELOPER_GUIDE.md
  SUBMISSION_FOR_JUDGES.md
  BENCHMARK_RESULTS.md
  test-user-paragraphs.md
  samples/            # 5 TTS test audio files
```

### Production deployment (Vercel + Convex)

The `convex/` folder contains the production Convex backend. It mirrors the
Z-cloud backend field-for-field. See `convex/MIGRATION.md` for the full
mapping and deployment steps.

1. Create a Convex project: `npx convex dev`
2. Set provider keys on Convex:
   ```
   npx convex env set INTRON_API_KEY ...
   npx convex env set OPENAI_API_KEY ...
   npx convex env set GEMINI_API_KEY ...
   ```
3. Deploy the frontend to Vercel.
4. Set `NEXT_PUBLIC_CONVEX_URL` on Vercel.

### License

AGPL-3.0. See `LICENSE` for details.

---

## Documentation

- `download/DEVELOPER_GUIDE.md` - deep technical reference (architecture, data
  model, every API route, the report + benchmark flows, providers, safeguards,
  PWA, env vars, glossary)
- `download/SUBMISSION_FOR_JUDGES.md` - judge-facing value + honesty doc
- `download/BENCHMARK_RESULTS.md` - real Afrispeech-200 Luganda benchmark results
- `download/test-user-paragraphs.md` - 10 test paragraphs for field testing
- `download/samples/` - 5 TTS test audio files + a README with reference transcripts
