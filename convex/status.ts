import { query } from "./_generated/server";

/** Public provider configuration status. API keys are never returned. */
export const get = query({
  args: {},
  handler: async () => ({
    intron: {
      configured: Boolean(process.env.INTRON_API_KEY),
      baseUrl: process.env.INTRON_BASE_URL ? "configured" : "default",
    },
    whisper: { configured: Boolean(process.env.OPENAI_API_KEY) },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    },
    pwa: true,
    offlineDrafts: true,
  }),
});
