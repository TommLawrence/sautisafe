"use client";
import * as React from "react";
import { LogOut, User as UserIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/** Shows the signed-in user's email + a logout action. Fetches /api/auth/me
 *  once on mount; if there's no session the app would already be on the
 *  login gate, so this renders null. */
export function UserMenu() {
  const [user, setUser] = React.useState<{ email: string; role?: string } | null>(null);

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: { email: string; role?: string } | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  if (!user) return null;
  const initial = user.email[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {initial}
          </span>
          <span className="hidden max-w-[10ch] truncate sm:inline">{user.email}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="h-4 w-4" />
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        <div className="px-2 text-xs text-muted-foreground capitalize">
          {user.role ?? "worker"}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            toast.success("Signed out");
            window.location.href = "/";
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
