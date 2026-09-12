"use client";
import * as React from "react";
import { Loader2, RotateCcw, Trash2, Inbox, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAllDrafts,
  retryAllDrafts,
  retryDraft,
  deleteDraft,
  useDraftCount,
  notifyDraftsChanged,
  type DraftReport,
} from "@/lib/drafts-store";
import { toast } from "sonner";
import { timeAgo } from "@/lib/time";

export function OfflineDraftsButton() {
  const count = useDraftCount();
  const [open, setOpen] = React.useState(false);
  if (count === 0) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={`${count} offline report${count > 1 ? "s" : ""} queued`}
      >
        <Inbox className="h-4 w-4" />
        <span className="hidden sm:inline">Offline</span>
        <Badge className="ml-0.5 h-5 min-w-5 justify-center px-1 text-[10px]">
          {count}
        </Badge>
      </Button>
      <OfflineDraftsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function OfflineDraftsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [drafts, setDrafts] = React.useState<DraftReport[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setDrafts(await getAllDrafts());
  }, []);

  React.useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  async function handleRetryAll() {
    setBusy("__all__");
    const outcomes = await retryAllDrafts();
    notifyDraftsChanged();
    const ok = outcomes.filter((o) => o.ok).length;
    if (ok > 0) toast.success(`Submitted ${ok} report${ok > 1 ? "s" : ""}`);
    const failed = outcomes.length - ok;
    if (failed > 0) toast.warning(`${failed} still failed`);
    await refresh();
    setBusy(null);
  }

  async function handleRetryOne(d: DraftReport) {
    setBusy(d.id);
    const out = await retryDraft(d);
    notifyDraftsChanged();
    if (out.ok) toast.success(`Submitted ${out.referenceNo}`);
    else toast.error("Still failing", { description: out.error });
    await refresh();
    setBusy(null);
  }

  async function handleDiscard(d: DraftReport) {
    await deleteDraft(d.id);
    notifyDraftsChanged();
    await refresh();
    toast.success("Draft discarded");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b pr-6">
          <SheetTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            Offline drafts
          </SheetTitle>
          <SheetDescription>
            Reports saved while offline. They submit automatically when you reconnect - or retry now.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 scroll-thin">
          <ul className="divide-y divide-border p-2 pr-4">
            {drafts.map((d) => (
              <li key={d.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">
                      {d.fields.hazard || d.transcript || "Untitled report"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.audioFileName} · {timeAgo(new Date(d.createdAt))}
                    </p>
                    {d.error && (
                      <p className="text-xs text-destructive">Last error: {d.error}</p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      d.status === "failed"
                        ? "border-destructive/40 text-destructive"
                        : "border-amber-400 text-amber-700 dark:text-amber-300"
                    }
                  >
                    {d.status}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1"
                    disabled={busy === d.id || busy === "__all__"}
                    onClick={() => handleRetryOne(d)}
                  >
                    {busy === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-muted-foreground"
                    disabled={busy === d.id}
                    onClick={() => handleDiscard(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
            {drafts.length === 0 && (
              <li className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-6 w-6" />
                <p className="text-sm">No offline drafts.</p>
              </li>
            )}
          </ul>
        </ScrollArea>
        {drafts.length > 0 && (
          <div className="border-t p-4 pr-6">
            <Button
              className="w-full"
              disabled={busy === "__all__"}
              onClick={handleRetryAll}
            >
              {busy === "__all__" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry all ({drafts.length})
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
