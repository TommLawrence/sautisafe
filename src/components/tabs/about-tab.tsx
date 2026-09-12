"use client";
import {
  ShieldCheck,
  Mic,
  Lock,
  Users,
  AlertTriangle,
  HeartHandshake,
  ScrollText,
  Database,
  KeyRound,
  ServerOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";

export function AboutTab() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-safety-grid border-b border-border">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <BrandMark className="h-14 w-14 shrink-0" />
            <div>
              <h2 className="text-xl font-bold tracking-tight">SautiSafe</h2>
              <p className="text-sm text-muted-foreground">
                Safer reporting, in the language workers actually speak.
              </p>
            </div>
          </CardContent>
        </div>
        <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            SautiSafe is a code-switched voice reporting assistant for industrial
            safety incidents and near misses. Workers in factories, construction,
            warehouses, transport, mining, and field operations often report hazards
            verbally because formal written reports are slow and intimidating — and
            because they naturally mix English with Luganda, Swahili, or another local
            language. SautiSafe transcribes that speech, extracts structured safety
            fields, asks focused follow-ups when information is missing, flags urgent
            language, and produces a clean report for supervisor review.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Required safeguards
          </CardTitle>
          <CardDescription>
            Built into this prototype to keep the workflow safe and honest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SAFEGUARDS.map((s) => (
              <li key={s.title} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <s.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            What SautiSafe will never do
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {NEVER_DO.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-primary" />
            Ethics &amp; inclusion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            SautiSafe supports workers who communicate better verbally, in the languages
            they actually use. It enforces explicit consent before recording, restricts
            access to audio and transcripts, and follows non-retaliation principles —
            reporting a hazard should never put a worker at risk.
          </p>
          <p>
            Benchmark material uses only consented, original samples. No real worker or
            company names appear in benchmark data. The labelled evaluation set is a
            small sample, not a claim to represent every Ugandan or East African worker.
          </p>
          <p>
            Urgent-risk detection is an aid, not an emergency procedure. When the system
            detects language like fire, chemical exposure, electrocution, uncontrolled
            pressure, injury, or gas leak, it flags the report for immediate human review —
            it never acts on it automatically.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Architecture &amp; data ownership
          </CardTitle>
          <CardDescription>
            This test instance runs in the Z cloud. The production backend lives in Convex.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            For testing, the backend sits here in the Z cloud: Next.js API routes call the
            z-ai ASR (as a Sahara proxy) and the LLM for structured extraction. Audio is
            kept linked to the incident record for verification.
          </p>
          <p>
            The production backend is already written in the{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">convex/</code>{" "}
            folder: Convex owns database records, audio storage, speech-provider calls,
            report workflows, benchmark execution, audit events, and API secrets. The
            browser never receives Sahara, Whisper, or Gemini API keys.
          </p>
          <p>
            See <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">convex/MIGRATION.md</code>{" "}
            for the full Prisma→Convex field mapping, the live-route→Convex-function
            mapping, and deployment steps.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const SAFEGUARDS = [
  { icon: Mic, title: "Consent before recording", body: "An explicit consent checkbox must be ticked before the microphone activates." },
  { icon: AlertTriangle, title: "Emergency-procedures-first warning", body: "Workers are told to raise the alarm and call the site emergency number before recording an active incident." },
  { icon: Lock, title: "Max recording duration", body: "Recordings are capped at 3 minutes to keep the workflow usable and audio lightweight." },
  { icon: Database, title: "25 MB audio limit & MIME validation", body: "Audio is size- and type-validated before upload. Only known audio MIME types are accepted." },
  { icon: ServerOff, title: "No silent fallback in benchmark", body: "If a speech provider key is missing, that benchmark lane reports a clear error instead of substituting another model." },
  { icon: Users, title: "Human transcript confirmation", body: "Supervisors confirm the transcript and structured fields before a report is finalised." },
  { icon: KeyRound, title: "Secrets never reach the browser", body: "Speech-provider keys live only in deployment environment variables, never in the frontend bundle." },
  { icon: ScrollText, title: "Append-only audit trail", body: "Every meaningful action — recorded, transcribed, extracted, reviewed, escalated — is logged immutably." },
];

const NEVER_DO = [
  "Never declare equipment safe. A qualified person must confirm that in writing.",
  "Never diagnose a technical fault or suggest a repair.",
  "Never replace an emergency procedure or trigger one automatically.",
  "Never include real worker or company names in benchmark material.",
  "Never expose speech-provider API keys to the browser.",
];
