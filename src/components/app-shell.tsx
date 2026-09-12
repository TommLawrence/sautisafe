"use client";
import * as React from "react";
import { Mic, ClipboardList, FlaskConical, Info, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";
import { useAppStore, type TabKey } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ReportTab } from "@/components/tabs/report-tab";
import { ReportsTab } from "@/components/tabs/reports-tab";
import { BenchmarkTab } from "@/components/tabs/benchmark-tab";
import { AboutTab } from "@/components/tabs/about-tab";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "report", label: "Report", icon: Mic },
  { key: "reports", label: "Reports", icon: ClipboardList },
  { key: "benchmark", label: "Benchmark", icon: FlaskConical },
  { key: "about", label: "About", icon: Info },
];

export function AppShell() {
  const { tab, setTab } = useAppStore();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header tab={tab} setTab={setTab} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {tab === "report" && <ReportTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "benchmark" && <BenchmarkTab />}
        {tab === "about" && <AboutTab />}
      </main>
      <Footer />
    </div>
  );
}

function Header({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">SautiSafe</p>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Safer reporting, in the language workers actually speak
            </p>
          </div>
        </div>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto scroll-thin">
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
          <span className="mx-1 h-6 w-px bg-border" />
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/30">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-medium">Emergency procedures come first.</span>
            <span className="text-muted-foreground">
              This tool documents and routes — it never replaces them.
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            SautiSafe · test instance in the Z cloud · production backend in{" "}
            <code className="font-mono">convex/</code>
          </p>
        </div>
      </div>
    </footer>
  );
}
