"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { Mic, ClipboardList, FlaskConical, Info, WifiOff, MoreHorizontal, FileText, Lock, ExternalLink } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ModeToggle } from "@/components/mode-toggle";
import { InstallPrompt } from "@/components/install-prompt";
import { OfflineDraftsButton } from "@/components/offline-drafts-button";
import { Footer, type LegalPage } from "@/components/footer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore, type TabKey, type Role } from "@/lib/store";
import { retryAllDrafts } from "@/lib/drafts-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Lazy-load each tab so the initial bundle excludes recharts + the heavy
// recorder/extract code; only the active tab's chunk loads.
const ReportTab = dynamic(() => import("@/components/tabs/report-tab").then((m) => m.ReportTab), { loading: () => <TabSkeleton />, ssr: false });
const ReportsTab = dynamic(() => import("@/components/tabs/reports-tab").then((m) => m.ReportsTab), { loading: () => <TabSkeleton />, ssr: false });
const BenchmarkTab = dynamic(() => import("@/components/tabs/benchmark-tab").then((m) => m.BenchmarkTab), { loading: () => <TabSkeleton />, ssr: false });
const AboutTab = dynamic(() => import("@/components/tabs/about-tab").then((m) => m.AboutTab), { loading: () => <TabSkeleton />, ssr: false });

function TabSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "report", label: "Report", icon: Mic },
  { key: "reports", label: "Reports", icon: ClipboardList },
  { key: "benchmark", label: "Benchmark", icon: FlaskConical },
  { key: "about", label: "About", icon: Info },
];

/** Tabs visible for a given role. Technicians don't see the supervisor queue. */
function tabsFor(role: Role | null) {
  if (role === "technician") return TABS.filter((t) => t.key !== "reports");
  return TABS;
}

export function AppShell() {
  const { tab, setTab, role } = useAppStore();
  const tabs = tabsFor(role);
  const [legal, setLegal] = React.useState<LegalPage>(null);

  // Honour ?tab= from PWA manifest shortcuts (only if visible for the role).
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab") as TabKey | null;
    if (t && tabs.some((tab) => tab.key === t)) {
      setTab(t);
    }
  }, [setTab, tabs]);

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
      <Header tab={tab} setTab={setTab} tabs={tabs} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-8">
        {tab === "report" && <ReportTab />}
        {tab === "reports" && role === "supervisor" && <ReportsTab />}
        {tab === "benchmark" && <BenchmarkTab />}
        {tab === "about" && <AboutTab />}
      </main>
      <Footer legal={legal} setLegal={setLegal} />
      <BottomNav tab={tab} setTab={setTab} tabs={tabs} setLegal={setLegal} />
    </div>
  );
}

function Header({ tab, setTab, tabs }: { tab: TabKey; setTab: (t: TabKey) => void; tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] }) {
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
            <p className="max-w-[155px] text-[10px] text-muted-foreground sm:max-w-none sm:text-[11px]">
              <span className="sm:hidden">Voice-first safety reporting</span>
              <span className="hidden sm:inline">Safer reporting, in the language workers actually speak</span>
            </p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-1 sm:flex">
          {tabs.map((t) => {
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
          <ModeToggle className="hidden sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}

/** Mobile bottom navigation (fixed). Hidden on >= sm where the header nav is used. */
function BottomNav({ tab, setTab, tabs, setLegal }: { tab: TabKey; setTab: (t: TabKey) => void; tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[]; setLegal: React.Dispatch<React.SetStateAction<LegalPage>> }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div
        className="mx-auto grid h-16 max-w-5xl"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors" aria-label="More options">
              <MoreHorizontal className="h-5 w-5" />
              More
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={10} className="mb-1 w-56 p-2">
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">Resources</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setLegal("terms")}>
              <FileText /> Terms of service
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLegal("privacy")}>
              <Lock /> Privacy policy
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTab("about")}>
              <Info /> About + safeguards
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://crane-systems.vercel.app/" target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Crane Systems
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ModeToggle labeled />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
