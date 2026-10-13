import { useEffect, useRef, useState } from "react";
import { HandsFreeCamera, type CameraPhase, type HandsFreeHost } from "./handsFreeCamera.ts";
import type { PageTurn } from "./yaw.ts";

export type HandsFreeStatus = CameraPhase | "unsupported";

export function handsFreeSupported(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}

type HandsFree = {
  supported: boolean;
  enabled: boolean;
  status: HandsFreeStatus;
  faceSeen: boolean;
  canRecalibrate: boolean;
  notice: string | null;
  toggle: () => void;
  confirmCenter: () => void;
  recalibrate: () => void;
};

export function useHandsFree(onTurn: (direction: PageTurn) => void): HandsFree {
  const supported = handsFreeSupported();
  const onTurnRef = useRef(onTurn);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<HandsFreeStatus>(supported ? "off" : "unsupported");
  const [faceSeen, setFaceSeen] = useState(false);
  const [canRecalibrate, setCanRecalibrate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cameraRef = useRef<HandsFreeCamera | null>(null);

  useEffect(() => {
    onTurnRef.current = onTurn;
  });

  function ensureCamera(): HandsFreeCamera {
    const existing = cameraRef.current;
    if (existing) return existing;
    const host: HandsFreeHost = {
      onPhase: (phase) => setStatus(phase),
      onFace: (seen) => setFaceSeen(seen),
      onTurn: (direction) => onTurnRef.current(direction),
      onUnavailable: () => {
        setNotice("Camera unavailable. Swipe still turns the page.");
        setFaceSeen(false);
        setStatus("off");
        setEnabled(false);
      },
      onCalibrated: (ready) => setCanRecalibrate(ready),
    };
    const camera = new HandsFreeCamera(host);
    cameraRef.current = camera;
    return camera;
  }

  useEffect(() => {
    if (!enabled) {
      cameraRef.current?.stopTracks();
      return;
    }
    const camera = ensureCamera();
    let cancelled = false;
    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") camera.pause();
      else camera.resume();
    };
    const onPageHide = () => {
      if (!cancelled) camera.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    void camera.start();
    return () => {
      cancelled = true;
      camera.pause();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled]);

  useEffect(() => {
    return () => {
      cameraRef.current?.dispose();
      cameraRef.current = null;
    };
  }, []);

  function toggle() {
    if (!supported) return;
    setNotice(null);
    if (enabled) {
      ensureCamera().stopTracks();
      setFaceSeen(false);
      setStatus("off");
      setEnabled(false);
      return;
    }
    setStatus("starting");
    setEnabled(true);
  }

  function confirmCenter() {
    cameraRef.current?.confirmCenter();
  }

  function recalibrate() {
    ensureCamera().recalibrate();
  }

  return {
    supported,
    enabled,
    status,
    faceSeen,
    canRecalibrate,
    notice,
    toggle,
    confirmCenter,
    recalibrate,
  };
}
