"use client";
import { useAppStore } from "@/lib/store";
import { Landing } from "@/components/landing";
import { AppShell } from "@/components/app-shell";

/** Client entry: shows the role-picker landing until a role is chosen, then
 *  the role-aware app shell. The role is persisted in localStorage. */
export function AppEntry() {
  const role = useAppStore((s) => s.role);
  if (!role) return <Landing />;
  return <AppShell />;
}
