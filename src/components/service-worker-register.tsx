"use client";
import * as React from "react";
import { toast } from "sonner";

/** Registers the SautiSafe service worker in production and shows a
 *  "Updated - reload" toast when a new version takes over. */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("SW registration failed", err));
    };
    window.addEventListener("load", onLoad);
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      if (!navigator.serviceWorker.controller) return;
      reloaded = true;
      toast.info("SautiSafe updated", {
        description: "A new version is ready - reload to apply.",
        duration: 12000,
        action: {
          label: "Reload",
          onClick: () => window.location.reload(),
        },
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
