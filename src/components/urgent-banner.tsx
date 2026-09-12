"use client";
import * as React from "react";
import { AlertTriangle, Siren, Flame, Zap, Wind, Bandage, CloudAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const TAG_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  fire: { label: "Fire", icon: Flame },
  chemical: { label: "Chemical exposure", icon: Wind },
  electrocution: { label: "Electrocution risk", icon: Zap },
  "uncontrolled-pressure": { label: "Uncontrolled pressure", icon: Siren },
  injury: { label: "Injury", icon: Bandage },
  "gas-leak": { label: "Gas leak", icon: CloudAlert },
  explosion: { label: "Explosion", icon: Siren },
  collapse: { label: "Collapse", icon: AlertTriangle },
  entanglement: { label: "Entanglement", icon: AlertTriangle },
};

/** Hi-vis urgent-risk banner. Shown when a transcript contains urgent language.
 *  Never auto-declares equipment safe — always routes to a human. */
export function UrgentBanner({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div
      role="alert"
      className="overflow-hidden rounded-xl border border-destructive/40 shadow-sm"
    >
      <div className="bg-hivis-stripes px-1 py-0.5">
        <div className="flex items-start gap-3 rounded-md bg-destructive px-4 py-3 text-destructive-foreground">
          <Siren className="mt-0.5 h-5 w-5 shrink-0 animate-rec-pulse" />
          <div className="space-y-1">
            <p className="font-semibold leading-tight">
              Urgent language detected — follow emergency procedures first.
            </p>
            <p className="text-sm text-destructive-foreground/90">
              This report is flagged for immediate supervisor review. This is an
              aid, not an emergency response. Never rely on it to declare
              equipment safe.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((t) => {
                const meta = TAG_META[t] ?? { label: t, icon: AlertTriangle };
                const Icon = meta.icon;
                return (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-destructive-foreground/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-destructive-foreground/30"
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact urgency chip used in lists. */
export function UrgentChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive ring-1 ring-destructive/30",
        className,
      )}
    >
      <Siren className="h-3 w-3" /> Urgent
    </span>
  );
}
