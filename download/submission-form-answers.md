# SautiSafe submission form - draft answers

These are written to fit the approximate limits shown in the form. Recheck the portal counters after pasting.

## 1. Problem addressed (~50 words)

Industrial safety reports are often delayed or incomplete because workers must stop work, write formal English, or translate what they witnessed. Important details can be lost when people naturally mix English with local languages. SautiSafe makes reporting faster while preserving the worker's original voice and safety context.

## 2. Target users and potential impact (~50 words)

SautiSafe serves factory, construction, warehouse, utility, and field workers who speak English alongside Luganda, Swahili, or other African languages. Supervisors and safety officers receive clearer, reviewable reports. It can support organisations ranging from one worksite to distributed operations with hundreds or thousands of workers.

## 3. How the app solves the problem (~50 words)

A worker records or uploads a natural voice report. SautiSafe transcribes code-switched speech, identifies safety details, asks focused questions when information is missing, and routes a structured report to a supervisor. The original audio, editable transcript, urgency cues, review decision, and audit trail remain linked for verification.

## 4. Code-switching

Yes.

## 5. Sahara APIs

Yes.

## 6. Agentic behaviour and downstream task (~50 words)

The transcript starts a guided reporting workflow. SautiSafe extracts the location, equipment, hazard, people affected, immediate action, injury status, and severity; identifies missing information; asks targeted follow-up questions; flags supported urgent evidence; and prepares a supervisor-reviewable incident record. Human review remains mandatory for safety decisions.

## 7. High-level technical overview (~250 words)

SautiSafe is a mobile-first Next.js progressive web app with Convex handling data, file storage, and server-side model calls. Three design choices shaped the system.

First, audio is stored once and the same recording is sent to Sahara, Whisper, and Gemini. This makes comparisons fair and lets supervisors replay the source. The tradeoff is storage and processing cost, so file size and recording duration are limited.

Second, model output is never treated as final. The original audio, primary transcript, alternative transcripts, structured fields, follow-up answers, and audit events stay linked. Supervisors can correct the transcript and make workflow decisions. This adds a review step but prevents automation from declaring equipment safe.

Third, provider calls run in protected Convex actions. Browser code receives no provider credentials, and one model is never silently substituted for another. A provider failure is recorded honestly. This improves benchmark integrity but means partial results can appear during external outages.

The app also uses an offline IndexedDB draft queue because field connectivity is unreliable. Drafts retry when the device reconnects, while submitted reports use Convex's real-time queries. The PWA improves access on ordinary phones without requiring an app-store installation.

Benchmarking uses manually verified references, WER, CER, safety-critical-term recall, latency, and provider completion rate. Results are separated by language profile and failed calls are not disguised as transcription scores. The architecture favours traceability and human control over fully automatic decisions, which is appropriate for a safety-reporting aid.

## 8. Ethics, safety and inclusion (~100 words)

Recording requires explicit consent, and anonymous reporting is supported to reduce retaliation risk. Provider credentials remain server-side. Audio and transcripts are retained together for verification and can be deleted through the reporting workflow. Public benchmark audio requires separate sharing consent and is de-identified. SautiSafe is not an emergency service, never replaces site procedures, and never declares equipment safe. Urgency cues are evidence-based aids for supervisors, not automatic operational decisions. Human review, editable transcripts, transparent provider failures, and an audit trail reduce harm from transcription or extraction errors while supporting workers who communicate most naturally through code-switching.

## Suggested GitHub documentation link

Link judges directly to `docs/BENCHMARK_PROTOCOL.md` in the public repository, and include the repository root separately if the form provides a code or supporting-materials field.

