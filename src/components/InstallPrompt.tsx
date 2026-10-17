"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, X, Share, Plus } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const VISITS_KEY = "beta-eta-visits";
const PROMPT_STATE_KEY = "beta-eta-prompt-state";
const DISMISS_KEY = "beta-eta-install-dismissed-at";
const SESSION_DISMISS_KEY = "beta-eta-install-dismissed-session";
const DISMISS_DAYS = 7;

export function InstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (window.matchMedia("(display-mode: standalone)").matches || nav.standalone) {
      setMode("hidden");
      return;
    }

    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
      setMode("hidden");
      return;
    }

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400_000) {
      setMode("hidden");
      return;
    }

    const visits = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1;
    localStorage.setItem(VISITS_KEY, String(visits));
    if (visits < 2) {
      setMode("hidden");
      return;
    }

    const savedMode = sessionStorage.getItem(PROMPT_STATE_KEY);
    if (savedMode === "android" || savedMode === "ios") {
      setMode(savedMode);
      return;
    }

    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    if (isIOS && !isStandalone) {
      setMode("ios");
      sessionStorage.setItem(PROMPT_STATE_KEY, "ios");
      return;
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setMode((prev) => (prev === "hidden" ? "android" : prev));
      if (!sessionStorage.getItem(PROMPT_STATE_KEY)) {
        sessionStorage.setItem(PROMPT_STATE_KEY, "android");
      }
    };

    const onInstalled = () => {
      sessionStorage.removeItem(PROMPT_STATE_KEY);
      sessionStorage.removeItem(SESSION_DISMISS_KEY);
      setMode("hidden");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    sessionStorage.removeItem(PROMPT_STATE_KEY);
    setMode("hidden");
  }

  async function installAndroid() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      sessionStorage.removeItem(PROMPT_STATE_KEY);
      sessionStorage.removeItem(SESSION_DISMISS_KEY);
      setMode("hidden");
    }
    setDeferredPrompt(null);
  }

  if (mode === "hidden") return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
            {mode === "android" ? (
              <Download className="w-5 h-5 text-orange-400" />
            ) : (
              <Share className="w-5 h-5 text-orange-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Install B-ETA</div>
            {mode === "android" ? (
              <div className="text-xs text-neutral-400 mt-1">
                Add the app to your home screen for faster access and offline use.
              </div>
            ) : (
              <div className="text-xs text-neutral-400 mt-1">
                Tap <Share className="inline w-3 h-3 mx-0.5" /> then{" "}
                <span className="inline-flex items-center gap-0.5">
                  Add to Home Screen <Plus className="w-3 h-3" />
                </span>{" "}
                to install B-ETA.
              </div>
            )}
            {mode === "android" && (
              <button
                onClick={installAndroid}
                className="mt-3 w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium py-2 rounded-lg"
              >
                Install
              </button>
            )}
            <button
              onClick={dismiss}
              className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-300 py-1"
            >
              Not now
            </button>
          </div>
          <button
            onClick={dismiss}
            className="text-neutral-600 hover:text-neutral-300 shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}