# SautiSafe test samples

Five consented, original sample audio files for end-to-end testing of the
SautiSafe flow (transcribe -> extract -> benchmark). They are clean TTS audio
(functional testing only; they do not exercise accent, background noise, or
heavy code-switching the way real field recordings would).

## How to use

1. Open the **Report** tab, tick the consent box, pick the speaking language
   (sample 1 = Luganda-English `lg`, sample 3 = Swahili-English `sw`, the rest
   = English `en`).
2. Use **Upload audio file** and pick one of the WAVs below (or drag-drop).
3. Tap **Transcribe & analyze**. The real Intron (Sahara) API transcribes it,
   the LLM extracts the structured safety fields, flags urgency, and asks
   follow-ups if anything is missing.
4. **Submit** the report, then open it from the **Reports** tab. You can
   **Edit transcript** -> **Save as verified reference**, then **Benchmark this
   report** to run all three providers on that audio.
5. Alternatively, use the **Benchmark** tab directly: upload the audio + paste
   the reference transcript from this file, pick the language, and **Run
   benchmark** to see WER / CER / critical-term recall for Sahara, Whisper,
   and Gemini.

## The 5 samples

### 01-reactor-relief-valve.wav  (language: lg - Luganda-English, code-switched)
Spoken: "Pressure ya reactor ebadde egenda waggulu, then relief valve n
etandika okukuba sound, naye twasobodde okugikendeeza. No one was injured. It
happened at the boiler house this morning around nine."

Reference transcript (verified):
> Pressure ya reactor ebadde egenda waggulu then relief valve n etandika okukuba sound naye twasobodde okugikendeeza no one was injured it happened at the boiler house this morning around nine

Expected extraction:
- Location: boiler house
- Equipment: reactor / relief valve
- Hazard: uncontrolled pressure
- Immediate action: reduced the pressure (okugikendeeza)
- Injury: none
- Severity: high
- Urgent tags: uncontrolled-pressure (the injury tag should NOT fire - "no one
  was injured" is negated)

### 02-chemical-spill.wav  (language: en - English)
Spoken: "There was a chemical spill near the drum storage. Fumes were coming
out. We isolated the area and called the safety officer. No injuries
reported."

Reference transcript (verified):
> there was a chemical spill near the drum storage fumes were coming out we isolated the area and called the safety officer no injuries reported

Expected extraction:
- Location: drum storage
- Hazard: chemical spill
- Immediate action: isolated the area, called the safety officer
- Injury: none
- Severity: medium
- Urgent tags: chemical

### 03-forklift-near-miss.wav  (language: sw - Swahili-English, code-switched)
Spoken: "Forklift ilikuwa inasonga haraka, then operator hakuona mtu
akitembea. Tuliambia a stop immediately. Hakuna majeraha."

Reference transcript (verified):
> forklift ilikuwa inasonga haraka then operator hakuona mtu akitembea tuliambia a stop immediately hakuna majeraha

Expected extraction:
- Equipment: forklift
- Hazard: near miss (operator did not see a pedestrian)
- Immediate action: told the operator to stop immediately
- Injury: none (hakuna majeraha = no injuries)
- Severity: medium
- Urgent tags: (none expected)

### 04-arc-flash.wav  (language: en - English, technical)
Spoken: "Arc flash on the isolator while maintenance was working. One worker
got a minor burn on the hand. We shut down and locked out the panel."

Reference transcript (verified):
> arc flash on the isolator while maintenance was working one worker got a minor burn on the hand we shut down and locked out the panel

Expected extraction:
- Equipment: isolator / panel
- Hazard: arc flash
- People affected: one worker
- Immediate action: shut down and locked out the panel
- Injury: minor (burn on the hand)
- Severity: high
- Urgent tags: electrocution, injury

### 05-scaffold-collapse.wav  (language: en - English)
Spoken: "Scaffold collapse near the east wall. Two workers were affected but
no serious injury. We cordoned off the area and called the supervisor."

Reference transcript (verified):
> scaffold collapse near the east wall two workers were affected but no serious injury we cordoned off the area and called the supervisor

Expected extraction:
- Location: east wall
- Equipment: scaffold
- Hazard: collapse
- People affected: two workers
- Immediate action: cordoned off the area, called the supervisor
- Injury: none (no serious injury)
- Severity: high
- Urgent tags: collapse

## Notes

- The TTS voice is clean and unaccented, so transcription accuracy will be
  high. For a realistic benchmark of African-language code-switching, record
  real consented speech in the field.
- Whisper and Gemini geo-restrict the Z-cloud test region (valid keys, region
  blocked), so in this sandbox only the Sahara (Intron) lane completes. All
  three lanes run on a Vercel deployment in a supported region.
- These samples are original and consented. No real worker or company names
  appear. Declared per the organisers' guidance on non-provided datasets.
