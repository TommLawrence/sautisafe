# SautiSafe — User Codebase Merge Review (Task R2)

**Reviewer:** general-purpose agent (research only — no source files modified)
**Source reviewed:** `/home/z/my-project/upload/complete_codebase.txt` (19,752 lines, 99 files concatenated with `===== ~/sautisafe-main/<path> =====` separators)
**Target:** existing SautiSafe Next.js 16 app at `/home/z/my-project/src/` (82 source files, no PWA)
**Deadline context:** submission in ~2 days; app MUST be mobile-first.

---

## TL;DR

The user's "complete_codebase.txt" is **not** a React+Vite+Convex PWA as the brief assumed. It is a **Codex "site-creator-vinext-starter" template** (Next.js 16 + Vite + Cloudflare Workers + Drizzle D1 + Convex declared but unwired + a 61-component shadcn/ui kit) with a **single static SautiSafe demo page** bolted on top (`app/page.tsx`, 78 lines). The recorder on that page is **fake** (a `setInterval` timer; no `MediaRecorder`, no `getUserMedia`, no upload). The codebase contains **zero PWA surface** — no manifest, no service worker, no install prompt, no IndexedDB, no `navigator.onLine`, no offline draft queue. The `viewport` meta is also missing (`app/layout.tsx` exports only `metadata`, no `viewport`/`themeColor`).

**Practical implication for the 2-day mobile-first deadline:** the user's codebase contributes **nothing** to the PWA gap that the brief identifies as the highest priority. The current Next.js app must build its PWA from scratch. The only salvageable items are a handful of **Convex schema design patterns** (a `benchmarkCases` table, a `transcriptionRuns` table, a `modelConfigs` table, a `users`-with-roles table) and a few **shadcn/ui components the current app lacks** — but the latter are written against the newer `radix-ui` umbrella + `@base-ui/react` packages, not the current app's `@radix-ui/react-*` individual packages, so they require import rewrites before they'll compile.

---

## 1. Stack summary

| Dimension | User codebase (`~/sautisafe-main`) | Current SautiSafe app (`/home/z/my-project`) |
|---|---|---|
| Framework | Next.js 16.3.4 **+ Vite 8** via the `vinext` 1.0.0-beta.5 adapter (runs Next on Cloudflare Workers) | Next.js 16 standalone (`next dev`) on Bun |
| Runtime / deploy | Cloudflare Workers (`wrangler` 4.92, `@cloudflare/vite-plugin` 1.37, `cloudflare:workers` env, D1 + R2 bindings) | Node/Bun + Prisma + SQLite (local dev) |
| DB | **Drizzle ORM 0.45** on Cloudflare D1 — but `db/schema.ts` is **intentionally empty** (`export {};`) | **Prisma 6** on SQLite, full schema (Worker/Incident/FollowUp/Transcript/BenchmarkRun/AuditEvent) |
| Convex | `convex` 1.45 in deps; `convex/` folder with 4 files (reports.ts, schema.ts, transcription.ts, transcriptionData.ts). **No `ConvexProvider`/`ConvexReactClient`/`useQuery`/`useMutation` anywhere in the frontend** — Convex is declared but unwired. | `convex/` folder with 11 files mirroring every live route 1:1 (schema, incidents, followUps, transcripts, benchmark, audio, actions/transcribe, actions/extract, lib/metrics, MIGRATION.md, README.md). Also unwired on the frontend (the live app uses TanStack Query + Zustand), but the migration folder is complete. |
| UI primitives | shadcn/ui "new-york" style, but on the **newer registry layer**: `radix-ui` umbrella 1.6, `@base-ui/react` 1.7, `@shadcn/react` 0.3 — NOT `@radix-ui/react-*` individual packages | shadcn/ui "new-york" style on the **classic** `@radix-ui/react-*` individual packages (36 of them in package.json) |
| Tailwind | 4.2.1 + `tw-animate-css` + a vendored `vendor/shadcn-tailwind-4.13.0.css` (1900 lines) | 4.x via `@tailwindcss/postcss` + `tw-animate-css` |
| State / data | `react-hook-form` + `zod`, no TanStack Query, no Zustand | TanStack Query 5 + Zustand + react-hook-form + zod |
| Auth | `app/chatgpt-auth.ts` — "Sign in with ChatGPT" via upstream-proxy headers (`oai-authenticated-user-id`, `oai-authenticated-user-email`, …). Not self-contained; needs the proxy. | None in the test instance. |
| Audio capture | **None.** The recorder on `app/page.tsx` is a `setInterval` counting elapsed seconds. No `MediaRecorder`, no `getUserMedia`, no `AudioContext`, no WAV/PCM encoding. | `src/lib/audio-utils.ts` (MediaRecorder + 16kHz WAV encoding + 3-min cap + size limit) + `src/components/audio-recorder.tsx` (live level meter, drag-drop, playback). |
| Build scripts | 8 vendored scripts under `scripts/` (pnpm-install, run-framework, sites-env, execution-profile, build-verified) — Codex template plumbing. | None beyond the standard Next.js scripts. |

