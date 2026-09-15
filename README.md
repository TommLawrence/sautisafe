# SautiSafe

SautiSafe is a mobile-first safety-reporting app for workers who naturally mix English with Luganda, Swahili, or other African languages. A worker records an incident, the app creates a structured report, and a supervisor reviews the original audio, transcript, safety details, and urgency cues.

## What it includes

- Code-switched voice reporting with Sahara as the primary speech provider
- Side-by-side benchmarking with Sahara, Whisper, and Gemini
- Human transcript correction and supervisor review
- Structured incident fields, focused follow-up questions, and an audit trail
- Offline drafts and installable PWA support
- Explicit consent and human control over safety decisions

## Architecture

The frontend uses Next.js and TypeScript. Convex provides the production database, file storage, real-time queries, mutations, and protected provider actions. Provider credentials remain in Convex environment variables and are not exposed to the browser or Vercel frontend.

## Benchmark findings

The dated production results, failure counts, dataset notes, and interpretation are documented in [the benchmark report](docs/BENCHMARK_PROTOCOL.md).

## Local development

```bash
bun install
npx convex dev
bun run dev
```

Create `.env.local` with `NEXT_PUBLIC_CONVEX_URL`. Provider credentials belong in the Convex deployment environment, never in committed files.

