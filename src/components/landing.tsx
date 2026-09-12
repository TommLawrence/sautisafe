"use client";
import * as React from "react";
import { HardHat, ClipboardCheck, ArrowRight, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore, type Role } from "@/lib/store";

/** Landing / role picker. Shown when no role is chosen yet.
 *  A technician records + submits reports; a supervisor reviews the team's
 *  reports. The role is stored locally (no auth) and switchable anytime. */
export function Landing() {
  const setRole = useAppStore((s) => s.setRole);
  const setTab = useAppStore((s) => s.setTab);

  function choose(role: Role) {
    setRole(role);
    // supervisors land on their queue; technicians land on the recorder
    setTab(role === "supervisor" ? "reports" : "report");
  }

  return (
    <div className="flex min-h-screen flex-col bg-safety-grid">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark className="h-20 w-20" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">SautiSafe</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Safer reporting, in the language workers actually speak.
            </p>
          </div>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Code-switched voice reporting for industrial safety incidents. Record
            in English mixed with Luganda, Swahili, or your local language, get a
            structured safety report, and route it straight to your supervisor.
          </p>
        </div>

        <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
          <button onClick={() => choose("technician")} className="text-left">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <HardHat className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-base font-semibold">Technician</p>
                    <p className="text-xs text-muted-foreground">Field / line worker</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Record or upload an incident report. Speak naturally, mix
                  languages. SautiSafe transcribes it, extracts the safety fields,
                  and submits it straight to your supervisor for review.
                </p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Continue as Technician <ArrowRight className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </button>

          <button onClick={() => choose("supervisor")} className="text-left">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ClipboardCheck className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-base font-semibold">Supervisor</p>
                    <p className="text-xs text-muted-foreground">Safety officer</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Review the team's incident reports and near misses. Verify
                  transcripts, escalate urgent cases, resolve, and export. You can
                  also record a report yourself if you witness an incident.
                </p>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Continue as Supervisor <ArrowRight className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Emergency procedures come first. This tool documents and routes, never replaces them.
        </p>
      </main>
    </div>
  );
}
