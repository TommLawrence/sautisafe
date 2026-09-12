"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "sautisafe:install-dismissed";

/** Shows an "Install SautiSafe" button when the browser fires
 *  beforeinstallprompt. Falls back to a manual iOS-instructions sheet on
 *  Safari (which never fires the event). */
export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [iosOpen, setIosOpen] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIos(ios);
    if (dismissed) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("SautiSafe installed");
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  // Chrome/Edge/Android: show the install button when the event has fired.
  if (deferred) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={async () => {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice.outcome === "accepted") {
            toast.success("Installing SautiSafe…");
          } else {
            localStorage.setItem(STORAGE_KEY, "1");
          }
          setDeferred(null);
        }}
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Install</span>
      </Button>
    );
  }

  // iOS Safari: never fires beforeinstallprompt; offer manual instructions.
  if (isIos) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setIosOpen(true)}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Install</span>
        </Button>
        <Sheet open={iosOpen} onOpenChange={setIosOpen}>
          <SheetContent className="sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Install SautiSafe on iPhone</SheetTitle>
              <SheetDescription>
                iOS doesn&apos;t support one-tap install. Add it to your home screen:
              </SheetDescription>
            </SheetHeader>
            <ol className="space-y-2 px-4 text-sm text-muted-foreground">
              <li>1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
              <li>2. Choose <strong>Add to Home Screen</strong>.</li>
              <li>3. Tap <strong>Add</strong>.</li>
            </ol>
            <SheetFooter className="mt-4">
              <Button className="w-full" onClick={() => setIosOpen(false)}>
                Got it
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return null;
}
