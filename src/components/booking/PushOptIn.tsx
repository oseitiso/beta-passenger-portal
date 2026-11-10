"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { enablePush, isIosNeedingInstall, pushPermission, pushSupported } from "@/lib/push";

type State = "hidden" | "idle" | "busy" | "on" | "denied" | "error" | "ios";

export default function PushOptIn({ reference }: { reference: string }) {
  const [state, setState] = useState<State>("hidden");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!pushSupported()) {
      setState(isIosNeedingInstall() ? "ios" : "hidden");
      return;
    }
    const perm = pushPermission();
    if (perm === "denied") {
      setState("denied");
      return;
    }
    if (perm === "granted") {
      // Already allowed on this device: register this booking quietly.
      setState("busy");
      enablePush(reference, false).then((r) => {
        if (!cancelled) setState(r.ok ? "on" : "idle");
      });
      return;
    }
    setState("idle");
    return () => {
      cancelled = true;
    };
  }, [reference]);

  const turnOn = async () => {
    setState("busy");
    setMessage("");
    const r = await enablePush(reference, true);
    if (r.ok) {
      setState("on");
    } else if (r.error && r.error.indexOf("blocked") >= 0) {
      setState("denied");
    } else {
      setMessage(r.error ?? "Could not turn on alerts.");
      setState("error");
    }
  };

  if (state === "hidden") return null;

  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2 text-xs text-neutral-300">
      <BellRing className="h-3.5 w-3.5 shrink-0 text-orange-500" />
      {state === "on" && <span>Alerts are on for this booking, even when your phone is locked.</span>}
      {state === "busy" && <span>Turning on alerts...</span>}
      {state === "denied" && <span>Alerts are blocked in your browser settings.</span>}
      {state === "ios" && (
        <span>To get alerts when your phone is locked, add B-ETA to your Home Screen from the Share menu.</span>
      )}
      {(state === "idle" || state === "error") && (
        <>
          <span className="flex-1">
            {state === "error" ? message : "Get bus alerts even when your phone is locked."}
          </span>
          <button
            onClick={turnOn}
            className="shrink-0 rounded-md bg-orange-600 px-3 py-1 font-semibold text-white hover:bg-orange-500"
          >
            Turn on alerts
          </button>
        </>
      )}
    </div>
  );
}
