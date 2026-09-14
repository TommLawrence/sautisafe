import { makeFunctionReference } from "convex/server";

export const convexApi = {
  audio: {
    generateUploadUrl: makeFunctionReference<"mutation">("audio:generateUploadUrl"),
    saveAudio: makeFunctionReference<"mutation">("audio:saveAudio"),
  },
  incidents: {
    nextReferenceNo: makeFunctionReference<"query">("incidents:nextReferenceNo"),
    listIncidents: makeFunctionReference<"query">("incidents:listIncidents"),
    getIncidentDetail: makeFunctionReference<"query">("incidents:getIncidentDetail"),
    createIncident: makeFunctionReference<"mutation">("incidents:createIncident"),
    updateIncident: makeFunctionReference<"mutation">("incidents:updateIncident"),
  },
  transcripts: {
    addTranscript: makeFunctionReference<"mutation">("transcripts:addTranscript"),
  },
  followUps: {
    createFollowUp: makeFunctionReference<"mutation">("followUps:createFollowUp"),
    answerFollowUp: makeFunctionReference<"mutation">("followUps:answerFollowUp"),
  },
  benchmark: {
    listBenchmarkRuns: makeFunctionReference<"query">("benchmark:listBenchmarkRuns"),
    saveBenchmarkRun: makeFunctionReference<"mutation">("benchmark:saveBenchmarkRun"),
  },
  actions: {
    transcribe: {
      transcribeWithProvider: makeFunctionReference<"action">(
        "actions/transcribe:transcribeWithProvider",
      ),
      runBenchmark: makeFunctionReference<"action">("actions/transcribe:runBenchmark"),
    },
    extract: {
      extractSafetyFields: makeFunctionReference<"action">(
        "actions/extract:extractSafetyFields",
      ),
    },
  },
  status: {
    get: makeFunctionReference<"query">("status:get"),
  },
} as const;
