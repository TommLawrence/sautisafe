# Intron Voice API — Implementation-Ready Spec (for SautiSafe)

> **Source:** Extracted from the official Intron Voice docs (`https://docs.voice.intron.io/docs/...`)
> rendered as Mintlify server-rendered React HTML. The user-uploaded bundle in
> `/home/z/my-project/upload/` contained 13 HTML pages; five of them
> (`upload-file.html`, `upload-file-sync.html`, `upload-text.html`,
> `get-text-status.html`, `widget-integration.html`) rendered as **404 stubs**
> in the bundle. Their live content was cross-referenced from
> `https://docs.voice.intron.io/docs/stt/...` etc. so the spec below is
> complete. Every code block labelled *verbatim* is reproduced byte-for-byte
> from the rendered `<pre>` elements; anything labelled *reconstructed* is
> pieced together from the parameter tables and prose and marked as such.
>
> **Anything that is genuinely not documented in the official docs is marked
> `not documented`** — SautiSafe must not guess.

---

## 1. Overview & Auth

| Item | Value |
|---|---|
| **Base URL (REST)** | `https://infer.voice.intron.io` |
| **Base URL (WebSocket)** | `wss://infer.voice.intron.io` |
| **Developer console (get API key)** | `https://voice.intron.io` → Developers tab (`https://voice.intron.io/v2/developers`) |
| **Auth scheme** | HTTP Bearer. Header: `Authorization: Bearer YOUR_API_KEY`. Required on **every** REST and WS request. |
| **Other required headers** | REST STT/TTS endpoints need `Content-Type` (`multipart/form-data` for STT, `application/json` for TTS). No other custom headers documented (no `x-` request-id, no `Idempotency-Key`). |
| **Rate limit response** | Rate-limit info is returned in **response headers** including `Retry-After: <delay-seconds>`. Specific named headers beyond `Retry-After` are not documented. |
| **Support email** | `voice@intron.io` |
| **Key features (from docs)** | African Accent Optimization; Multiple Industries (healthcare, call centers, legal, biometrics); Real-time & Batch Processing; Secure & Scalable. |

### Per-endpoint rate limits (verbatim from the "Rate Limits" section of each page)

| Endpoint | Rate limit |
|---|---|
| `POST /file/v1/upload` (async STT) | **60 requests / minute** |
| `GET /file/v1/status/{file_id}` (STT poll) | **100 requests / minute** |
| `POST /file/v1/upload/sync` (sync STT) | **30 requests / minute** |
| `POST /tts/v1/enqueue` (async TTS) | **60 requests / minute** |
| `GET /tts/v1/status/{text_id}` (TTS poll) | **100 requests / minute** |
| `POST /tts/v1/generate` (sync TTS) | **30 requests / minute** |
| `wss://.../stt/v1/stream` (streaming STT) | Per-session runtime limits (see §4) |
| `wss://.../tts/v1/stream` (streaming TTS) | Per-session runtime limits (see §7c) |

All rate-limited endpoints include `Retry-After: (delay-seconds)` in the response headers when the limit is hit.

---

## 2. STT — Async File Upload (`POST /file/v1/upload`)

> Verbatim from `https://docs.voice.intron.io/docs/stt/file-upload`. Files are
> processed asynchronously; retrieve results with `GET /file/v1/status/{file_id}`
> (§2b). For real-time transcription the docs explicitly recommend the Widget
> Integration (§8) instead of polling.

### Endpoint

```
POST https://infer.voice.intron.io/file/v1/upload
```

### Auth & headers (verbatim table)

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer YOUR_API_KEY` | Yes |
| `Content-Type` | `multipart/form-data` | Yes |

### Supported input audio formats (verbatim)

| Format | Extension |
|---|---|
| WAV | `.wav` |
| MP3 | `.mp3` |
| MP4 | `.mp4` |
| M4A | `.m4a` |
| OGG | `.ogg` |
| WebM | `.webm` |
| FLAC | `.flac` |

> **Max file size:** `not documented` per file. SautiSafe's own 25 MB client
> ceiling (see `convex/audio.ts`) should be the gating constraint; verify the
> real ceiling on first integration.

### Request body — `multipart/form-data`

#### Core fields (verbatim table)

| Field | Type | Description | Required | Options | Default |
|---|---|---|---|---|---|
| `audio_file_name` | String | non-unique file name | yes | – | – |
| `audio_file_blob` | String | URL to a readable file (curl form: `@"/path/to/file.wav"`) | yes | – | – |
| `use_language_asr_input` | String | set the input language code (see §5) | yes | see supported languages | – |
| `use_diarization` | String | get the transcript text as a diarized response | no | `TRUE` \| `FALSE` | – |
| `use_template_id` | String | use a custom prompt id for the transcript post-processing | no | – | – |
| `use_category` | String | set the category of post-processing to use on the file | no | `file_category_general` \| `file_category_telehealth` \| `file_category_procedure` \| `file_category_call_center` \| `file_category_legal` \| `file_category_meeting_notes` | `file_category_telehealth` |
| `use_disable_llm_corrections` | String | disable LLM corrections on the transcript for lower latency | no | `TRUE` \| `FALSE` | `FALSE` |

#### Per-category `get_*` post-processing flags

All `get_*` flags are `String`, optional, options `TRUE | FALSE`, default `FALSE`. The full
set across categories (verbatim field names from the docs):

| Category | Available `get_*` flags |
|---|---|
| **General** (any category) | `get_answer`, `get_summary` |
| **Telehealth** | `get_answer`, `get_summary`, `get_entity_list`, `get_treatment_plan`, `get_soap_note`, `get_clerking`, `get_icd_codes`, `get_suggestions`, `get_differential_diagnosis`, `get_followup_instructions`, `get_practice_guidelines` |
| **Procedure** | `get_answer`, `get_summary`, `get_entity_list`, `get_treatment_plan`, `get_op_note`, `get_icd_codes`, `get_suggestions` |
| **Call center** | `get_answer`, `get_summary`, `get_call_center_results`, `get_call_center_agent_score`, `get_call_center_agent_score_category`, `get_call_center_product_info`, `get_call_center_product_insights`, `get_call_center_compliance`, `get_call_center_feedback`, `get_call_center_sentiment` |
| **Legal** | `get_answer`, `get_legal_court_hearing` |
| **Meeting notes** | `get_answer`, `get_summary`, `get_meeting_notes_participants`, `get_meeting_notes_decisions`, `get_meeting_notes_action_items`, `get_meeting_notes_key_topics`, `get_meeting_notes_next_steps` |

> **`get_answer` is category-independent.** Verbatim from the docs:
> *"The `get_answer` option is category-independent and works across every
> supported language. When `get_answer` is `TRUE`, the transcript is treated as
> a spoken question and only the answer (`transcript_answer`) is returned — all
> other post-processing options are ignored. The answer is produced in the
> language of the question unless `use_language_data_extraction_output`
> specifies another language."*

### Verbatim curl examples

Minimal English (verbatim):
```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="myfile"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/file.wav"' \
  --form 'use_language_asr_input="en"'
