// Client-safe list of Intron Voice STT languages SautiSafe offers.
// Canonical source for both the server (src/lib/intron.ts) and the UI.
// Full list in /docs/intron-api-spec.md §5.

export interface SttLanguage {
  code: string;
  label: string;
  codeSwitched: boolean;
}

export const SUPPORTED_LANGUAGES: SttLanguage[] = [
  { code: "lg", label: "Luganda-English", codeSwitched: true },
  { code: "sw", label: "Swahili-English", codeSwitched: true },
  { code: "en", label: "English", codeSwitched: false },
  { code: "yo", label: "Yoruba-English", codeSwitched: true },
  { code: "ha", label: "Hausa-English", codeSwitched: true },
  { code: "ig", label: "Igbo-English", codeSwitched: true },
  { code: "am", label: "Amharic-English", codeSwitched: true },
  { code: "rw", label: "Kinyarwanda-English", codeSwitched: true },
  { code: "af", label: "Afrikaans-English", codeSwitched: true },
  { code: "ak", label: "Akan-English", codeSwitched: true },
];

export const DEFAULT_LANGUAGE = "lg";

export function languageLabel(code?: string | null): string {
  if (!code) return "-";
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
