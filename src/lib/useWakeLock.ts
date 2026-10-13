import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let released = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (released) {
          await next.release();
          return;
        }
        sentinel = next;
      } catch {
        // Reading still works if the browser refuses the lock.
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
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
}