```

Minimal Swahili (verbatim — confirms `sw` is a valid input code):
```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="myfile"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/file.wav"' \
  --form 'use_language_asr_input="sw"'
```

General category + summary (verbatim):
```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="my_file_2"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/file.wav"' \
  --form 'use_language_asr_input="en"' \
  --form 'use_category="file_category_general"' \
  --form 'get_summary="TRUE"'
```

Custom template id (verbatim):
```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="my_file_2"' \
  --form 'use_template_id="a3f32e46-afa4-42cb-9155-522dcf9xyxyxd"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/file.wav"'
```

(Telehealth, procedure, call-center, legal, meeting-notes variants are
documented in the source page — same shape, different `use_category` + the
relevant `get_*` flags.)

### Response (on upload)

> **`not documented` as a rendered JSON sample** — the docs page has a tab
> labelled "Response on upload" but Mintlify did not server-render the JSON
> body into the static HTML. Based on the parameter table description
> ("the file id generated in response when the file was queued") and the
> status enum from the Get File Status page, the **reconstructed** shape is:
```json
{
  "data": {
    "file_id": "<uuid>",
    "processing_status": "FILE_QUEUED",
    "audio_file_name": "myfile",
    "use_language_asr_input": "en"
  },
  "message": "<human-readable status>",
  "status": "Ok"
}
```
SautiSafe **must** persist `data.file_id` and immediately start polling the
status endpoint (§2b) — confirm exact field names on first integration.

---

## 2b. STT — Async Status Polling (`GET /file/v1/status/{file_id}`)

> Verbatim from `https://docs.voice.intron.io/docs/stt/file-status`.

### Endpoint

```
GET https://infer.voice.intron.io/file/v1/status/{file_id}
```

### Path variables (verbatim table)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_id` | string | Yes | the file id generated in response when the file was queued |

### Query parameters (verbatim table)

| Parameter | Type | Required | Description | Default | Options |
|---|---|---|---|---|---|
| `get_structured_post_processing` | string | No | if `t` the post-processed results will be structured as JSON, else it will be a MarkDown-formatted text | `f` | `f` \| `t` |

### Verbatim curl

```bash
curl --location 'https://infer.voice.intron.io/file/v1/status/file-id' \
  --header 'Authorization: Bearer my-api-key'
```

### File processing status enum (verbatim list)

| Status | Meaning |
|---|---|
| `FILE_QUEUED` | File accepted, waiting to be picked up by worker |
| `FILE_PENDING` | Pending processing |
| `FILE_PROCESSING` | Actively transcribing |
| `FILE_TRANSCRIBED` | Complete — transcript is available |
| `FILE_PROCESSING_FAILED` | Transcription failed |

### Response shape

