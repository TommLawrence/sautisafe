"use client";
import * as React from "react";
import { ChevronDown, HardHat, ClipboardCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore, type Role } from "@/lib/store";
import { toast } from "sonner";

/** Header dropdown: shows the current role, lets the user switch roles
 *  (Technician / Supervisor) or sign out (back to the landing picker). */
export function RoleSwitcher() {
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const setTab = useAppStore((s) => s.setTab);
  if (!role) return null;

  const meta: Record<Role, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    technician: { label: "Technician", icon: HardHat },
    supervisor: { label: "Supervisor", icon: ClipboardCheck },
  };
  const Icon = meta[role].icon;

  function switchTo(r: Role) {
    setRole(r);
    setTab(r === "supervisor" ? "reports" : "report");
    toast.success(`Switched to ${meta[r].label}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Icon className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">{meta[role].label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Switch role</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => switchTo("technician")}>
          <HardHat className="h-4 w-4" /> Technician
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchTo("supervisor")}>
          <ClipboardCheck className="h-4 w-4" /> Supervisor
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setRole(null);
            setTab("report");
            toast.info("Signed out");
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
