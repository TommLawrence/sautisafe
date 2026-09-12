"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Mail, KeyRound, ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "sonner";

type Step = "request" | "verify";

async function requestOtp(identifier: string) {
  const res = await fetch("/api/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not send code");
  return data as { ok: true; demoOtp?: string; deliveredBy: string };
}

async function verifyOtp(identifier: string, code: string) {
  const res = await fetch("/api/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Verification failed");
  return data as { ok: true; user: { email: string; role: string } };
}

export function LoginGate() {
  const [step, setStep] = React.useState<Step>("request");
  const [identifier, setIdentifier] = React.useState("");
  const [code, setCode] = React.useState("");
  const [demoOtp, setDemoOtp] = React.useState<string | null>(null);

  const reqMut = useMutation({
    mutationFn: () => requestOtp(identifier),
    onSuccess: (data) => {
      setStep("verify");
      setDemoOtp(data.demoOtp ?? null);
      toast.success("Code sent", { description: `Delivered via ${data.deliveredBy}` });
    },
    onError: (e: Error) => toast.error("Could not send code", { description: e.message }),
  });

  const verMut = useMutation({
    mutationFn: () => verifyOtp(identifier, code),
    onSuccess: () => {
      toast.success("Signed in");
      // Hard reload so the server re-evaluates the session cookie and renders
      // the app instead of the login gate.
      window.location.href = "/";
    },
    onError: (e: Error) => toast.error("Could not sign in", { description: e.message }),
  });

  function backToRequest() {
    setStep("request");
    setCode("");
    setDemoOtp(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-safety-grid px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark className="h-16 w-16" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SautiSafe</h1>
            <p className="text-sm text-muted-foreground">
              Safer reporting, in the language workers actually speak.
            </p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {step === "request" ? "Sign in" : "Enter your code"}
            </CardTitle>
            <CardDescription>
              {step === "request"
                ? "Use your email or phone. We'll send a one-time code."
                : `A 6-digit code was sent to ${identifier}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "request" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (identifier.trim()) reqMut.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="identifier">Email or phone</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="identifier"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@site.co.ug"
                      className="h-11 pl-9"
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full"
                  disabled={reqMut.isPending || !identifier.trim()}
                >
                  {reqMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Send code
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim().length === 6) verMut.mutate();
                }}
                className="space-y-3"
              >
                {demoOtp && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <p className="font-medium">Demo mode — your code is:</p>
                      <p className="font-mono text-lg tracking-[0.3em] text-amber-700 dark:text-amber-300">
                        {demoOtp}
                      </p>
                      <p className="mt-1">
                        No email gateway is available in the Z cloud, so the code is shown here.
                        In production it would be delivered by email/SMS.
                      </p>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="code">6-digit code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      className="h-11 pl-9 font-mono text-lg tracking-[0.3em]"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full"
                  disabled={verMut.isPending || code.trim().length !== 6}
                >
                  {verMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>Sign in</>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={backToRequest}
                  className="w-full text-center text-xs text-muted-foreground hover:underline"
                >
                  Use a different email
                </button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground">
          Everything — auth included — runs in the Z cloud. No third-party identity provider.
        </p>
      </div>
    </div>
  );
}
