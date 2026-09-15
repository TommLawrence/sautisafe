# SautiSafe benchmark report

## What was tested

SautiSafe compares Sahara, Whisper, and Gemini on the same stored voice recording. Each result is measured against a transcript checked by a person. The comparison looks at missed or added words, spelling differences, important safety words, response time, and whether the provider completed the request.

This document describes the production data available on 16 September 2026. Benchmarking will continue with recordings from more users, so later totals may be higher.

## Dataset and consent

The production system contained 20 reports with stored audio. Nineteen were participant or field reports and one was an automated system test. The collection combined recordings spoken independently by different participants with reports collected from real field settings. Some people read prepared safety incidents, while others described field situations in their own words. These groups are identified separately in the study so prepared speech is not presented as spontaneous field speech.

The report records showed 17 English-Luganda reports, one English-Luganda-Swahili report, one Luganda report, and one English report. Reporter labels indicated 18 distinct values, but this is not treated as a verified count of 18 independent people because names were optional and the automated test used its own label.

Recording required consent. Names and workplace details are not needed in the public findings. Audio will only be shared publicly where the speaker separately agreed to sharing; otherwise only grouped, de-identified results will be published.

## How the comparison was made

The same audio was sent to all three providers. A supervisor could listen to the recording and correct the reference transcript before running the comparison. No provider was silently replaced by another provider. A failed call remained recorded as a failure.

Word Error Rate (WER) measures changed, missing, and extra words. Character Error Rate (CER) measures character-level differences. Lower WER and CER are better. WER can exceed 100% when a model adds many words. Safety-term recall checks whether important words in the reference, such as fire, gas, injury, valve, stop, or isolate, were retained. Higher recall is better.

## Production findings

There were 16 benchmark runs covering 13 report references. Each run attempted three providers, giving 48 provider attempts.

| Provider | Successful | Failed | Completion | Average WER* | Average CER* |
|---|---:|---:|---:|---:|---:|
| Sahara | 14 | 2 | 87.5% | 62.1% | 37.0% |
| Whisper | 14 | 2 | 87.5% | 70.7% | 34.5% |
| Gemini 3.5 Flash | 6 | 10 | 37.5% | 37.2% | 19.7% |

*Accuracy averages use successful calls only. Failed calls are shown in completion rate and are not converted into artificial 100% error scores.*

Most runs were English-Luganda. Within those runs, Sahara completed 12 of 14 attempts with average WER 58.5% and CER 34.8%. Whisper also completed 12 of 14, with average WER 68.2% and CER 33.6%. Gemini completed 6 of 14, with average WER 37.2% and CER 19.7%. The other language groups currently contain only one run each, so they are too small for a fair model conclusion.

## What failed and why

Fourteen of the 48 provider attempts failed:

- Gemini returned seven temporary high-demand errors.
- Gemini returned three quota-limit errors.
- Sahara returned two upstream HTTP 520 service errors.
- Whisper rejected two files because their audio format was labelled incorrectly.

The audio-labelling problem was corrected to recognise common M4A labels. A separate Sahara language-code problem found during testing was also corrected. Historical failures remain part of the record; they are not rewritten as successful results.

## What the numbers mean

The results show that code-switched industrial speech remains difficult. Accents, background conditions, technical terms, repetitions, and several valid spellings can all increase WER and CER. High error rates are not hidden. They support SautiSafe's decision to retain the audio, allow a person to correct the transcript, and keep the final safety decision with a supervisor.

Some early runs may contain a paraphrased reference, a mismatched recording, or a diagnostic test. Such runs should not be removed merely because they scored poorly, but they must be labelled and excluded from a final accuracy average when the audio and reference are not a valid pair. The current production table above reports the stored results as they existed at the snapshot time; a final research dataset will include a written exclusion list.

## Continuing work

SautiSafe will continue running the same three-provider comparison with data from different users. The next collection will increase the number of independent speakers, keep prepared and real-field recordings separate, verify every reference word-for-word, and report results by language group. This will make later findings more representative and easier to reproduce.

