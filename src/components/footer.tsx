"use client";
import * as React from "react";
import { ShieldCheck, FileText, Lock, Info } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/lib/store";

/** Desktop-only organised footer with Terms + Privacy sheets.
 *  Mobile uses the bottom nav instead (see app-shell). */
export function Footer() {
  const [legal, setLegal] = React.useState<null | "terms" | "privacy">(null);
  const setTab = useAppStore((s) => s.setTab);

  return (
    <>
      <footer className="mt-auto hidden border-t border-border bg-muted/30 sm:block">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-6 py-8 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-bold tracking-tight">SautiSafe</span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Emergency procedures come first. This tool documents and routes, never replaces them.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resources
            </p>
            <ul className="space-y-1.5 text-sm">
              <li>
                <button
                  onClick={() => setLegal("terms")}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5" /> Terms of service
                </button>
              </li>
              <li>
                <button
                  onClick={() => setLegal("privacy")}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Lock className="h-3.5 w-3.5" /> Privacy policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => setTab("about")}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" /> About + safeguards
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2 md:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Instance
            </p>
            <p className="text-xs text-muted-foreground">
              Test instance in the Z cloud.
              <br />
              Production backend in <code className="font-mono">convex/</code>.
            </p>
            <p className="text-xs text-muted-foreground">
              Speech: Intron (Sahara), Whisper, Gemini.
            </p>
          </div>
        </div>
      </footer>

      <Sheet open={legal === "terms"} onOpenChange={(o) => !o && setLegal(null)}>
        <SheetContent className="flex h-full w-full flex-col gap-0 sm:max-h-[90vh] sm:max-w-lg">
          <SheetHeader className="border-b pr-6">
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Terms of service
            </SheetTitle>
            <SheetDescription>SautiSafe prototype - last updated for the competition submission.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 scroll-thin">
            <div className="space-y-4 p-4 pr-6 text-sm leading-relaxed text-muted-foreground">
              <TermsContent />
            </div>
          </ScrollArea>
          <div className="border-t p-4 pr-6">
            <Button className="w-full" onClick={() => setLegal(null)}>
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={legal === "privacy"} onOpenChange={(o) => !o && setLegal(null)}>
        <SheetContent className="flex h-full w-full flex-col gap-0 sm:max-h-[90vh] sm:max-w-lg">
          <SheetHeader className="border-b pr-6">
            <SheetTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> Privacy policy
            </SheetTitle>
            <SheetDescription>How SautiSafe handles audio, transcripts, and personal data.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 scroll-thin">
            <div className="space-y-4 p-4 pr-6 text-sm leading-relaxed text-muted-foreground">
              <PrivacyContent />
            </div>
          </ScrollArea>
          <div className="border-t p-4 pr-6">
            <Button className="w-full" onClick={() => setLegal(null)}>
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p>
        <strong>1. What this is.</strong> SautiSafe is a prototype voice reporting aid for
        industrial safety incidents and near misses. It transcribes code-switched speech
        (English with Luganda, Swahili, or another local language), extracts structured safety
        fields, asks focused follow-ups, flags urgent language, and produces a report for
        supervisor review. It is a documentation and routing aid only.
      </p>
      <p>
        <strong>2. Not an emergency service.</strong> SautiSafe is not an emergency channel and
        must not be used in place of your site emergency procedures. If there is an active fire,
        injury, gas leak, or danger to life, raise the alarm and call your site emergency number
        before recording anything.
      </p>
      <p>
        <strong>3. Never declares equipment safe.</strong> The tool never declares equipment safe,
        never diagnoses a technical fault, and never triggers or replaces an emergency procedure.
        A qualified person must confirm equipment safety in writing.
      </p>
      <p>
        <strong>4. Consent.</strong> Recording requires the reporter&apos;s explicit consent
        (a checkbox before the microphone activates). Reports may be submitted anonymously; names
        are optional.
      </p>
      <p>
        <strong>5. Benchmark material.</strong> Any benchmark uses consented, original samples.
        No real worker or company names appear in benchmark material. External datasets are not
        bundled; any non-provided dataset or provider is declared in the submission per the
        organisers&apos; guidance.
      </p>
      <p>
        <strong>6. Acceptable use + non-retaliation.</strong> Reporting a hazard must never put a
        worker at risk. The platform follows non-retaliation principles. Misuse (false reports,
        harassment, exposing others&apos; identities) is prohibited.
      </p>
      <p>
        <strong>7. Provided as is.</strong> The prototype is provided &quot;as is&quot; for the
        competition. No warranty of fitness for a particular safety-critical purpose.
      </p>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p>
        <strong>1. What we collect.</strong> Audio recordings, the transcript, structured report
        fields (location, equipment, hazard, people affected, action, injury, severity, time),
        follow-up answers, urgency tags, and an append-only audit trail. The persisted audio is
        kept linked to the report for verification.
      </p>
      <p>
        <strong>2. Why.</strong> To produce and verify safety reports and to benchmark speech
        models on real field audio. The benchmark measures transcription accuracy (WER, CER,
        critical-term recall) against a supervisor-verified reference transcript.
      </p>
      <p>
        <strong>3. Consent.</strong> An explicit consent checkbox must be ticked before recording.
        Reports may be anonymous.
      </p>
      <p>
        <strong>4. Speech providers.</strong> Audio is sent server-side to the speech provider
        (Intron / Sahara by default, with Whisper and Gemini available for benchmarking). Provider
        API keys live only in deployment environment variables; the browser never receives them.
        In this test instance audio is persisted to local disk; production uses Convex file storage.
      </p>
      <p>
        <strong>5. Retention + deletion.</strong> Audio and transcripts are retained linked to the
        report for verification. A supervisor or admin can delete a report (and its linked audio
        and audit trail). Offline drafts are stored locally in the browser (IndexedDB) until
        submitted.
      </p>
      <p>
        <strong>6. Sharing.</strong> Reports are reviewed by supervisors through the platform. We do
        not sell or share personal data with third parties.
      </p>
      <p>
        <strong>7. Your rights.</strong> You may access, correct, or delete your reports. Contact
        the site safety officer or the platform administrator.
      </p>
      <p>
        <strong>8. Children.</strong> SautiSafe is not intended for use by anyone under 18.
      </p>
      <p>
        <strong>9. Changes.</strong> We will update this policy as the prototype matures.
      </p>
    </>
  );
}
