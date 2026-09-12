"use client";
import { HardHat, ClipboardCheck } from "lucide-react";
import { useAppStore, type Role } from "@/lib/store";

/** Static, non-interactive role badge. The role is locked for the session
 *  (chosen once on the landing); a refresh returns to the landing to re-pick.
 *  There is no in-app way to switch roles. */
export function RoleBadge() {
  const role = useAppStore((s) => s.role);
  if (!role) return null;
  const meta: Record<Role, { label: string; icon: typeof HardHat }> = {
    technician: { label: "Technician", icon: HardHat },
    supervisor: { label: "Supervisor", icon: ClipboardCheck },
  };
  const Icon = meta[role].icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="hidden sm:inline">{meta[role].label}</span>
    </span>
  );
}
