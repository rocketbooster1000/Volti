import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator.wakeLock?.request !== "function") return;
    let released = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (released) {
          await next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch {
        // Plain HTTP and older Safari have no wake lock. Reading still works.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
