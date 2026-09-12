"use client";
import * as React from "react";
import { Mic, ClipboardList, FlaskConical, Info, ShieldCheck, WifiOff } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";
import { InstallPrompt } from "@/components/install-prompt";
import { OfflineDraftsButton } from "@/components/offline-drafts-button";
import { useAppStore, type TabKey } from "@/lib/store";
import { retryAllDrafts } from "@/lib/drafts-store";
import { cn } from "@/lib/utils";
import { ReportTab } from "@/components/tabs/report-tab";
import { ReportsTab } from "@/components/tabs/reports-tab";
import { BenchmarkTab } from "@/components/tabs/benchmark-tab";
import { AboutTab } from "@/components/tabs/about-tab";
import { toast } from "sonner";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "report", label: "Report", icon: Mic },
  { key: "reports", label: "Reports", icon: ClipboardList },
  { key: "benchmark", label: "Benchmark", icon: FlaskConical },
  { key: "about", label: "About", icon: Info },
];

export function AppShell() {
  const { tab, setTab } = useAppStore();

  // Honour ?tab= from PWA manifest shortcuts.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as TabKey | null;
    if (t && ["report", "reports", "benchmark", "about"].includes(t)) {
      setTab(t);
    }
  }, [setTab]);

  // Auto-retry queued offline drafts when connectivity returns.
  React.useEffect(() => {
    const onOnline = () => {
      retryAllDrafts().then((outcomes) => {
        const ok = outcomes.filter((o) => o.ok).length;
        if (ok > 0) toast.success(`Submitted ${ok} offline report${ok > 1 ? "s" : ""}`);
      });
    };
    window.addEventListener("online", onOnline);
    // Also retry once on mount (recovery after accidental refresh/closure).
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const t = setTimeout(() => {
        retryAllDrafts().then((o) => {
          const ok = o.filter((x) => x.ok).length;
          if (ok > 0) toast.success(`Submitted ${ok} offline report${ok > 1 ? "s" : ""}`);
        });
      }, 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("online", onOnline);
      };
    }
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header tab={tab} setTab={setTab} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-8">
        {tab === "report" && <ReportTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "benchmark" && <BenchmarkTab />}
        {tab === "about" && <AboutTab />}
      </main>
      <Footer />
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

function Header({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">SautiSafe</p>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              Safer reporting, in the language workers actually speak
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-2">
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </span>
          )}
          <OfflineDraftsButton />
          <InstallPrompt />
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}

/** Mobile bottom navigation (fixed). Hidden on >= sm where the header nav is used. */
function BottomNav({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto grid h-16 max-w-5xl grid-cols-4">
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-auto hidden border-t border-border bg-muted/30 sm:block">
      <div className="mx-auto w-full max-w-5xl px-6 py-5">
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
