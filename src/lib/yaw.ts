export const YAW_THRESHOLD_RADIANS = 0.42;
export const YAW_NEUTRAL_RADIANS = 0.15;
export const YAW_HOLD_MS = 250;
export const YAW_COOLDOWN_MS = 1000;

export type PageTurn = "next" | "previous";

type Hold = {
  direction: PageTurn;
  since: number;
};

export type YawGate = {
  push(relativeYaw: number, now: number): PageTurn | null;
};

export function createYawGate(): YawGate {
  let hold: Hold | null = null;
  let firedAt: number | null = null;

  return {
    push(relativeYaw, now) {
      if (firedAt !== null) {
        const cooledDown = now - firedAt >= YAW_COOLDOWN_MS;
        if (cooledDown && Math.abs(relativeYaw) <= YAW_NEUTRAL_RADIANS) {
          firedAt = null;
          hold = null;
        } else {
          return null;
        }
      }

      const direction = directionFor(relativeYaw);
      if (!direction) {
        hold = null;
        return null;
      }
      if (!hold || hold.direction !== direction) {
        hold = { direction, since: now };
        return null;
      }
      if (now - hold.since < YAW_HOLD_MS) return null;
      firedAt = now;
      hold = null;
      return direction;
    },
  };
}

function directionFor(relativeYaw: number): PageTurn | null {
  if (relativeYaw >= YAW_THRESHOLD_RADIANS) return "next";
  if (relativeYaw <= -YAW_THRESHOLD_RADIANS) return "previous";
  return null;
}

export function yawFromTransformationMatrix(data: ArrayLike<number>): number | null {
  if (data.length < 16) return null;
  const yaw = Math.atan2(data[8] ?? 0, data[10] ?? 1);
  return Number.isFinite(yaw) ? yaw : null;
}

type FacePoint = {
  x: number;
  z: number;
};

export function yawFromEyesAndNose(
  subjectRightEye: FacePoint,
  subjectLeftEye: FacePoint,
  nose: { x: number },
): number | null {
  const span = Math.hypot(
    subjectLeftEye.x - subjectRightEye.x,
    subjectLeftEye.z - subjectRightEye.z,
  );
  if (span < 1e-4) return null;
  const midX = (subjectLeftEye.x + subjectRightEye.x) / 2;
  const yaw = Math.atan2(midX - nose.x, span);
  return Number.isFinite(yaw) ? yaw : null;
}