**One-line difference:** the user's codebase is a **platform starter** (Cloudflare + vinext + Drizzle D1 + ChatGPT auth + a giant component kit) with a **mock SautiSafe page**; the current app is a **working SautiSafe product** (real recorder, real Intron STT, real LLM extraction, real supervisor review, real benchmark) on a simpler Next.js + Prisma stack.

---

## 2. PWA implementation

**There is no PWA implementation.** Concretely:

- **No web manifest.** `rg -ni "manifest|webmanifest"` returns zero matches in source files (the only hits are `pnpm-lock.yaml` integrity hashes containing the substring `manifest`). `app/layout.tsx` (lines 110–136) exports `metadata` only; there is no `viewport` export, no `manifest` link, no `themeColor`, no `width=device-width`. Compare the current app's `src/app/layout.tsx` which already has `export const viewport: Viewport = { themeColor, width: "device-width", initialScale: 1 }` (lines 49–56).
- **No service worker.** `rg -ni "serviceWorker|service-worker|workbox|serwist|next-pwa|registerServiceWorker"` returns zero source matches. No `public/sw.js`, no `public/workbox-*.js`, no registration call anywhere. (The user's `public/` directory is not in the bundle, but nothing in `app/`, `components/`, `hooks/`, or `lib/` references one either.)
- **No install prompt.** `rg -ni "beforeinstallprompt|installPrompt|deferredPrompt"` → zero matches. No "Install app" button anywhere in the UI.
- **No update-notification logic.** No `controllerchange` listener, no `skipWaiting()`, no "Update available" toast.
- **No offline draft queue.** `rg -ni "IndexedDB|localStorage|sessionStorage|navigator\.onLine|syncManager|background.?sync"` → zero source matches (the only "draft" hit is `convex/reports.ts` line 8020 using `"draft"` as a status enum literal, and the `attachAudio` mutation at lines 8032–8042 that requires `report.status === "draft"`). There is no client-side persistence; nothing survives a refresh.
- **No mobile meta.** `app/globals.css` (lines 102–108) is a tiny stylesheet (`@import "tailwindcss"; @import "tw-animate-css"; @import "../vendor/shadcn-tailwind-4.13.0.css";` + 6 CSS vars). No `viewport-fit=cover`, no `env(safe-area-inset-*)` usage, no `theme-color` CSS.

**Verdict:** the user's codebase cannot contribute any PWA piece — manifest, service worker, offline queue, install prompt, or update flow — to the current app. The current app must build all of this itself. See §6 for a concrete plan.

---

## 3. Mobile-first patterns

The user's codebase is **desktop-first** with a mobile fallback, not mobile-first:

- **No bottom navigation.** `rg -ni "bottomNav|BottomNav"` → zero matches. The only navigation is the desktop sidebar in `app/page.tsx` (line 184: `<aside className="hidden … md:block">`) plus a sticky top header. On mobile the sidebar disappears entirely and there is no replacement nav — the user is left on a single page with no way to switch tabs.
- **No safe-area insets.** `rg -ni "safe-area|safeArea|env\(safe|inset|pb-safe|pt-safe|viewport-fit"` → all hits are shadcn dropdown/menu `inset` boolean props (e.g. `data-inset` at line 3161), not iOS safe-area insets. No `viewport-fit=cover`, no `env(safe-area-inset-bottom)`.
- **Touch targets are too small.** The sidebar `<Nav>` buttons (line 218) use `px-3 py-3` (≈36 px tall) — below the 44×44 px iOS minimum. The record button is large (good: `h-24 w-24` ≈ 96 px) but the "Transcribe with {provider}" button (line 202) is `px-5 py-3` ≈ 40 px tall.
- **Responsive layout is table-first.** The "Recent reports" table (line 211) has `min-w-[760px]` inside an `overflow-x-auto` wrapper — i.e. on mobile you get a horizontal scrollbar, not a card list. The current app's `reports-tab.tsx` already does a card/Sheet pattern that's far more mobile-friendly.
- **`useIsMobile` hook exists but is barely used.** `hooks/use-mobile.ts` (lines 8413–8432) is the standard shadcn hook (768 px breakpoint, `matchMedia`). It is imported in exactly ONE place: `components/ui/sidebar.tsx` line 6652, used at line 6713 to switch the Sidebar between fixed/offset modes. It is NOT used by `app/page.tsx` (the SautiSafe demo page) at all. The current app already has an identical `src/hooks/use-mobile.ts`.
- **The recorder UX is desktop-styled.** The big round record button (line 197: `h-36 w-36` outer, `h-24 w-24` inner) with `animate-ping` red ring is nice — but it's purely decorative because `toggleRecording` (lines 161–171) only flips a timer; there is no `MediaRecorder.start()` call, no audio chunk handling, no MIME selection, no fallback for `getUserMedia` being denied. The current app's `audio-recorder.tsx` already does all of this for real.

**Verdict:** the user's codebase has no mobile-first patterns worth merging. The current app's existing UX (max-w-5xl center column, sticky header with icon-only tabs on mobile, Sheet-based review drawer, sonner toasts) is already more mobile-friendly than the user's mock page.

---

## 4. Features worth merging

| # | Feature | Their approach (file:line) | Current app status | Merge? | Why |
|---|---|---|---|---|---|
| 1 | **`benchmarkCases` table** (case library with `caseCode`, `referenceTranscript`, `primaryLanguage`, `switchedLanguages`, `noiseCondition`, `speakerConsentRecorded`, `criticalTerms`, `expectedFactsJson`) | `convex/schema.ts:8136–8147` | Currently `SAMPLE_SCENARIOS` is hardcoded in `src/lib/safety.ts` and seeded per-run in the benchmark tab. | **maybe (post-deadline)** | Promoting scenarios to a real Convex table would let organisers curate the benchmark dataset without redeploying. Not a 2-day task; defer. |
| 2 | **`transcriptionRuns` table** (separate from reports: keyed by `audioAssetId` + `provider` + `model`, with `status`, `latencyMs`, `errorCode`, `errorMessageSafe`, `retryCount`, `detectedLanguages`) | `convex/schema.ts:8090–8107` | Current `convex/schema.ts` ties `transcripts` to `incidents` (one primary + per-provider), which is fine for the report flow but less clean for the benchmark flow. | **maybe (post-deadline)** | Cleaner data model for multi-provider benchmarking (a single audio can have N runs across providers without an incident). The current schema already supports benchmark lanes via `BenchmarkRun.resultsJson` so this is an optimisation, not a gap. Defer. |
| 3 | **`modelConfigs` table** (runtime provider config: `provider`, `model`, `enabled`, `timeoutMs`, `maxRetries`, `apiKeyRef`, `endpointRef`) | `convex/schema.ts:8161–8170` | Currently provider settings are env vars only (`INTRON_API_KEY`, `OPENAI_API_KEY`, etc.). | **skip** | Nice for an admin panel, but for a 2-day demo env vars are sufficient and the current `convex/actions/transcribe.ts` already reads them correctly. Adds attack surface (API keys in DB). |
| 4 | **`users` table with `role` enum** (`operator`/`supervisor`/`admin`) + `demoSessionId` | `convex/schema.ts:8058–8063`, used in `convex/reports.ts:8010–8028` | Current app has no auth at all (any visitor can see all tabs). | **skip for demo** | The current app deliberately shows operator + supervisor flows in one shell via a tab toggle. Adding real auth this late is risk without benefit. The `demoSessionId` pattern is interesting if a multi-user pilot happens later. |
| 5 | **`attachAudio` mutation** with explicit guards: `sizeBytes > 25 * 1024 * 1024` → throw, `!mimeType.startsWith("audio/")` → throw | `convex/reports.ts:8032–8042` | Current `/api/incidents` POST already validates MIME + size server-side. | **skip** | Already implemented; no incremental value. |
| 6 | **shadcn `attachment.tsx`** component (idle/loading/done/error file chip with horizontal/vertical orientation, 3 sizes) | `components/ui/attachment.tsx:816–1022` | Current recorder shows uploaded-audio state with a plain inline card (`report-tab.tsx`). | **maybe (low priority)** | Nicer attachment UX, but imports `radix-ui` umbrella `Slot` and `@shadcn/react` registry — needs rewrite to `@radix-ui/react-slot` for the current app. ~200 lines of porting for marginal UX gain. |
| 7 | **shadcn `empty.tsx`** (empty-state primitive: `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription`/`EmptyContent`) | `components/ui/empty.tsx:3931–4037` | Current reports list when empty shows nothing pretty. | **maybe (low priority)** | Pure-CSS component (only `cn` + `cva` deps), no primitive-layer mismatch — would actually drop in cleanly. ~100 lines. Could improve the empty Reports tab and empty Benchmark history. |
| 8 | **shadcn `bubble.tsx` + `message.tsx` + `message-scroller.tsx`** (chat bubble UX with variants default/secondary/muted/tinted/outline/ghost/destructive, align start/end, reactions slot) | `components/ui/bubble.tsx:1298–1425`, `components/ui/message.tsx:5521+`, `components/ui/message-scroller.tsx:5388+` | Current follow-up Q&A in `report-tab.tsx` uses simple labeled textareas. | **skip** | The follow-up UX is one question + one answer per field — not a free-form chat. A bubble UI would over-imply conversational AI the app doesn't have. Also requires `radix-ui` umbrella rewrite. |
| 9 | **shadcn `native-select.tsx`** (styled `<select>` for mobile — better touch UX than Radix Select on small screens) | `components/ui/native-select.tsx:5616–5680` | Current app uses Radix `Select` for the language picker. | **maybe (low priority)** | Native `<select>` is genuinely better on mobile (uses OS picker sheet). Pure-CSS component, should drop in cleanly. ~65 lines. Worth considering for the language pickers on the Report + Benchmark tabs. |
| 10 | **shadcn `field.tsx` + `input-group.tsx`** (form-field layout primitive: label/description/error + input wrapper) | `components/ui/field.tsx:4038–4288`, `components/ui/input-group.tsx:4506–4678` | Current report form uses raw `Label` + `Input` + manual error text. | **maybe (low priority)** | Would tighten the structured-report editor. Requires `radix-ui` umbrella rewrite. |
| 11 | **shadcn `combobox.tsx`** (searchable select with command palette) | `components/ui/combobox.tsx:2592–2904` | Current language picker is a 10-item `<Select>` — fine. | **skip** | Overkill for a 10-item language list. |
| 12 | **`app/page.tsx` demo page** (teal `#173f2c` palette, "Code-switch ready" hero card, "Before you record" tips, recent-reports table) | `app/page.tsx:139–220` | Current `src/app/page.tsx` + tabs are far more functional. | **skip** | Visual design is nice but the current app already has a coherent teal/amber/red safety theme and a fully wired Report/Reports/Benchmark/About flow. The user's page is a static mock. No incremental value. |
| 13 | **ChatGPT auth scaffolding** (`getChatGPTUser`, `requireChatGPTUser`, sign-in/sign-out/callback path helpers) | `app/chatgpt-auth.ts:9–100` | None. | **skip** | Depends on an upstream proxy injecting `oai-authenticated-user-*` headers; not portable to the current standalone Next.js app without that proxy. Wrong fit for the demo. |
| 14 | **vinext + Cloudflare Workers build pipeline** (`vite.config.ts`, `build/sites-vite-plugin.ts`, 8 `scripts/*` files) | `vite.config.ts:19684+`, `scripts/*` | Current app uses plain `next dev`/`next build`. | **skip** | Solves a different deployment problem (run Next on Workers). Adds massive complexity (vinext beta, wrangler, D1/R2 bindings) for zero demo value. |
| 15 | **Drizzle D1 schema** | `db/schema.ts:8284–8288` (empty: `export {};`) | Current app uses Prisma on SQLite. | **skip** | Empty. No value. |
| 16 | **Convex `transcribe` action** | `convex/transcription.ts:8183–8255` | Current `convex/actions/transcribe.ts` already does this **better** — real Intron sync→503→async-poll path, per-provider env-var-missing throws, no silent fallback, latency measured around the HTTP call. | **skip** | The user's `callProvider` is a simpler 60s-timeout `fetch` with no Intron sync/async distinction, no 503→poll recovery. The current convex supersedes it. |
| 17 | **Convex `reports.ts` mutations** (`createDemoReport`, `generateUploadUrl`, `attachAudio`, `recent`) | `convex/reports.ts:8006–8047` | Current `convex/incidents.ts` + `convex/audio.ts` cover the same ground with stronger safeguards (consent gate, referenceNo uniqueness, audit trail, manual cascade). | **skip** | Current convex is a strict superset. |
| 18 | **`useIsMobile` hook** | `hooks/use-mobile.ts:8413–8432` | Current `src/hooks/use-mobile.ts` is identical (same 768 px breakpoint, same `matchMedia`). | **skip** | Already present. |

**Bottom line on §4:** only items **#1, #2, #7, #9** are even "maybe" worth touching, and of those only **#7 (`empty.tsx`) and #9 (`native-select.tsx`)** could realistically land before the 2-day deadline because they're pure-CSS (no `radix-ui` umbrella rewrite). The Convex schema patterns (#1, #2) are good ideas for the post-deadline production hardening pass but not for the demo.

---

## 5. Things to SKIP (explicit)

- **The entire vinext + Cloudflare Workers + Drizzle D1 platform layer** (`vite.config.ts`, `build/sites-vite-plugin.ts`, `cloudflare-env.d.ts`, `db/index.ts`, `drizzle.config.ts`, `drizzle/meta/*`, all 8 `scripts/*.mjs`/`.sh`). It's the Codex "site-creator" template plumbing and has nothing to do with SautiSafe's product needs. Porting it would replace the working Next.js + Prisma + SQLite setup with a beta framework on a different runtime — catastrophic risk 2 days before deadline.
- **`app/chatgpt-auth.ts`** — depends on an upstream header-injecting proxy that the current app doesn't have.
- **`app/page.tsx`** — a static mock; the current app's tabs are strictly more functional.
- **The user's `convex/` folder** (4 files) — the current `convex/` folder (11 files) is a strict superset with real Intron sync→503→poll wiring, the `extract` action, the safety-aware system prompt, and `lib/metrics.ts`. Replacing the current convex with the user's would be a regression.
- **Most of the 61 `components/ui/*` files** — the current app already has equivalents for the 37 it uses. The 24 extras are either redundant (`accordion`, `breadcrumb`, `calendar`, `carousel`, `chart`, `command`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `pagination`, `popover`, `resizable`, `sidebar`, `table` — all already present) or non-portable without rewriting `radix-ui` umbrella imports.
- **The vendored `vendor/shadcn-tailwind-4.13.0.css`** (1900 lines) — the current app's `globals.css` already defines its own SautiSafe safety palette (teal primary, amber accent, red destructive, `.bg-safety-grid`, `.bg-hivis-stripes`, `.animate-rec-pulse`, `.scroll-thin`). Replacing it would lose the theme.
- **The 9,525-line `pnpm-lock.yaml`** — irrelevant.

---

## 6. Concrete merge plan (ordered)

Because the user's codebase contributes nothing to the actual PWA gap, this plan is **what the current Next.js app should build itself** for the 2-day mobile-first deadline, with the few salvageable pieces from the user's codebase noted where relevant.

### A. PWA shell (HIGHEST priority — ~2–3 hours)

1. **`/home/z/my-project/public/manifest.webmanifest`** — new file. Fields:
   ```json
   {
     "name": "SautiSafe — Industrial Voice Reporting",
     "short_name": "SautiSafe",
     "description": "Code-switched voice reporting for industrial safety incidents.",
     "start_url": "/",
     "scope": "/",
     "display": "standalone",
     "orientation": "portrait",
     "background_color": "#0f7a73",
     "theme_color": "#0f7a73",
     "categories": ["productivity", "business", "health"],
     "icons": [
       { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
       { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
       { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
     ]
   }
   ```
   Generate the three PNGs from the existing `src/app/icon.svg` (shield + soundwave) — any image tool. Add `<link rel="manifest" href="/manifest.webmanifest">` to `src/app/layout.tsx` `metadata.manifest` field.
2. **`/home/z/my-project/public/sw.js`** — minimal service worker. Strategy: **network-first for navigations + API calls, cache-first for static assets**, with a runtime cache for the app shell. Don't pull Workbox (adds a build step); write ~60 lines of vanilla SW using the Cache Storage API. Precache `/`, `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`. On `fetch`, for `mode: "navigate"` try network then fall back to cached `/`; for same-origin GETs under `/_next/static/` cache-first; for `POST /api/*` don't intercept (let it fail offline — the draft queue in step B handles it).
3. **Register the SW** in a new `src/lib/register-sw.ts` client component, mounted in `src/app/layout.tsx` body: `if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"))`. Guard with `process.env.NODE_ENV === "production"` so dev isn't cached.
4. **Update-available toast** in the same registrar: listen for `navigator.serviceWorker.addEventListener("controllerchange", …)` and `reg.addEventListener("updatefound", …)`. When a new SW takes over, show a sonner toast "SautiSafe updated — reload" with a button calling `window.location.reload()`.
5. **Install prompt** — new `src/components/install-prompt.tsx`. Listen for `beforeinstallprompt`, stash the `event` in a Zustand slice, show a small "Install SautiSafe" button in the header (next to `ModeToggle`) when the event is available; call `event.prompt()` on click. Also handle `appinstalled` to hide the button.

### B. Offline draft queue (HIGH priority — ~2 hours)

6. **`src/lib/drafts-store.ts`** — new module. Use **IndexedDB** (not localStorage — audio Blobs are too big for the 5 MB localStorage quota) via a thin `idb-keyval`-style wrapper (or hand-rolled, ~40 lines). Schema: object store `drafts` keyed by a UUID, value `{ id, audioBlob, audioName, mimeType, durationMs, language, consentConfirmedAt, createdAt, status: "queued"|"submitting"|"failed" }`. Methods: `putDraft`, `listDrafts`, `getDraft`, `deleteDraft`, `onDraftsChange(cb)`.
7. **`src/hooks/use-drafts.ts`** — TanStack Query hook: `useDrafts()` lists drafts, `useSubmitDraft()` calls `/api/incidents` and on success deletes the draft, on failure marks `status:"failed"` and leaves it for retry.
8. **Wire into `report-tab.tsx`**: when the user finishes recording + the structured report is ready but `/api/incidents` POST fails (or `!navigator.onLine`), write a draft to IndexedDB instead of throwing. Show a toast "Saved offline — will submit when back online".
9. **Background sync on reconnect**: in `report-tab.tsx` mount a `useEffect` that listens to `window.addEventListener("online", …)` and re-runs `useSubmitDraft` for all `status:"queued"` drafts. (Service Worker Background Sync API is more robust but iOS doesn't support it — the `online` event + a retry-on-app-focus pattern covers iOS.)
10. **Drafts list UI**: add a small "Offline drafts (N)" badge in the Reports tab header that opens a Sheet listing pending/failed drafts with a "Retry now" button each. This is the single most defensible "mobile-first / works offline" feature for the demo.

### C. Mobile-first UX polish (MEDIUM priority — ~1–2 hours)

11. **Bottom navigation** for `< sm` — in `src/components/app-shell.tsx`, render the existing tab buttons in the sticky footer (currently the emergency-procedures notice) for `sm:hidden`, and hide the header nav for `sm:hidden`. Use `min-h-[56px]` (≥44 px touch target with padding), `grid grid-cols-4`, fixed bottom, `pb-[env(safe-area-inset-bottom)]`. Move the emergency-procedures notice to be `hidden sm:flex` in the footer (still visible on desktop). This is the single biggest "mobile-first" visual win.
12. **Safe-area insets** — add `viewport-fit=cover` to the existing `viewport` export in `src/app/layout.tsx` (line 49), and add `padding-bottom: env(safe-area-inset-bottom)` to the new bottom nav and to the sticky footer.
13. **Touch targets** — bump the recorder's secondary buttons (Transcribe, Submit, Retry) from `py-3` (≈40 px) to `py-3.5` (≈44 px) for the demo.
14. **(Optional, from user codebase §4 #9)** — port `components/ui/native-select.tsx:5616–5680` (pure CSS, ~65 lines) to `src/components/ui/native-select.tsx` and swap the language `<Select>` in `report-tab.tsx` and `benchmark-tab.tsx` to it on mobile. Native `<select>` opens the OS picker sheet — much better UX than Radix Select's popover on a phone. This is the one piece from the user's codebase that drops in cleanly and improves mobile UX.

### D. Salvage from user codebase (LOW priority — only if time allows)

15. **(Optional, from §4 #7)** — port `components/ui/empty.tsx:3931–4037` (pure CSS, ~100 lines) to `src/components/ui/empty.tsx`. Use it for the empty Reports list ("No incidents yet — record the first one") and the empty Benchmark history ("No benchmark runs yet"). Small polish, no risk.
16. **(Post-deadline, from §4 #1+#2)** — for the production Convex migration, consider adding `benchmarkCases` and `transcriptionRuns` tables per the user's `convex/schema.ts:8090–8147` design. The current `convex/schema.ts` works but couples transcripts to incidents; the user's decomposition is cleaner for benchmarking. Document this as a follow-up in `convex/MIGRATION.md`, do not implement now.

### E. Out of scope for this review (per task brief)

- No modifications to `src/`, `convex/`, or `prisma/` source files.
- No `npm install`, no build, no lint, no dev server, no cron.

---

## Appendix: file inventory of the user's codebase (99 files)

| Area | Files | Notes |
|---|---|---|
| SautiSafe product code | `app/page.tsx` (1 file, 78 lines) | Static mock. The ONLY SautiSafe-specific file in the bundle. |
| SautiSafe Convex backend | `convex/reports.ts`, `convex/schema.ts`, `convex/transcription.ts`, `convex/transcriptionData.ts` (4 files, ~260 lines total) | Thinner than the current `convex/` (11 files). Different table decomposition. See §4 #1–#5, #16–#17. |
| Codex platform layer | `app/chatgpt-auth.ts`, `app/globals.css`, `app/layout.tsx`, `build/sites-vite-plugin.ts`, `cloudflare-env.d.ts`, `db/index.ts`, `db/schema.ts`, `drizzle/*`, `next.config.ts`, `vite.config.ts`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`, `next-env.d.ts`, `components.json`, `package.json`, 8 `scripts/*` files, `pnpm-lock.yaml` (~20 files) | Site-creator-vinext-starter template. SKIP all. |
| shadcn/ui kit | 61 `components/ui/*.tsx` files | "new-york" style on `radix-ui` umbrella + `@base-ui/react` + `@shadcn/react`. 37 of these have current-app equivalents; 24 are extras (mostly redundant or non-portable). See §4 #6–#11. |
| Vendored CSS | `vendor/shadcn-tailwind-4.13.0.css` (1 file, ~1900 lines) | Skip — current app has its own theme. |
| Examples | `examples/d1/app/api/notes/route.ts`, `examples/d1/db/schema.ts` (2 files) | D1 demo code. Skip. |
| Hooks / utils | `hooks/use-mobile.ts`, `lib/utils.ts` (2 files) | Already present in current app. |