> **`not documented` as a rendered JSON sample** in the static HTML (Mintlify
> lazy-loads the "Response when file processing in-progress" and "Response when
> file processing completed" tabs client-side). The completion shape is
> **reconstructed** from the verbatim sync-upload completion response (§3 —
> same backend) plus the response envelope used everywhere else in the API:

In-progress (reconstructed):
```json
{
  "data": {
    "file_id": "<uuid>",
    "processing_status": "FILE_PROCESSING",
    "audio_file_name": "myfile",
    "use_language_asr_input": "en"
  },
  "message": "file status found",
  "status": "Ok"
}
```

Completed (reconstructed from the sync-upload verbatim sample):
```json
{
  "data": {
    "file_id": "12a9760f-b165-4404-91d0-a65d4cdt78fs",
    "processing_status": "FILE_TRANSCRIBED",
    "audio_file_name": "myfile",
    "audio_transcript": "hello world",
    "processed_audio_duration_in_seconds": 20,
    "use_language_asr_input": "en"
  },
  "message": "file status found",
  "status": "Ok"
}
```

> When `get_structured_post_processing=t` and `use_category`/`get_*` flags were
> set on the upload, the `data` object additionally carries the post-processed
> fields (`transcript_summary`, `transcript_answer`, etc.) as JSON instead of
> markdown. **Field names for the structured post-processing output are not
> enumerated in the docs** — confirm on first integration.

### Latency expectations

Not documented beyond the rate limit. SautiSafe should poll at most every
~3–5 s and cap total wait at 120 s (the sync endpoint times out at 120 s,
which suggests the backend targets <120 s for typical files).

### Rate limits (verbatim)

100 requests / minute. Rate-limit headers (`Retry-After`) included in response.

---

## 3. STT — Sync File Upload (`POST /file/v1/upload/sync`)

> Verbatim from `https://docs.voice.intron.io/docs/stt/file-upload-sync`.

### Endpoint

```
POST https://infer.voice.intron.io/file/v1/upload/sync
```

### Documented limits

- **Max audio duration: ≤ 120 seconds** (verbatim: *"This endpoint only supports files durations less than or equal to 120 seconds"*).
- **Sync request timeout: 120 s** → returns HTTP **503** with a `file_id` in the body; that `file_id` can be polled via `GET /file/v1/status/{file_id}` (§2b).

### Headers & form-data fields

Identical to async upload (§2): headers `Authorization` + `Content-Type: multipart/form-data`; form fields `audio_file_name`, `audio_file_blob`, `use_language_asr_input`, `use_diarization`, `use_template_id`, `use_category`, `use_disable_llm_corrections`, plus the same per-category `get_*` flags. Supported formats: WAV/MP3/MP4/M4A/OGG/WebM/FLAC.

### Verbatim curl — English

```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload/sync' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="myfile"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/file.wav"' \
  --form 'use_language_asr_input="en"'
```

### Verbatim curl — Swahili

```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload/sync' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="myfile"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/file.wav"' \
  --form 'use_language_asr_input="sw"'
```

### Verbatim response — HTTP 200 (English transcript)

```json
{
    "data": {
        "file_id": "12a9760f-b165-4404-91d0-a65d4cdt78fs",
        "processing_status": "FILE_TRANSCRIBED",
        "audio_file_name": "myfile",
        "audio_transcript": "hello world",
        "processed_audio_duration_in_seconds": 20,
        "use_language_asr_input": "en"
    },
    "message": "file status found",
    "status": "Ok"
}
```

### Verbatim response — HTTP 200 (Swahili transcript)

```json
{
    "data": {
        "file_id": "12a9760f-b165-4404-91d0-a65d4cdt78fs",
        "processing_status": "FILE_TRANSCRIBED",
        "audio_file_name": "myfile",
        "audio_transcript": "habari dunia",
        "processed_audio_duration_in_seconds": 20
    },
    "message": "file status found",
    "status": "Ok"
}
```

### Response tabs mentioned but not rendered in static HTML

- `Response (200)` — verbatim above
- `Response (400), max audio duration` — shape `not documented`; the 400 fires when audio > 120 s
- `Response (503), processing time-out` — shape `not documented`; carries a `file_id` for follow-up polling

### Rate limit

30 requests / minute. `Retry-After` returned in headers.

### Notes for SautiSafe

- Use sync for **SautiSafe's worker report flow** (typical recording ≪ 120 s).
- Cap client-side at the existing 3-minute MediaRecorder limit and slice to ≤120 s before upload — the docs hard-cap sync at 120 s.
- A 503 is **not** an error to retry on a different model (SautiSafe's "no silent fallback" rule): treat 503 by extracting `file_id` and continuing to poll §2b.

---

## 4. STT — Streaming (`wss://infer.voice.intron.io/stt/v1/stream`)

> Verbatim from `https://docs.voice.intron.io/docs/stt/streaming`.

### Protocol

**WebSocket** (not HTTP chunked, not SSE). Connect once, stream audio chunks
as **base64-encoded PCM16 little-endian** inside JSON messages, receive
partial transcripts as they become available, and send a `COMMIT` message to
receive the final transcript.

### Endpoint

```
wss://infer.voice.intron.io/stt/v1/stream
```

### Auth (for the WS handshake)

```
Authorization: Bearer YOUR_API_KEY
```
The header is sent on the HTTP upgrade request. On failure the server sends
an `AUTHENTICATION_ERROR` message and closes the connection (see Errors below).

### Runtime limits (verbatim)

- Max session lifetime: **300 seconds**
- Max idle audio gap: **60 seconds**
- Min chunk size: **1 KB**
- Max chunk size: **32 KB**

### Connection query parameters (verbatim table)

| Parameter | Type | Description | Required | Default |
|---|---|---|---|---|
| `use_language_asr_input` | String | Input language code (see §5) | Yes | – |
| `sample_rate` | Integer | Input audio sample rate in Hz | No | `16000` |
| `bit_rate` | Integer | Input PCM bit depth | No | `16` |
| `num_channels` | Integer | Number of input channels | No | `1` |

### Verbatim handshake example (wscat)

```bash
wscat -c 'wss://infer.voice.intron.io/stt/v1/stream?sample_rate=16000&bit_rate=16&num_channels=1&use_language_asr_input=en' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

### Input messages

#### `INPUT_AUDIO_CHUNK` (verbatim table)

| Field | Type | Required | Description |
|---|---|---|---|
| `message_type` | String | Yes | Must be `INPUT_AUDIO_CHUNK` |
| `audio_base_64` | String | Yes | Base64 encoded PCM16 little-endian audio bytes |
| `ack_id` | Integer | No | Client chunk sequence ID echoed by server ACK |

Verbatim JSON:
```json
{
  "message_type": "INPUT_AUDIO_CHUNK",
  "audio_base_64": "<base64_pcm16_chunk>",
  "ack_id": 1
}
```

#### `COMMIT` (verbatim table)

| Field | Type | Required | Description |
|---|---|---|---|
| `message_type` | String | Yes | Must be `COMMIT` |

Verbatim JSON:
```json
{ "message_type": "COMMIT" }
```

### Response messages

#### `SESSION_CREATED` (verbatim)
> *"Sent immediately after successful authentication, capacity checks, and quota checks."*
```json
{
  "message_type": "SESSION_CREATED",
  "session_id": "12a9760f-b165-4404-91d0-a65d4cdt78fs",
  "credit_balance": 120.0,
  "configs": {
    "sample_rate": 16000,
    "bit_rate": 16,
    "num_channels": 1,
    "use_prompt_id": null,
    "use_language_asr_input": "en",
    "use_language_asr_output": "en"
  }
}
```
> Note: the configs object also surfaces `use_language_asr_output` (default = the input language) and `use_prompt_id` — but the docs do **not** document corresponding request-side parameters to set these. **`not documented`** — verify whether the WS query string accepts them.

#### `AUDIO_CHUNK_ACK` (verbatim)
```json
{ "message_type": "AUDIO_CHUNK_ACK", "chunk_id": 1, "total_chunks": 1 }
```

#### `PARTIAL_TRANSCRIPT` (verbatim)
> *"Sent whenever a new partial transcript is available and differs from the last partial transcript already sent on the connection."*
```json
{ "message_type": "PARTIAL_TRANSCRIPT", "transcript": "patient reports intermittent chest pain" }
```

#### `COMMITTED_TRANSCRIPT` (verbatim)
> *"Sent after the client sends COMMIT and the backend finishes processing the full stream. This is the final transcript payload for the session."*
```json
{
  "message_type": "COMMITTED_TRANSCRIPT",
  "transcript_id": "e1c4a90b-e319-4de6-9f22-0e0cf5e8b7a2",
  "transcript_text": "patient reports intermittent chest pain for two days",
  "audio_len": 10
}
```

### Error / terminal messages (verbatim JSON examples)

| `message_type` | Trigger | Sample payload |
|---|---|---|
| `ERROR` | unexpected server-side failures | `{ "message_type": "ERROR", "message": "connection error" }` |
| `INPUT_ERROR` | malformed JSON / invalid structure | `{ "message_type": "INPUT_ERROR", "message": "Invalid data structure for commit audio request" }` (also: `"Commit request already received, cannot accept more audio chunks"`, `"Invalid data structure for audio chunk"`, `"Invalid base64 audio payload"`, `"Invalid PCM-16 payload length"`, `"no data received"`, `"invalid input message_type received"`, `"invalid input data"`, `"Error processing datas"`) |
| `AUTHENTICATION_ERROR` | missing/invalid Authorization | `{ "message_type": "AUTHENTICATION_ERROR", "message": "permission denied,access-key error" }` — server closes after sending |
| `RESOURCE_EXHAUSTED` | no service capacity | `{ "message_type": "RESOURCE_EXHAUSTED", "status": "CAPACITY_NOT_AVAILABLE" }` |
| `QUOTA_EXCEEDED` | insufficient credits | `{ "message_type": "QUOTA_EXCEEDED", "credits_balance": "0", "message": "insufficient credits balance" }` — server closes |
| `CHUNK_SIZE_TOO_SMALL` | chunk < 1 KB | `{ "message_type": "CHUNK_SIZE_TOO_SMALL", "chunk_size_min": "1" }` |
| `CHUNK_SIZE_TOO_LARGE` | chunk > 32 KB | `{ "message_type": "CHUNK_SIZE_TOO_LARGE", "chunk_size_max": "32" }` |
| `INSUFFICIENT_AUDIO_ACTIVITY` | idle > 60 s | `{ "message_type": "INSUFFICIENT_AUDIO_ACTIVITY", "message": "insufficient audio activity detected,exceed max idle time of 60 seconds" }` |
| `SESSION_TIME_LIMIT_EXCEEDED` | session > 300 s | `{ "message_type": "SESSION_TIME_LIMIT_EXCEEDED", "session_time_limit": "300" }` |
| `CHUNK_ID_MISMATCH_WITH_TOTAL` | ack_id ≠ total sent | `{ "message_type": "CHUNK_ID_MISMATCH_WITH_TOTAL", "chunk_id_input": 20, "chunk_id_expected": 3, "chunk_id_total": 2 }` |

### Typical flow (verbatim, slightly reformatted)

1. Open WebSocket with query parameters and `Authorization` header.
2. Receive `SESSION_CREATED`.
3. Send `INPUT_AUDIO_CHUNK` messages repeatedly.
4. Receive `AUDIO_CHUNK_ACK` and `PARTIAL_TRANSCRIPT` messages.
5. Send `COMMIT` when done streaming audio.
6. Receive `COMMITTED_TRANSCRIPT` and the connection closes.

---

## 5. Supported STT Languages (and code-switching)

> Verbatim from `https://docs.voice.intron.io/docs/stt/supported-languages`.
> The page has three tabs: **All languages**, **African languages**,
> **Code-switched languages**. Each table has columns
> `Language | Code | code-switched`. The code-switched column is `✓`
> (supported) or `x` (not supported).

### CRITICAL findings for SautiSafe

- ✅ **Luganda is supported**, code **`lg`** (labelled "Luganda-English"), code-switched **✓**.
- ✅ **Swahili is supported**, code **`sw`** (labelled "Swahili-English"), code-switched **✓**.
- ✅ **Code-switching is explicitly supported** — Intron ships dedicated
  bilingual ASR models for the African languages that mix with English.
  These are marked with `✓` in the `code-switched` column.
- ⚠️ **The codes Intron uses differ from ISO 639-3** that the brief
  referenced (`lug`/`swa`). Use **`lg`** and **`sw`** respectively when
  calling the API. (i.e. `use_language_asr_input="lg"` and
  `use_language_asr_input="sw"`).

### All languages — verbatim table

| Language | Code | code-switched |
|---|---|---|
| Afrikaans-English | `af` | ✓ |
| Akan-English | `ak` | ✓ |
| Amharic-English | `am` | ✓ |
| Arabic | `ar` | x |
| Bemba | `bem` | x |
| Bulgarian | `bg` | x |
| Czech | `cs` | x |
| Danish | `da` | x |
| German | `de` | x |
| Greek | `el` | x |
| English | `en` | x |
| Spanish | `es` | x |
| Estonian | `et` | x |
| Finnish | `fi` | x |
| French | `fr` | x |
| Fulani | `ff` | x |
| Fulani (Pulaar) | `fuc` | x |
| Fulani (Pular) | `fuf` | x |
| Fulani (Adamawa Fulfulde) | `fub` | x |
| Fulani (Nigerian Fulfulde) | `fuv` | x |
| Fulani (Central-Eastern Niger Fulfulde) | `fuq` | x |
| Fulani (Borgu Fulfulde) | `fue` | x |
| Fulani (Maasina Fulfulde) | `ffm` | x |
| Ga | `gaa` | x |
| Hausa-English | `ha` | ✓ |
| Croatian | `hr` | x |
| Hungarian | `hu` | x |
| Igbo-English | `ig` | ✓ |
| Italian | `it` | x |
| Lithuanian | `lt` | x |
| Latvian | `lv` | x |
| **Luganda-English** | **`lg`** | **✓** |
| Maltese | `mt` | x |
| Dutch | `nl` | x |
| Northern Sotho | `nso` | x |
| Nyankole | `nyn` | x |
| Oromo | `om` | x |
| Pidgin-English | `pcm` | ✓ |
| Polish | `pl` | x |
| Portuguese | `pt` | x |
| Romanian | `ro` | x |
| Russian | `ru` | x |
| Kinyarwanda-English-French | `rw` | ✓ |
| Slovak | `sk` | x |
| Slovenian | `sl` | x |
| Shona | `sn` | x |
| Sotho | `st` | x |
| Swedish | `sv` | x |
| **Swahili-English** | **`sw`** | **✓** |
| Tswana | `tn` | x |
| Twi | `tw` | x |
| Ukrainian | `uk` | x |
| Wolof-English | `wo` | ✓ |
| Xhosa | `xh` | x |
| Yoruba-English | `yo` | ✓ |
| Zulu-English | `zu` | ✓ |
| Dholuo (Luo) | `luo` | x |
| Kanuri | `kr` | x |
| Kikuyu | `ki` | x |
| Nupe | `nup` | x |
| Tigrinya | `ti` | x |

### Code-switched languages only (verbatim — the third tab)

| Language | Code |
|---|---|
| Afrikaans-English | `af` |
| Akan-English | `ak` |
| Amharic-English | `am` |
| Hausa-English | `ha` |
| Igbo-English | `ig` |
| **Luganda-English** | **`lg`** |
| Pidgin-English | `pcm` |
| Kinyarwanda-English-French | `rw` |
| **Swahili-English** | **`sw`** |
| Wolof-English | `wo` |
| Yoruba-English | `yo` |
| Zulu-English | `zu` |

> **Auto language detection:** `not documented`. The API requires
> `use_language_asr_input` on every upload/stream request; there is no
> documented "auto" value. SautiSafe must therefore decide upfront which
> code-switched model to invoke. For multi-lingual reports the safest
> pattern is to run the most-likely code-switched model (e.g. `lg` or `sw`)
> and let the bilingual model handle the English side natively.

---

## 6. Question Answering (Q&A over transcript)

> Verbatim from `https://docs.voice.intron.io/docs/stt/question-answering`.
> **There is no dedicated Q&A endpoint.** Q&A is a post-processing mode of the
> **sync STT** endpoint, enabled by the `get_answer=TRUE` form field.

### Endpoint

```
POST https://infer.voice.intron.io/file/v1/upload/sync
```
(Same as §3 — `/file/v1/upload/sync`. The Q&A behaviour is triggered by setting `get_answer=TRUE`.)

### Auth & headers

Same as §3: `Authorization: Bearer YOUR_API_KEY`, `Content-Type: multipart/form-data`.

### Request body — `multipart/form-data` (verbatim table)

| Field | Type | Description | Required | Options | Default |
|---|---|---|---|---|---|
| `audio_file_name` | String | non-unique file name | yes | – | – |
| `audio_file_blob` | String | the audio file containing the spoken question | yes | – | – |
| `use_category` | String | category of the file (any category is valid) | no | (see §2) | `file_category_telehealth` |
| `use_language_asr_input` | String | input language code of the spoken question | no | (see §5) | `en` |
| `use_language_data_extraction_output` | String | language code for the answer; defaults to the question language | no | (see §5) | (question language) |
| `get_answer` | String | treat the transcript as a question and return only the answer | yes | `TRUE` \| `FALSE` | `FALSE` |

### How it works (verbatim, slightly reformatted)

1. The audio is transcribed in the input language (`use_language_asr_input`).
2. The transcript is passed to the LLM, which detects whether a question or request is present and answers it directly and concisely.
3. If no answerable question is present, the model briefly acknowledges what was said and invites the user to ask a question rather than inventing one.
4. The answer is returned as `transcript_answer` in the response.

### Answer-language matrix (verbatim)

| `use_language_asr_input` | `use_language_data_extraction_output` | Answer language |
|---|---|---|
| `sw` (Swahili) | (not set) | Swahili |
| `sw` (Swahili) | `en` (English) | English |
| `en` (English) | (not set) | English |

### Verbatim curl — Swahili question, English answer

```bash
curl --location 'https://infer.voice.intron.io/file/v1/upload/sync' \
  --header 'Authorization: Bearer api-key' \
  --form 'audio_file_name="my_question"' \
  --form 'audio_file_blob=@"/C:/Users/aaaa/question.wav"' \
  --form 'use_category="file_category_general"' \
  --form 'use_language_asr_input="sw"' \
  --form 'use_language_data_extraction_output="en"' \
  --form 'get_answer="TRUE"'
```

### Verbatim response — HTTP 200 (question detected)

```json
{
    "data": {
        "file_id": "12a9760f-b165-4404-91d0-a65d4cdt78fs",
        "processing_status": "FILE_TRANSCRIBED",
        "audio_file_name": "my_question",
        "audio_transcript": "Mji mkuu wa Kenya ni upi?",
        "processed_audio_duration_in_seconds": 6,
        "transcript_answer": "The capital city of Kenya is Nairobi."
    },
    "message": "file status found",
    "status": "Ok"
}
```

### Other documented response variants (text-only; JSON body not rendered in static HTML)

- `Response (200), no question detected` — shape `not documented`; per the prose, the model acknowledges what was said and invites a question rather than inventing one.
- `Response (503), processing time-out` — shape `not documented`; per the prose, *"The request can timeout with an http status code 503 and the file-id in 120 seconds. The file-id in the response can be used to get the file's status with the Get File Status endpoint."*

### Notes for SautiSafe

The Intron Q&A mode is **potentially interesting** for SautiSafe's follow-up
Q&A loop, but it answers a single spoken question from a single audio file —
it does not chat over an existing transcript. SautiSafe's current
`/api/extract` flow (LLM over the transcript with a strict safety prompt) is a
better fit for multi-question follow-ups and urgent-tag scanning. Intron Q&A
could be used as a **benchmark lane** for "did the worker's spoken question get
answered directly by the platform's own LLM?".

---

## 7. TTS — Generate & Streaming

### 7a. TTS — Async (`POST /tts/v1/enqueue` + `GET /tts/v1/status/{text_id}`)

> Verbatim from `https://docs.voice.intron.io/docs/tts/tts-queue` (Upload Text)
> and `https://docs.voice.intron.io/docs/tts/tts-status` (Get Text Status).

#### Enqueue endpoint

```
POST https://infer.voice.intron.io/tts/v1/enqueue
```

**Documented limit:** *"This endpoint only supports text less than or equal to 4096 characters"*. However the rendered error example says *"tts text character count greater than the max limit of 1200 characters"* — **the docs are internally inconsistent**. Treat **1200** as the safe upper bound and verify on integration.

**Rate limit:** 60 requests / minute.

##### Headers (verbatim)

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer YOUR_API_KEY` | Yes |
| `Content-Type` | `application/json` | Yes |

##### Body parameters (verbatim)

| Field | Type | Description | Required | Options | Default |
|---|---|---|---|---|---|
| `text` | String | the text to process | yes | – | – |
| `voice_accent` | String | Accent for the speech voice | yes | see §7d | – |
| `voice_gender` | String | Gender for the speech voice | yes | `male` \| `female` | – |
| `voice_language` | String | Language of the input text | yes | see §7d | – |
| `output_audio_format` | String | Specify the output audio format | no | `wav` \| `opus` | `wav` |

##### Verbatim curl — English text, Swahili-accent female voice

```bash
curl --location 'https://infer.voice.intron.io/tts/v1/enqueue' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer api-key' \
  --data '{
    "text":"hello world",
    "voice_language":"en",
    "voice_accent":"swahili",
    "voice_gender":"female"
}'
```

##### Verbatim response (queued)

```json
{
    "data": {
        "text_id": "12a9767f-b865-4404-91d0-a65d4cdt78fs"
    },
    "message": "tts text queued for processing",
    "status": "Ok"
}
```

#### Status endpoint

```
GET https://infer.voice.intron.io/tts/v1/status/{text_id}
```

Path variable: `text_id` (string, required — the text id generated in response when the text was queued).

**Rate limit:** 100 requests / minute.

##### Verbatim curl

```bash
curl --location 'https://infer.voice.intron.io/tts/v1/status/text-id' \
  --header 'Authorization: Bearer my-api-key'
```

##### TTS processing status enum (verbatim)

| Status |
|---|
| `TTS_TEXT_AUDIO_QUEUED` |
| `TTS_TEXT_AUDIO_PENDING` |
| `TTS_TEXT_AUDIO_PROCESSING` |
| `TTS_TEXT_AUDIO_GENERATED` |
| `TTS_TEXT_AUDIO_PROCESSING_FAILED` |

##### Response shape (completed — reconstructed from §7b's verbatim sync sample)

```json
{
  "data": {
    "audio_duration_in_seconds": 3,
    "audio_path": "http://myaudio.wav",
    "processing_status": "TTS_TEXT_AUDIO_GENERATED"
  },
  "message": "text status found",
  "status": "Ok"
}
```

The completed `data` returns an **`audio_path` URL** (not base64) that the
client downloads. The URL host and TTL are `not documented` — treat as
short-lived and fetch immediately.

---

### 7b. TTS — Sync Generate (`POST /tts/v1/generate`)

> Verbatim from `https://docs.voice.intron.io/docs/tts/tts-generate`.

#### Endpoint

```
POST https://infer.voice.intron.io/tts/v1/generate
```

**Documented limit:** *"This endpoint only supports text less than or equal to 4096 characters"*. (Same internal inconsistency as the enqueue endpoint — error example says *"max limit of 100 characters"*. Treat the smaller number as the safe ceiling and verify on integration.)

**Sync timeout:** 120 s → returns HTTP **503** with a `text_id`; that `text_id` can be polled via `GET /tts/v1/status/{text_id}` (§7a).

**Rate limit:** 30 requests / minute.

##### Headers (verbatim)

| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer YOUR_API_KEY` | Yes |
| `Content-Type` | `application/json` | Yes |

##### Body parameters (verbatim)

Same as §7a: `text`, `voice_accent`, `voice_gender`, `voice_language` (all required); `output_audio_format` (optional, default `wav`).

##### Supported output audio formats (verbatim)

| Format | Extension |
|---|---|
| WAV | `.wav` |
| OPUS | `.opus` |

##### Verbatim curl — English text, Swahili-accent female voice

```bash
curl --location 'https://infer.voice.intron.io/tts/v1/generate' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer api-key' \
  --data '{
    "text":"hello world",
    "voice_language":"en",
    "voice_accent":"swahili",
    "voice_gender":"female"
}'
```

##### Verbatim curl — Hausa text, Hausa-accent female voice

```bash
curl --location 'https://infer.voice.intron.io/tts/v1/generate' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer api-key' \
  --data '{
    "text":"hello world",
    "voice_language":"ha",
    "voice_accent":"hausa",
    "voice_gender":"female"
}'
```

##### Verbatim response (200, audio generated)

```json
{
    "data": {
        "audio_duration_in_seconds": 3,
        "audio_path": "http://myaudio.wav",
        "processing_status": "TTS_TEXT_AUDIO_GENERATED"
    },
    "message": "text status found",
    "status": "Ok"
}
```

##### Verbatim error responses (all HTTP 400, `status:"Error"`)

| Case | Message template |
|---|---|
| Max characters limit exceed | `tts text character count greater than the max limit of 100 characters` |
| Invalid text voice language | `invalid text voice language,{language} not supported` |
| Invalid text voice accent | `invalid text voice accent,{accent} not supported for language {language}` |
| Invalid text voice gender | `invalid text voice gender,{gender} not supported for accent {accent}` |
| Invalid output audio format | (same body as above; **the docs reuse the gender message for the format error — `not documented` exactly**; safe assumption is HTTP 400 with `status:"Error"` and a human-readable message) |

---

### 7c. TTS — Streaming (`wss://infer.voice.intron.io/tts/v1/stream`)

> Verbatim from `https://docs.voice.intron.io/docs/tts/tts-streaming`.

#### Endpoint

```
wss://infer.voice.intron.io/tts/v1/stream
```

#### Runtime limits (verbatim)

- Max session lifetime: **300 seconds**
- Max idle time between text chunks input: **60 seconds**
- Min text characters count: **10**
- Max text characters count: **100**

#### Connection query parameters (verbatim table)

| Parameter | Type | Description | Required | Default |
|---|---|---|---|---|
| `voice_accent` | String | Accent for the speech voice | yes | (see §7d) |
| `voice_gender` | String | Gender for the speech voice (male/female) | yes | – |
| `voice_language` | String | Language of the input text | yes | (see §7d) |
| `output_audio_format` | String | Specify the output audio format | no | `wav` (supports `wav`, `opus`) |

#### Verbatim handshake (wscat)

```bash
wscat -c 'wss://infer.voice.intron.io/tts/v1/stream' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```
(Query parameters would be appended in real usage — the docs show the bare URL.)

#### Input messages

##### `INPUT_TEXT_CHUNK` (verbatim table)

| Field | Type | Required | Description |
|---|---|---|---|
| `message_type` | String | Yes | Must be `INPUT_TEXT_CHUNK` |
| `text` | String | Yes | the input text |
| `ack_id` | Integer | No | Client chunk sequence ID echoed by server ACK |

Verbatim JSON:
```json
{ "message_type": "INPUT_TEXT_CHUNK", "text": "<text>", "ack_id": 1 }
```

##### `FETCH_AUDIO_CHUNK` (verbatim table)

| Field | Type | Required | Description |
|---|---|---|---|
| `message_type` | String | Yes | Must be `FETCH_AUDIO_CHUNK` |
| `chunk_id` | Integer | No | id of the input text chunk |

Verbatim JSON:
```json
{ "message_type": "FETCH_AUDIO_CHUNK", "chunk_id": 1 }
```

##### `COMMIT` (verbatim table)

| Field | Type | Required | Description |
|---|---|---|---|
| `message_type` | String | Yes | Must be `COMMIT` |

Verbatim JSON:
```json
{ "message_type": "COMMIT" }
```

#### Session responses

##### `SESSION_CREATED` (verbatim)
```json
{
  "message_type": "SESSION_CREATED",
  "session_id": "12a9760f-b165-4404-91d0-a65d4cdt78fs",
  "credit_balance": 120.0,
  "configs": {
    "voice_language": "en",
    "voice_accent": "yoruba",
    "voice_gender": "yo",
    "output_audio_format": "wav"
  }
}
```
> Note: the docs' verbatim sample has `"voice_gender": "yo"` which is almost
> certainly a typo (should be `"male"`/`"female"`); the `voice_accent` value
> `"yoruba"` is correct. Preserved verbatim per instructions.

##### `TEXT_CHUNK_ACK` (verbatim)
```json
{ "message_type": "TEXT_CHUNK_ACK", "chunk_id": 1, "total_chunks": 1 }
```

##### `FETCH_AUDIO_CHUNK` (response — verbatim)
```json
{
  "message_type": "FETCH_AUDIO_CHUNK",
  "processing_staus": "PROCESSING",
  "chunk_id": 1,
  "audio_base_64": "",
  "extension": ".wav",
  "audio_config_num_channels": 1,
  "audio_config_sample_width": 16,
  "audio_config_frame_rate": 48000,
  "total_duration_in_seconds": 10,
  "total_size_in_bytes": 1000,
  "total_size_in_kb": 1
}
```
> Note: the field is verbatim **`processing_staus`** (typo in the live docs).
> `processing_status` becomes `READY` when the chunk is fully processed (the
> `audio_base_64` is then populated). The audio is returned as
> **base64-encoded** PCM with metadata (`num_channels`, `sample_width`,
> `frame_rate`, `duration`, `size_in_bytes`, `size_in_kb`).

##### `COMMITTED_AUDIO` (verbatim)
```json
{
  "message_type": "COMMITTED_AUDIO",
  "text_id": "e1c4a90b-e319-4de6-9f22-0e0cf5e8b7a2",
  "audio_len": 10
}
```

#### Error / terminal messages (verbatim)

Same family as STT streaming:
`ERROR`, `INPUT_ERROR` (sample messages: `"invalid input message_type received"`,
`"Invalid data structure for text chunk"`, `"Invalid request data for fetch audio chunk,ensure chunk id is integer"`,
`"Missing chunk_id to fetch audio chunk"`, `"Invalid data structure for commit audio request"`,
`"no data received"`, `"invalid input message_type received"`, `"invalid input data"`,
`"Commit request already received, cannot accept more text chunks"`, `"Error processing data"`),
`AUTHENTICATION_ERROR` (`"permission denied,access-key error"` — server closes),
`RESOURCE_EXHAUSTED` (`CAPACITY_NOT_AVAILABLE`),
`QUOTA_EXCEEDED` (`credits_balance:"0"`, `"insufficient credits balance"` — server closes),
`SESSION_TIME_LIMIT_EXCEEDED` (`session_time_limit:"300"`),
`INSUFFICIENT_TEXT_ACTIVITY` (`"insufficient text activity detected,exceed max idle time of 60 seconds"`),
`CHUNK_ID_MISMATCH_WITH_TOTAL`,
`CHUNK_SIZE_TOO_SMALL` (`chunk_size_min:"10"`),
`CHUNK_SIZE_TOO_LARGE` (`chunk_size_max:"100"`).

#### Typical flow (verbatim, slightly reformatted)

1. Open WebSocket with query parameters and `Authorization` header.
2. Receive `SESSION_CREATED`.
3. Send `INPUT_TEXT_CHUNK` messages repeatedly.
4. Send `FETCH_AUDIO_CHUNK` requests to get the base64 audio when `READY`.
5. Send `COMMIT` when done streaming audio.
6. Receive `COMMITTED_AUDIO` and the connection closes.

---

### 7d. Supported TTS languages & accents

> Verbatim from `https://docs.voice.intron.io/docs/tts/supported-languages-and-accents`.
> The page lists each language as `Language | (code)` with a table of accents
> under it; each accent has a `Voice Gender Available` column = `male,female`
> for every entry.

| Language (code) | Accent(s) | Voice genders |
|---|---|---|
| Afrikaans (`af`) | `afrikaans` | male, female |
| Amharic (`am`) | `amharic` | male, female |
| **English (`en`)** | `afrikaans`, `hausa`, `igbo`, `luganda`, `sepedi`, `swahili`, `setswana`, `xhosa`, `yoruba`, `zulu` | male, female (per accent) |
| Hausa (`ha`) | `hausa` | male, female |
| Igbo (`ig`) | `igbo` | male, female |
| Kinyarwanda (`rw`) | `kinyarwanda` | male, female |
| **Luganda (`lg`)** | `luganda` | male, female |
| Oromo (`om`) | `oromo` | male, female |
| Pidgin (`pcm`) | `pidgin` | male, female |
| Shona (`sn`) | `shona` | male, female |
| **Swahili (`sw`)** | `swahili` | male, female |
| Wolof (`wo`) | `wolof` | male, female |
| Yoruba (`yo`) | `yoruba` | male, female |

> The "African languages" tab is the same list minus English. **There is no
> "voice id" / named-voice concept — selection is by
> `voice_language` + `voice_accent` + `voice_gender`.** The same `lg`/`sw`
> codes used for STT are used as `voice_language` for TTS.

---

## 8. Widget Integration

> Verbatim from `https://docs.voice.intron.io/docs/widget/integration`.
> The widget is a pre-built streaming-transcription UI for web apps.

### Install

```bash
npm install @intron_health/intron_transcriber_streaming
```

A pre-built UMD bundle is also shipped for script-tag integration:
`path/to/intron_transcriber_widget.umd.js` (the exact CDN/download URL is
**`not documented`** in the live docs; obtain from the package or the
Intron dashboard).

### Verbatim HTML integration example

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intron Transcription Widget</title>
    <script src="path/to/intron_transcriber_widget.umd.js"></script>
  </head>
  <body>
    <h3>Click Record to start transcription:</h3>

    <div id="transcription-widget"></div>

    <textarea
      id="transcription-target"
      rows="10"
      cols="80"
      placeholder="Transcription will appear here..."
    ></textarea>

    <script>
      const { loadIntronTranscribeWidget } = IntronTranscriberWidget;

      window.onload = function () {
        const parentElement = document.getElementById("transcription-widget");
        const apiKey = "your-api-key-here";

        const options = {
          writeStreamOnlyInSpecifiedTextbox: "transcription-target",
          showPostProcessingCategory: "health"
        };

        loadIntronTranscribeWidget(parentElement, apiKey, options);
      };
    </script>
  </body>
</html>
```

### Config options (verbatim)

| Option | Description | Example value |
|---|---|---|
| `writeStreamOnlyInSpecifiedTextbox` | ID of a `<textarea>` (or input) where the live transcript is written | `"transcription-target"` |
| `showPostProcessingCategory` | Post-processing category the widget applies to the stream (mirrors the REST `use_category` values) | `"health"` |

### Events

**`not documented`** in the extracted HTML. The widget exposes
`loadIntronTranscribeWidget(parent, apiKey, options)` and writes the stream
into the configured textbox; callback/event hooks for `onPartial`,
`onFinal`, `onError`, etc. are **not documented** in the static HTML.
Inspect the npm package on integration to discover any programmatic API.

### Gotcha for SautiSafe

The widget is browser-side and requires the API key to live in client code —
which the Intron docs themselves warn against ("Keep this secure and never
expose it in client-side code"). **SautiSafe should not use the widget** in
production; it should continue to record audio client-side and proxy through
its own `/api/transcribe` route (server-held key). The widget is only
useful for quick demos.

---

## 9. Errors

### REST envelope (verbatim from TTS error samples — same shape used by STT)

```json
{
  "data": {},
  "message": "<human-readable error>",
  "status": "Error"
}
```

- `data` is an empty object on error.
- `message` is the only machine-readable signal — there is **no documented
  error `code` field**. SautiSafe must match on substrings of `message`
  (e.g. `"invalid text voice language"`, `"max limit of ..."`) or on the
  HTTP status code.
- The top-level `status` field is the string `"Ok"` or `"Error"`, **not** an
  HTTP code.

### Documented HTTP status codes

| HTTP | When |
|---|---|
| `200` | Successful response (sync STT, sync TTS, status polls). |
| `400` | Bad request — invalid language/accent/gender/format, character-count exceeded, max audio duration exceeded (sync STT > 120 s). Body has `"status":"Error"`. |
| `503` | Sync processing time-out (after 120 s). Carries a `file_id` (STT) or `text_id` (TTS) in the body for follow-up polling. |
| `429` (implied) | Rate-limit hit — the docs say *"Rate limit headers included in response. Retry-After: (delay-seconds) indicates time in seconds to retry."* The exact HTTP code is `not documented`; assume `429`. |

### WebSocket error taxonomy (verbatim — see §4 and §7c)

`AUTHENTICATION_ERROR` (server closes), `RESOURCE_EXHAUSTED`
(`CAPACITY_NOT_AVAILABLE`), `QUOTA_EXCEEDED` (`"insufficient credits
balance"`, server closes), `INPUT_ERROR` (any malformed message), `ERROR`
(unexpected server failure), `CHUNK_SIZE_TOO_SMALL` / `_TOO_LARGE`,
`INSUFFICIENT_AUDIO_ACTIVITY` / `INSUFFICIENT_TEXT_ACTIVITY` (60 s idle),
`SESSION_TIME_LIMIT_EXCEEDED` (300 s), `CHUNK_ID_MISMATCH_WITH_TOTAL`.

### Safe error messages for SautiSafe (recommended)

When bubbling errors up to the worker/supervisor UI, never expose the API key
or the raw upstream URL. Strip secrets from any stack trace before writing to
the audit trail (matches `convex/actions/transcribe.ts`'s safe-error pattern).
Suggested safe messages:
- `"Transcription service unavailable. Please retry in a moment."` (5xx / 429 / WS `ERROR` / `RESOURCE_EXHAUSTED`)
- `"Recording too long. Please keep reports under 2 minutes."` (sync 400 max audio duration)
- `"Could not authenticate with transcription provider."` (401 / WS `AUTHENTICATION_ERROR`) — surface to ops only, not the worker
- `"Provider quota exceeded."` (WS `QUOTA_EXCEEDED`) — surface to ops only

---

## 10. Mapping to SautiSafe

| SautiSafe need | Intron endpoint | Required params | Notes / gotchas |
|---|---|---|---|
| **Transcribe a worker's recording (Report tab → `/api/transcribe`)** | `POST /file/v1/upload/sync` | `audio_file_name`, `audio_file_blob=@file`, `use_language_asr_input` | **Use the SYNC endpoint.** Cap audio at ≤ 120 s (sync hard limit). On HTTP 503, extract `data.file_id` and poll `GET /file/v1/status/{file_id}` — never fall back to a different provider silently. Response field is `data.audio_transcript`. For Luganda reports use `use_language_asr_input="lg"`, for Swahili `use_language_asr_input="sw"`. |
| **Benchmark lane — "Sahara" (Benchmark tab)** | Same `POST /file/v1/upload/sync` | Same as above; add `use_disable_llm_corrections="TRUE"` for the raw-ASR comparison | The "Sahara" lane in SautiSafe is the Intron API. Use `use_disable_llm_corrections=TRUE` to get the pure ASR output for fair WER/CER comparison against Whisper/Gemini. Wrap the call with `Date.now()` for latency, as `convex/actions/transcribe.ts` already does. |
| **Detect Luganda/Swahili (and code-switching)** | n/a — set explicitly via `use_language_asr_input` | `lg` (Luganda-English, code-switched ✓), `sw` (Swahili-English, code-switched ✓) | **Auto-detection is `not documented`.** SautiSafe must pick the model upfront. Strategy: let the worker pick a language toggle (English / Luganda / Swahili) on the Report tab; default to the code-switched model of the worker's preferred language so English mixing works natively. |
| **Urgent-tag scan (safety-critical keyword detection)** | SautiSafe's own `/api/extract` (LLM over transcript) | n/a — Intron's `get_*` flags are healthcare/call-center/legal/meeting oriented, not industrial-safety | Intron's post-processing categories don't map to industrial safety (no `file_category_industrial_safety`). The closest is `file_category_general` + `get_entity_list` + `get_summary`, but the entity vocab is healthcare-flavoured. **Recommendation: do not rely on Intron post-processing for urgent-tag scanning** — keep SautiSafe's additive keyword backstop (`src/lib/safety.ts`) and LLM extraction (`/api/extract`) as the source of truth, and treat Intron purely as the ASR lane. |
| **Follow-up Q&A over the transcript** | SautiSafe's own `/api/extract` (multi-turn) — *or* Intron `POST /file/v1/upload/sync?get_answer=TRUE` for single-shot | For Intron Q&A: `audio_file_name`, `audio_file_blob`, `use_language_asr_input`, `use_language_data_extraction_output`, `get_answer=TRUE` | Intron Q&A answers one spoken question from one audio file — it does not chat over an existing transcript. Useful as an extra benchmark lane ("did Intron's own LLM answer the worker's spoken question?"), not as the primary follow-up loop. |
| **Audio file storage** | n/a (Intron returns `audio_path` URLs only for TTS, none for STT) | – | STT responses do not echo back a stored audio URL. SautiSafe must persist the original audio blob in Convex file storage (already done in `convex/audio.ts`) — Intron is not an audio archive. |
| **TTS playback of supervisor notes / report read-back** (future) | `POST /tts/v1/generate` | `text`, `voice_language`, `voice_accent`, `voice_gender`, `output_audio_format` | Returns an `audio_path` URL (not base64). For Luganda playback use `voice_language="lg"`, `voice_accent="luganda"`, `voice_gender="female"`. Note the 1200-char vs 4096-char doc inconsistency — chunk long text. |
| **Live streaming transcription** (future, if SautiSafe adds live captions) | `wss://infer.voice.intron.io/stt/v1/stream` | Query: `use_language_asr_input`, `sample_rate=16000`, `bit_rate=16`, `num_channels=1`; send base64 PCM16 LE `INPUT_AUDIO_CHUNK`s, then `COMMIT` | Audio must be **raw PCM16 little-endian, base64-encoded** — not the browser's default WebM/Opus. SautiSafe's `src/lib/audio-utils.ts` already encodes 16 kHz WAV; a PCM16-LE path would need to be added. Max 300 s session, 60 s idle, 1–32 KB chunks. |

### Design-impacting gotchas (summary)

1. **Sync STT hard-caps at 120 s of audio and 120 s of processing time.**
   SautiSafe's 3-minute MediaRecorder limit must be reduced, or longer
   recordings must use async upload (`/file/v1/upload`) + polling.
2. **No silent fallback.** Intron 503 returns a `file_id` for follow-up
   polling — wire that as the only "recovery" path. Never retry a failed
   Intron call on a different provider.
3. **Code-switching is explicit, not auto-detected.** The Report tab must
   surface a language picker so the worker can choose `lg` / `sw` / `en`.
4. **STT input codes differ from ISO 639-3.** Use `lg` (not `lug`) and `sw`
   (not `swa`).
5. **Intron's post-processing categories are healthcare/call-center/legal/
   meeting-flavoured** — none map to industrial safety. SautiSafe must keep
   its own `src/lib/safety.ts` urgent-keyword scan and `/api/extract` LLM
   extraction as the canonical safety-analysis path; Intron is only the ASR.
6. **Streaming STT requires raw PCM16 little-endian base64 chunks** (not
   WebM/Opus). If SautiSafe later adds live captions, the client encoder
   must be extended.
7. **Widget requires an in-browser API key** — incompatible with SautiSafe's
   security posture. Use server-side `/api/transcribe` (already the design).
8. **No documented error `code` field** — error handling must substring-match
   `message`. Keep these matches server-side only (in `convex/actions/transcribe.ts`)
   so the worker never sees raw upstream errors.
9. **Rate limits are tight on sync endpoints (30 req/min sync STT, 30 req/min
   sync TTS, 60 req/min async upload).** For a multi-worker pilot, prefer async
   upload + a single status-poller with jittered backoff (100 req/min poll
   budget).
10. **Doc inconsistencies on character limits** (TTS enqueue says 4096 in
    prose but 1200 in the error example; TTS generate says 4096 in prose but
    100 in the error example). Verify the real ceilings on first integration
    and code-defensively against the smaller number.

---

### Source provenance

| Section | Source file(s) | Rendered JSON? |
|---|---|---|
| §1, §5, §6, §7c, §7d, §8 | uploaded bundle (`index.html`, `supported-languages.html`, `supported-languages-and-accents.html`, `question-answering.html`, `tts-streaming.html`, `widget-integration.html`) — these were NOT 404 stubs | yes — full JSON in `<pre>` blocks |
| §4 | uploaded bundle (`streaming.html`) | yes |
| §7a, §7b | uploaded bundle (`tts-generate.html`) + online (`tts-queue`, `tts-status`) | yes |
| §2 (async upload) | online (`stt/file-upload`) — uploaded `upload-file.html` was a 404 stub | curl + tables yes; upload-response JSON no (lazy-loaded) |
| §3 (sync upload) | online (`stt/file-upload-sync`) — uploaded `upload-file-sync.html` was a 404 stub | yes |
| §2b (status poll) | uploaded bundle (`file-status.html`) + online (`stt/file-status`) | curl + tables yes; response JSON no (lazy-loaded) |
| §7a enqueue/status | online (`tts/tts-queue`, `tts/tts-status`) — uploaded `upload-text.html`/`get-text-status.html` were 404 stubs | yes |

All HTTP methods, paths, header names, form-field names, JSON keys, status
enum values, language codes, accent names, and curl examples above are
verbatim from the rendered docs. Anything inferred is explicitly labelled
*reconstructed* or *not documented*.
