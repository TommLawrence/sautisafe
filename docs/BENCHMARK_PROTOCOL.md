# SautiSafe benchmark protocol

## Objective

Compare Sahara, Whisper, and Gemini fairly on the same consented industrial-safety audio, with special attention to English-Luganda and English-Swahili code-switching. The benchmark measures transcription accuracy, preservation of safety-critical terms, and response latency.

## Dataset and consent

The evaluation unit is an utterance; the independent human unit is a speaker. Report both counts. Existing participant recordings and the controlled P11 recordings must never be presented as 20 additional participants. Use anonymous participant IDs in analysis. Public audio sharing requires separate explicit consent; otherwise publish only aggregate, de-identified results.

For each sample record: anonymous speaker ID, sample ID, language profile, scenario, duration, recording device/environment, consent scope, and whether the reference was manually verified.

## Reference transcripts

The reference must be a verbatim record of the audio, including code-switched words, repetitions, and meaningful false starts. Do not translate Luganda or Swahili into English, clean the grammar, or paste the intended script when the speaker said something different. A supervisor listens to the entire audio, edits the transcript, and saves it before benchmarking.

## Procedure

1. Record or upload a consented sample through SautiSafe.
2. Confirm that the stored audio plays correctly.
3. In Supervisor view, correct and save the transcript word-for-word.
4. Select the Sahara language that matches the African language in the mix (`lg`, `sw`, or `en` for English-only).
5. Run Sahara, Whisper, and Gemini on the identical stored audio.
6. Preserve provider failures and latency; never substitute another model.
7. Exclude diagnostic runs and mismatched audio/reference pairs before aggregation, documenting every exclusion.

## Metrics

- **WER:** word edits divided by reference words. Lower is better. WER can exceed 100% when a model inserts many extra words.
- **CER:** character edits divided by reference characters. It is useful where spelling and word boundaries vary.
- **Critical-term recall:** share of reference safety terms retained, such as fire, gas, valve, injury, stop, isolate, and supervisor. Higher is better.
- **Latency:** elapsed provider response time in milliseconds. Report median and interquartile range because averages are sensitive to temporary slowdowns.
- **Provider completion rate:** successful calls divided by attempted calls.

Report metrics by provider and language profile, then overall. Show speaker count and utterance count separately. Do not average failed calls as 100% WER; report failures in completion rate and compute accuracy only over successful calls.

## Quality-control exclusions

Exclude a run from accuracy aggregation when its audio is missing/corrupt, the reference belongs to a different recording, the reference is translated or paraphrased, or it was created solely while diagnosing a software failure. Keep an exclusion log with sample ID, reason, and decision date. Never remove a result because its score is poor.

## Interpreting high WER/CER

High error rates are plausible for spontaneous code-switching, accented technical vocabulary, noise, repetitions, and inconsistent spelling. They are not automatically evidence of a weak product: SautiSafe retains audio, enables human transcript verification, measures critical-term recall separately, and routes structured safety fields downstream. However, high scores must not be defended using mismatched references. Correct the data first, then discuss genuine model limitations transparently.

## Reproducibility

The benchmark implementation and metric definitions are versioned in this repository. The final report should identify the tested deployment date, commit, provider labels, sample/speaker counts, language distribution, exclusions, and aggregation method. Publish the report PDF and a de-identified manifest; publish audio only where sharing consent was explicitly granted.

