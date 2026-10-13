import { createFaceYawReader, type FaceYawReader } from "./facePose.ts";
import { createYawGate, type PageTurn, type YawGate } from "./yaw.ts";

const FRAME_MS = 100;
const FRAME_LONG_SIDE = 192;
const LOST_FACE_MS = 400;

export type CameraPhase = "off" | "starting" | "calibrating" | "on" | "lost";

export type HandsFreeHost = {
  onPhase: (phase: CameraPhase) => void;
  onFace: (seen: boolean) => void;
  onTurn: (direction: PageTurn) => void;
  onUnavailable: () => void;
  onCalibrated: (ready: boolean) => void;
};

export class HandsFreeCamera {
  private session = 0;
  private run = 0;
  private timer = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readerPromise: Promise<FaceYawReader> | null = null;
  private gate: YawGate = createYawGate();
  private zero: number | null = null;
  private latestYaw: number | null = null;
  private lostAt: number | null = null;
  private disposed = false;
  private host: HandsFreeHost;

  constructor(host: HandsFreeHost) {
    this.host = host;
  }

  confirmCenter(): boolean {
    if (this.latestYaw === null) return false;
    this.zero = this.latestYaw;
    this.gate = createYawGate();
    this.host.onCalibrated(true);
    this.host.onPhase("on");
    return true;
  }

  recalibrate() {
    this.zero = null;
    this.latestYaw = null;
    this.gate = createYawGate();
    this.lostAt = null;
    this.host.onCalibrated(false);
    this.host.onFace(false);
    this.host.onPhase("calibrating");
  }

  stopTracks() {
    this.run += 1;
    this.clearTimer();
    this.stopStream(this.stream);
    if (this.video) this.video.srcObject = null;
  }

  pause() {
    this.stopTracks();
  }

  resume() {
    if (this.disposed) return;
    void this.start();
  }

  dispose() {
    this.disposed = true;
    this.session += 1;
    this.stopTracks();
    const pending = this.readerPromise;
    this.readerPromise = null;
    void pending?.then((pose) => pose.close()).catch(() => undefined);
    this.video?.remove();
    this.video = null;
  }

  async start() {
    if (this.disposed) return;
    const session = this.session;
    const run = ++this.run;
    this.clearTimer();
    this.stopStream(this.stream);
    this.host.onPhase("starting");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (this.stale(session, run)) {
        this.stopStream(stream);
        return;
      }
      const pose = await this.reader();
      if (this.stale(session, run)) {
        this.stopStream(stream);
        return;
      }
      const videoTrack = stream.getVideoTracks()[0];
      const facing = videoTrack?.getSettings().facingMode;
      if (!videoTrack || (facing != null && facing !== "" && facing !== "user")) {
        this.stopStream(stream);
        throw new Error("The front camera is unavailable.");
      }
      this.stream = stream;
      const video = this.ensureVideo();
      video.srcObject = stream;
      await video.play();
      if (this.stale(session, run)) {
        this.stopStream(stream);
        video.srcObject = null;
        return;
      }
      this.lostAt = null;
      this.host.onPhase("starting");
      this.timer = window.setTimeout(() => this.tick(pose, video, session, run), FRAME_MS);
    } catch {
      this.stopStream(stream);
      if (this.video?.srcObject === stream) this.video.srcObject = null;
      if (this.stale(session, run)) return;
      this.host.onUnavailable();
    }
  }

  private tick(pose: FaceYawReader, video: HTMLVideoElement, session: number, run: number) {
    if (this.stale(session, run)) return;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const scale = Math.min(1, FRAME_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = this.canvas ?? document.createElement("canvas");
      this.canvas = canvas;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, width, height);
        const now = performance.now();
        const yaw = pose.read(canvas, now);
        if (this.stale(session, run)) return;
        if (yaw === null) {
          this.latestYaw = null;
          this.host.onFace(false);
          this.lostAt ??= now;
          if (now - this.lostAt >= LOST_FACE_MS) {
            this.host.onPhase(this.zero === null ? "calibrating" : "lost");
          }
        } else {
          this.lostAt = null;
          this.latestYaw = yaw;
          this.host.onFace(true);
          if (this.zero === null) {
            this.host.onPhase("calibrating");
          } else {
            this.host.onPhase("on");
            const turn = this.gate.push(yaw - this.zero, now);
            if (turn) this.host.onTurn(turn);
          }
        }
      }
    }
    if (this.stale(session, run)) return;
    this.timer = window.setTimeout(() => this.tick(pose, video, session, run), FRAME_MS);
  }

  private reader(): Promise<FaceYawReader> {
    this.readerPromise ??= createFaceYawReader().catch((error: unknown) => {
      this.readerPromise = null;
      throw error;
    });
    return this.readerPromise;
  }

  private ensureVideo(): HTMLVideoElement {
    const existing = this.video;
    if (existing) return existing;
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.tabIndex = -1;
    video.className = "pointer-events-none fixed h-32 w-32 opacity-0";
    video.style.left = "-1000px";
    video.style.top = "0";
    document.body.appendChild(video);
    this.video = video;
    return video;
  }

  private stopStream(stream: MediaStream | null) {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    if (this.stream === stream) this.stream = null;
  }

  private clearTimer() {
    if (!this.timer) return;
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private stale(session: number, run: number) {
    return this.disposed || this.session !== session || this.run !== run;
  }
}
